'use client';

import { create } from 'zustand';
import { format } from 'date-fns';
import { usePlannerStore } from './planner-store';
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

  request: (intent: ProposalIntent, prompt?: string) => Promise<void>;
  /** Apply through the planner store (one set, one undo) and clear the card. */
  accept: () => number;
  dismiss: () => void;
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

function plannerContext() {
  const { items, itemTypes } = usePlannerStore.getState();
  return { items, customTypeNames: itemTypes.map((t) => t.name), todayStr: todayStr() };
}

function stamp(draft: { summary: string; rationale?: string; operations: Proposal['operations'] }): Proposal {
  return { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}

export const useProposalStore = create<ProposalStore>()((set, get) => ({
  proposal: null,
  status: 'idle',
  error: null,
  emptyMessage: null,

  request: async (intent, prompt) => {
    set({ status: 'loading', error: null, emptyMessage: null, proposal: null });
    const ctx = plannerContext();

    // Catch-up is computed locally: it works with no key, no gateway and no
    // network, which is the whole point — the feature that matters most on the
    // worst day should not depend on a provider being reachable.
    if (intent === 'catch-up') {
      const draft = buildCatchUpProposal(ctx);
      if (!draft) {
        set({ status: 'empty', emptyMessage: "Nothing's waiting on you. Enjoy it." });
        return;
      }
      const { proposal } = validateProposal(stamp(draft), ctx);
      set({ proposal, status: proposal.operations.length ? 'ready' : 'empty' });
      return;
    }

    const { provider } = useAISettingsStore.getState();
    if (!resolveAICapabilities(provider).canPropose) {
      set({ status: 'error', error: 'Connect an AI assistant in Settings to ask for a plan.' });
      return;
    }

    try {
      const res = await fetch('/api/ai/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
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
  },

  accept: () => {
    const { proposal } = get();
    if (!proposal) return 0;
    const applied = usePlannerStore.getState().applyProposal(proposal);
    set({ proposal: null, status: 'idle', error: null, emptyMessage: null });
    return applied;
  },

  dismiss: () => set({ proposal: null, status: 'idle', error: null, emptyMessage: null }),
}));
