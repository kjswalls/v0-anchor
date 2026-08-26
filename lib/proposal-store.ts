'use client';

import { create } from 'zustand';
import { format } from 'date-fns';
import { usePlannerStore } from './planner-store';
import { inactiveItemIdsOn } from './active';
import { useAISettingsStore } from './ai-settings-store';
import { resolveAICapabilities } from './ai-registry';
import { buildCatchUpProposal, buildProposalContext, validateProposal } from './proposal';
import type { Proposal } from './planner-types';

/**
 * proposal-store.ts — the AI's pending suggestion, and the user's one tap.
 *
 * Deliberately ephemeral: a proposal is a moment's suggestion about a plan that
 * is already changing underneath it, and a stale card resurrected on next
 * launch ("move these 5 things to last Tuesday") is worse than no card. The
 * planner is the durable thing; this is not. Persisting proposals would need a
 * table, a staleness policy, and cross-device reconciliation — see
 * memory/plans/ai-vision.md.
 */

export type ProposalIntent = 'catch-up' | 'ask';
export type ProposalStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface ProposalStore {
  proposal: Proposal | null;
  status: ProposalStatus;
  /** Set when status is 'error' — shown on the card, never thrown. */
  error: string | null;
  /** Copy for the 'empty' state, which is good news and should read like it. */
  emptyMessage: string | null;
  /**
   * What produced the current card, so it can be asked again — the ORIGINAL
   * ask, never the retry-decorated one, or each retry would compound the last.
   */
  lastRequest: { intent: ProposalIntent; prompt?: string } | null;
  /** Summaries offered and turned down this round, newest last. */
  rejected: string[];

  request: (intent: ProposalIntent, prompt?: string) => Promise<void>;
  /**
   * Ask again, telling the model what it already offered.
   *
   * "Not now" is a dead end — it closes the card and leaves the user exactly
   * where they started. Most of the time the plan is not wrong, it is not
   * quite right, and the cheapest fix is another go.
   */
  retry: () => Promise<void>;
  /**
   * Apply through the planner store (one set, one undo) and clear the card.
   *
   * `operations` narrows to a subset the user ticked: a plan is easier to say
   * yes to when four of its five lines are right and the fifth can just be
   * dropped, rather than costing the whole card.
   */
  accept: (operations?: Proposal['operations']) => number;
  dismiss: () => void;
}

/** Enough for the model to see the pattern; not enough to crowd out the ask. */
const MAX_REJECTED_CARRIED = 3;

/** The ask, plus whatever has already been turned down. */
function withRejections(prompt: string | undefined, rejected: string[]): string {
  const base = prompt?.trim() || 'Suggest a realistic plan for today.';
  if (rejected.length === 0) return base;
  return [
    base,
    '',
    'Already suggested and turned down — offer something meaningfully different, not a reworded version of these:',
    ...rejected.slice(-MAX_REJECTED_CARRIED).map((summary) => `- ${summary}`),
  ].join('\n');
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

function plannerContext() {
  const state = usePlannerStore.getState();
  const today = todayStr();
  return {
    items: state.items,
    customTypeNames: state.itemTypes.map((t) => t.name),
    todayStr: today,
    // Work a routine or program has paused today is not "waiting on you" — the
    // same rule the auto-age sweep and the past-due bar obey.
    inactiveIds: inactiveItemIdsOn(state.items, today, {
      // Same fallback the store uses everywhere it needs a zone.
      userTimezone: state.userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      routines: state.routines,
      programs: state.programs,
    }),
  };
}

function stamp(draft: { summary: string; rationale?: string; operations: Proposal['operations'] }): Proposal {
  return { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}

/**
 * Cleared card, cleared retry history — where `dismiss` and `accept` land.
 *
 * A function, not a constant: it hands back a fresh `rejected` array each time
 * rather than sharing one across every reset.
 */
const cleared = (): Partial<ProposalStore> => ({
  proposal: null,
  status: 'idle',
  error: null,
  emptyMessage: null,
  lastRequest: null,
  rejected: [],
});

export const useProposalStore = create<ProposalStore>()((set, get) => {
  /**
   * Everything from the tier check to the validated card.
   *
   * Shared by `request('ask')` and `retry()` so the two cannot drift — and so
   * retry is genuinely the same call with a different prompt, rather than a
   * second copy of the fetch that will one day be updated alone.
   */
  async function askModel(promptForModel: string): Promise<void> {
    const { provider } = useAISettingsStore.getState();
    if (!resolveAICapabilities(provider).canPropose) {
      set({ status: 'error', error: 'Connect an AI assistant in Settings to ask for a plan.' });
      return;
    }

    const ctx = plannerContext();

    try {
      const res = await fetch('/api/ai/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptForModel,
          provider,
          apiKey: useAISettingsStore.getState().apiKey,
          model: useAISettingsStore.getState().model,
          itemContext: buildProposalContext(ctx),
          todayStr: ctx.todayStr,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.proposal) {
        set({ status: 'empty', emptyMessage: data.message ?? 'No changes to suggest.' });
        return;
      }

      // Validate against the CURRENT planner, not the one the request was built
      // from — the user may have edited things while the model was thinking.
      const { proposal } = validateProposal(stamp(data.proposal), plannerContext());
      set(
        proposal.operations.length
          ? { proposal, status: 'ready' }
          : { status: 'empty', emptyMessage: 'Those suggestions no longer apply.' }
      );
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Could not reach the assistant.',
      });
    }
  }

  return {
    proposal: null,
    status: 'idle',
    error: null,
    emptyMessage: null,
    lastRequest: null,
    rejected: [],

    request: async (intent, prompt) => {
      set({
        status: 'loading',
        error: null,
        emptyMessage: null,
        proposal: null,
        // The original ask, kept verbatim so retries decorate it rather than
        // stacking on each other's decoration.
        lastRequest: { intent, prompt },
        rejected: [],
      });

      // Catch-up is computed locally: it works with no key, no gateway and no
      // network, which is the whole point — the feature that matters most on the
      // worst day should not depend on a provider being reachable.
      if (intent === 'catch-up') {
        const ctx = plannerContext();
        const draft = buildCatchUpProposal(ctx);
        if (!draft) {
          set({ status: 'empty', emptyMessage: "Nothing's waiting on you. Enjoy it." });
          return;
        }
        const { proposal } = validateProposal(stamp(draft), ctx);
        set({ proposal, status: proposal.operations.length ? 'ready' : 'empty' });
        return;
      }

      await askModel(withRejections(prompt, []));
    },

    retry: async () => {
      const { proposal, lastRequest, rejected } = get();
      // Catch-up is a pure function of the planner: asking it again returns the
      // same items in the same order. Only a model-backed ask has a different
      // answer in it, so only that one may offer a retry.
      if (!lastRequest || lastRequest.intent !== 'ask') return;

      const summary = proposal?.summary?.trim();
      const nextRejected = summary ? [...rejected, summary] : rejected;

      set({
        status: 'loading',
        error: null,
        emptyMessage: null,
        proposal: null,
        rejected: nextRejected,
      });
      await askModel(withRejections(lastRequest.prompt, nextRejected));
    },

    accept: (operations) => {
      const { proposal } = get();
      if (!proposal) return 0;
      const chosen = operations ?? proposal.operations;
      // Ticking every line off is a dismissal, not an acceptance of nothing.
      if (chosen.length === 0) return 0;
      const applied = usePlannerStore
        .getState()
        .applyProposal({ ...proposal, operations: chosen });
      set(cleared());
      return applied;
    },

    dismiss: () => set(cleared()),
  };
});
