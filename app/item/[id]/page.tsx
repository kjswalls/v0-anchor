'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft, Moon, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ItemDialogState } from '@/components/planner/item-dialog';
import {
  ItemDetailSections,
  ItemThread,
} from '@/components/planner/item-detail-sections';
import { usePlannerStore } from '@/lib/planner-store';
import { getItemTypeConfig, itemTypeName } from '@/lib/item-registry';
import { suppressionReason, suppressionLabel } from '@/lib/active';
import { toDateStr } from '@/lib/recurrence';
import { cn } from '@/lib/utils';

/**
 * The item page — stage 3 of the surface (dialog → panel → page,
 * memory/plans/item-surface-growth.md). A deep-linkable route for when the
 * item IS the work: properties and subtasks on the left, the thread on the
 * right. Property editing stays in the panel (the Edit button opens the same
 * ItemDialog this page mounts locally — the shell's instance lives in
 * AppShell, which this route deliberately doesn't render).
 *
 * Auth follows the app's client-side model: the root layout's
 * SupabaseProvider hydrates the store when a session exists; without one this
 * page simply has no items and shows the not-found state with a sign-in link.
 */

/* ── The editor, deferred until Edit is pressed ────────────────────────────
   ItemDialog is the app's largest single component and it drags react-day-picker
   in behind it (the start-date field). Deferring it takes 90.3 kB gzip off this
   route's first load (396,875 → 306,564 bytes: clean production builds of both
   commits, the route's own script tags, shared chunks deduped, gzip -9) — for a
   panel that opens on a button press and is closed on arrival every time. What
   is left is 7.8 kB above /ledger, the lightest route in the app and so the
   nearest thing to the baseline every route pays. /ledger itself moved +210
   bytes across the same pair of builds, which is the noise floor these deltas
   sit on.

   `ssr: false` because the panel renders nothing while closed, and the page it
   sits on has no session server-side to render an item from anyway.

   MOUNTED ON FIRST OPEN AND KEPT, never unmounted on close: next/dynamic
   fetches the chunk when the component first RENDERS, so leaving it mounted at
   `state={null}` would download it on page load and split nothing. `everOpened`
   below is that latch, and the DOWNLOAD is its whole justification — there is
   no exit animation here to protect: `presentation="panel"` hard-returns null
   while closed (see SurfaceContent, whose own note says the e2e suite asserts
   the surface reaches count 0 after a close). Unmounting on close would defer
   the download just as well — `{editState && …}` needs no latch at all — and is
   not chosen only because the app's other two ItemDialogs live mounted for the
   whole session (see the trashed-names fetch inside it, gated on `state` for
   exactly that reason), so this one matches them rather than inventing a third
   lifecycle. */
const ItemDialog = dynamic(
  () => import('@/components/planner/item-dialog').then((m) => m.ItemDialog),
  { ssr: false }
);

function Square({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('inline-block size-[9px] shrink-0 rounded-[3px]', className)}
      style={{ background: color }}
      aria-hidden
    />
  );
}

function StaticChip({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="bg-secondary text-foreground inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs"
    >
      {children}
    </span>
  );
}

