'use client';

import { useMemo } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProposalStore } from '@/lib/proposal-store';
import { usePlannerStore } from '@/lib/planner-store';
import { describeOperation } from '@/lib/proposal';
import { cn } from '@/lib/utils';

/**
 * The proposal card — the core interaction grammar of the whole product: the AI
 * suggests, you accept with one tap (memory/plans/ai-vision.md).
 *
 * Copy contract, same as BarCopy in morning-check.tsx and the "Still waiting"
 * heading in item-registry.ts: nothing here tells the user what they failed to
 * do. Lines say where things land, the dismiss verb is "Not now" (a deferral,
 * not a refusal), and the empty state is good news rather than an absence.
 */
export function ProposalCard({ className }: { className?: string }) {
  const proposal = useProposalStore((s) => s.proposal);
  const status = useProposalStore((s) => s.status);
  const error = useProposalStore((s) => s.error);
  const emptyMessage = useProposalStore((s) => s.emptyMessage);
  const accept = useProposalStore((s) => s.accept);
  const dismiss = useProposalStore((s) => s.dismiss);

  const items = usePlannerStore((s) => s.items);
  const itemTypes = usePlannerStore((s) => s.itemTypes);

  const lines = useMemo(() => {
    if (!proposal) return [];
    const ctx = { items, customTypeNames: itemTypes.map((t) => t.name) };
    return proposal.operations.map((operation, index) => ({
      key: `${index}`,
      text: describeOperation(operation, ctx),
    }));
  }, [proposal, items, itemTypes]);

  if (status === 'idle') return null;

  const shell = cn(
    'rounded-xl border border-border bg-surface-2 p-3 shadow-soft-sm',
    className
  );

  if (status === 'loading') {
    return (
      <div className={shell} data-testid="proposal-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Thinking it through…
        </div>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className={shell} data-testid="proposal-card">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="flex-1 text-sm text-foreground">{emptyMessage}</p>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={dismiss}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={shell} data-testid="proposal-card">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm text-muted-foreground">{error}</p>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={dismiss}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  return (
    <div className={shell} data-testid="proposal-card">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{proposal.summary}</p>
          {proposal.rationale && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {proposal.rationale}
            </p>
          )}
        </div>
      </div>

      {/* Plain overflow container, not <ScrollArea> — the Radix wrapper silently
          drops max-h, and this list has to stay capped. */}
      <ul className="mt-2.5 max-h-48 space-y-1 overflow-y-auto pl-6">
        {lines.map((line) => (
          <li key={line.key} className="flex gap-1.5 text-xs text-foreground/90">
            <span aria-hidden className="select-none text-muted-foreground">
              •
            </span>
            <span className="min-w-0 flex-1">{line.text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2 pl-6">
        <Button size="sm" className="h-7 px-3 text-xs" onClick={() => accept()}>
          {proposal.operations.length === 1 ? 'Do it' : 'Do all of it'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={dismiss}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