export default function ItemPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  /* Field selectors, not the whole store. `usePlannerStore()` bare subscribes
     to the store OBJECT, which zustand replaces on EVERY set(), so this page
     re-rendered its whole thread on any planner mutation anywhere in the app.
     Said honestly: no such tick was found reaching this route while it sits
     idle. The obvious candidate is not one — hover writes go to a module ref
     (lib/hovered-item.ts), planner-store's `setHoveredItem` has no caller left
     in the repo, and SubtasksSection renders its own rows rather than TaskRow.
     So this is not a fix for an observed stall; it is a narrowing that is
     correct and free, on a page whose only live input is one item. Selecting
     the item itself rather than `items` narrows it further: `find` returns the
     same object identity until that one row actually changes. */
  const item = usePlannerStore((s) => s.items.find((i) => i.id === id));
  const userId = usePlannerStore((s) => s.userId);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const getProjectColor = usePlannerStore((s) => s.getProjectColor);
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const routines = usePlannerStore((s) => s.routines);
  const programs = usePlannerStore((s) => s.programs);
  const [editState, setEditState] = useState<ItemDialogState | null>(null);
  // Latched on the first Edit press — see the note on the dynamic import.
  const [everOpened, setEverOpened] = useState(false);
  const openEditor = useCallback((next: ItemDialogState) => {
    setEverOpened(true);
    setEditState(next);
  }, []);

  if (!item) {
    // initializeStore stamps userId BEFORE the items fetch resolves, so
    // "signed in" alone doesn't mean "loaded" — without the isLoading check a
    // valid deep link flashes the not-found copy for the whole fetch.
    const settled = !!userId && !isLoading;
    return (
      <main className="mx-auto flex max-w-lg flex-col items-start gap-4 px-6 py-16">
        <h1 className="text-foreground text-lg font-semibold">
          {settled ? 'Item not found' : 'Loading…'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {settled
            ? 'It may have been deleted, or the link is from another account.'
            : 'If nothing loads, you may need to sign in.'}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/">Open Anchor</Link>
          </Button>
          {!userId && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/login?redirect=${encodeURIComponent(`/item/${id ?? ''}`)}`}>
                Sign in
              </Link>
            </Button>
          )}
        </div>
      </main>
    );
  }

  const config = getItemTypeConfig(itemTypeName(item));
  // Resolved at TODAY, never at a navigated date — pausing is dateless
  // (plan decision 3), and this page has no date to navigate anyway. Without
  // it the header below asserts a startDate and a bucket for an item that is
  // on no grid column, and nothing on the page says why.
  const activationTz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // The full reason, not just the item's own pause: a member of a paused
  // routine or an out-of-season program is equally absent from every grid
  // column, and this page's header otherwise asserts a startDate and a bucket
  // with nothing explaining why.
  const activationReason = suppressionReason(item, toDateStr(new Date(), activationTz), {
    userTimezone: activationTz,
    routines,
    programs,
  });
  // One CLASSIFY axis (039) — no type test, one getter.
  const container = item.project;
  const containerColor = container ? getProjectColor(container) : undefined;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
      <nav className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Link
          href="/"
          className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          Anchor
        </Link>
        <span>/</span>
        <span className="text-foreground inline-flex items-center gap-1.5 font-medium">
          <Square color={config.accent} />
          {config.label}
        </span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1
            className={cn(
              'text-foreground text-2xl font-semibold tracking-tight text-balance',
              item.status === 'completed' && 'text-muted-foreground line-through'
            )}
          >
            {item.title}
          </h1>
          <Button
            variant="outline"
            size="sm"
            data-testid="item-page-edit"
            onClick={() => openEditor({ mode: 'edit', item })}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* First in the row, ahead of the date and bucket chips it qualifies.
              Muted, never a warning color — paused is not an error state. */}
          {activationReason && (
            <StaticChip testId="item-page-paused-note">
              <Moon className="size-3.5 shrink-0" aria-hidden />
              {suppressionLabel(activationReason)}
            </StaticChip>
          )}
          {item.type !== 'habit' && item.priority && (
            <StaticChip>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: `var(--priority-${item.priority})` }}
                aria-hidden
              />
              <span className="capitalize">{item.priority}</span>
            </StaticChip>
          )}
          {container && (
            <StaticChip>
              {containerColor && <Square color={containerColor} />}
              <span className={cn(item.type === 'habit' && 'capitalize')}>{container}</span>
            </StaticChip>
          )}
          {item.type !== 'habit' && item.startDate && <StaticChip>{item.startDate}</StaticChip>}
          {item.timeBucket && (
            <StaticChip>
              <span className="capitalize">{item.timeBucket}</span>
              {item.startTime ? ` · ${item.startTime}` : ''}
              {item.duration ? ` · ${item.duration}m` : ''}
            </StaticChip>
          )}
        </div>

        {item.notes && (
          <p className="text-muted-foreground max-w-prose text-sm leading-relaxed whitespace-pre-wrap">
            {item.notes}
          </p>
        )}
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <ItemDetailSections item={item} />
        <ItemThread item={item} className="lg:border-border lg:border-l lg:pl-6" />
      </div>

      {/* The same docked panel the shell uses, not a modal: a modal here would
          make the page's own subtasks and thread inert behind an invisible
          overlay (edit mode drops the scrim, so nothing would explain why).
          withDetailSections={false} because those sections are already on the
          page — the panel beside them must not mount a second live copy. */}
      {everOpened && (
        <div className="fixed inset-y-3 right-3 z-30">
          <ItemDialog
            presentation="panel"
            state={editState}
            withDetailSections={false}
            onOpenChange={(open) => !open && setEditState(null)}
          />
        </div>
      )}
    </main>
  );
}
