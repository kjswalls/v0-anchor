'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { CategoryIcon } from '@/lib/category-icons';
import { accentColorForName } from '@/lib/accent-colors';
import { usePlannerStore } from '@/lib/planner-store';
import { listDeleted, type TrashEntry, type TrashKind } from '@/lib/db';
import { matching } from '@/lib/collections';
import { DetailColumn, ListColumn, TeachingLine } from '../detail-parts';

/**
 * TRASH — the last thirty days, and the only way back out of them.
 *
 * The one section that is NOT a view over planner-store. Everything else in the
 * console reads arrays the app already holds; the bin holds rows the store
 * deliberately never loads (every fetch filters `deleted_at is null`), so it
 * gets its own hook and its own fetch.
 *
 * THE BIN MUST NOT ENTER THE STORE, and this is law rather than tidiness.
 * `saveToHistory` snapshots five slices, and `applyHistoryState` reads "present
 * in current, absent in restored" as a DELETE — so a soft-deleted row parked in
 * `projects` would be soft-deleted AGAIN by the next ⌘Z, restamping
 * `deleted_at` and silently resetting its 30-day purge clock. Redo is worse: it
 * would un-delete rows the user never restored. Keeping the bin in a local hook
 * makes all of that unreachable rather than merely unlikely.
 *
 * It is also the only HETEROGENEOUS list in the console — five tables in one
 * column — which is why its row is its own component rather than ObjectRow. A
 * trash row has no selection, no count and no pill; it has a kind, a date and
 * exactly one verb.
 */

/* ── the hook ─────────────────────────────────────────────────────────── */

/**
 * The bin, fetched once per arrival.
 *
 * No polling and no refetch-on-focus: this is a thirty-day window on a
 * single-user planner, and the only thing that changes it while it is open is
 * the user's own restore, which is applied locally. Radix unmounts an inactive
 * tabpanel's subtree and Radix Dialog renders nothing while closed, so "per
 * arrival" is what mounting this component already means — no gate needed.
 */
function useTrash(userId: string | null) {
  const [bin, setBin] = useState<{ entries: TrashEntry[] | null; failed: boolean }>({
    entries: null,
    failed: false,
  });

  // Reset on an account switch during render rather than in the effect — the
  // codebase's "adjusting state when a prop changes" pattern (BufferedInput,
  // useNameDraft). An effect would paint one frame of the PREVIOUS account's
  // bin, and this is the one list where a row from the wrong account is also a
  // restore button for it.
  const [lastUser, setLastUser] = useState(userId);
  if (lastUser !== userId) {
    setLastUser(userId);
    setBin({ entries: null, failed: false });
  }

  useEffect(() => {
    if (!userId) return;
    let live = true;
    listDeleted(userId)
      .then((rows) => {
        if (live) setBin({ entries: rows, failed: false });
      })
      .catch((error) => {
        console.error('trash fetch failed', error);
        // A failed fetch SAYS SO. The alternative — rendering an empty list —
        // tells someone hunting for a deleted routine that it is gone for good,
        // which is the one wrong answer this surface can give.
        if (live) setBin({ entries: null, failed: true });
      });
    return () => {
      live = false;
    };
  }, [userId]);

  /** Drop a row locally once it is back — the fetch is not repeated. */
  const forget = useCallback((id: string, kind: TrashKind) => {
    setBin((prev) =>
      prev.entries
        ? { ...prev, entries: prev.entries.filter((r) => !(r.id === id && r.kind === kind)) }
        : prev
    );
  }, []);

  return { entries: bin.entries, failed: bin.failed, forget };
}

/* ── the section ──────────────────────────────────────────────────────── */

export function TrashSection() {
  const userId = usePlannerStore((s) => s.userId);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const restoreFromTrash = usePlannerStore((s) => s.restoreFromTrash);
  const { entries, failed, forget } = useTrash(userId);
  const [query, setQuery] = useState('');

  const visible = matching(entries ?? [], query, (e) => `${e.name} ${KIND_LABEL[e.kind]}`);

  return (
    <>
      <ListColumn
        eyebrow="TRASH"
        count={visible.length}
        // Nothing to select into, so the detail pane is the teaching line
        // permanently — which also keeps the mobile drill-in from ever landing
        // on an empty right column.
        hasSelection={false}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: 'Filter trash…',
          testId: 'trash-filter',
        }}
        // A failure and a still-loading bin both render zero rows, and neither
        // means "nothing matches your search". Only a LOADED bin may answer the
        // filter's question.
        suppressNoMatch={entries === null}
      >
        {failed ? (
          <p className="text-muted-foreground px-[7px] pt-2 text-xs" data-testid="trash-failed">
            Couldn&apos;t load the trash just now. Close and reopen to try again.
          </p>
        ) : entries === null ? (
          // Not a spinner: the layout law says the empty and populated states
          // are the same layout with rows missing, and a centred spinner is a
          // third shape that makes the pane jump twice.
          <p className="text-muted-foreground px-[7px] pt-2 text-xs">Looking…</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground px-[7px] pt-2 text-xs" data-testid="trash-empty">
            Nothing deleted in the last 30 days.
          </p>
        ) : (
          visible.map((entry) => (
            <TrashRow
              key={`${entry.kind}:${entry.id}`}
              entry={entry}
              onRestore={() => {
                restoreFromTrash(entry);
                forget(entry.id, entry.kind);
              }}
              disabled={!userId || isLoading}
            />
          ))
        )}
      </ListColumn>

      <DetailColumn hasSelection={false}>
        <TeachingLine>
          Anything you delete waits here for 30 days, then goes for good.
        </TeachingLine>
        {/* The one thing a bin has to say that its rows cannot: what ⌘Z will do
            after you press Restore. Decision 3 made restore a normal history
            entry precisely so the answer is the ordinary one. */}
        {/* "Members and all" was an overclaim and the review caught it: a
            restored project reconnects the items still pointing at it by ID,
            which is every item filed since migration 027 but NOT the older
            name-only references, and those come back on the next reload rather
            than in session. So the sentence promises what the row can show. */}
        <p className="text-muted-foreground mt-3 max-w-[46ch] text-xs">
          Restoring puts something back where it was, along with whatever the row says comes
          with it. ⌘Z after a restore sends it back here.
        </p>
      </DetailColumn>
    </>
  );
}

/* ── the row ──────────────────────────────────────────────────────────── */

const KIND_LABEL: Record<TrashKind, string> = {
  item: 'Item',
  project: 'Project',
  routine: 'Routine',
  program: 'Program',
  goal: 'Goal',
};

/**
 * A trash row: glyph, name, what it was, when it went, and Restore.
 *
 * NOT ObjectRow, and the reasons are structural rather than stylistic.
 * ObjectRow's root IS the `<button>` — nesting the Restore control inside it
 * would be invalid HTML — and its whole contract (select, selected, pill,
 * count) is meaningless here. This row's only interactive element is the verb.
 *
 * THE KIND IS SPELLED OUT, not encoded in the glyph. Every other section in the
 * console is homogeneous, so its column header names the kind for every row at
 * once; this one is not. A name-hashed CategoryIcon carries no kind information
 * whatsoever, so a trashed task and a trashed project called "Reading" would be
 * pixel-identical — and ⌘Z after restoring the wrong one is not a recovery.
 *
 * The Restore button is always visible, never hover-revealed. This is the one
 * named exception to the console's no-per-row-actions rule, and the exception
 * exists because there is nothing to select into: hiding the only path to the
 * only verb behind a hover is the anti-pattern, and it would put a recovery
 * feature out of reach of touch and keyboard entirely.
 */
function TrashRow({
  entry,
  onRestore,
  disabled,
}: {
  entry: TrashEntry;
  onRestore: () => void;
  disabled?: boolean;
}) {
  const children = entry.children?.length ?? 0;
  const members = entry.memberIds?.length ?? 0;

  return (
    <div
      data-testid="trash-row"
      data-trash-kind={entry.kind}
      data-trash-id={entry.id}
      className="group flex min-h-[34px] w-full items-center gap-[9px] rounded-[5px] px-[7px] py-1 hover:bg-accent"
    >
      <span
        className="flex w-[18px] shrink-0 justify-center"
        style={{ color: entry.color ?? accentColorForName(entry.name) }}
      >
        <CategoryIcon glyph={entry.icon} name={entry.name} className="h-3.5 w-3.5 shrink-0 text-current" />
      </span>

      <span className="min-w-0 flex-1">
        <span title={entry.name} className="text-foreground block truncate text-sm font-medium">
          {entry.name}
        </span>
        <span className="text-muted-foreground block truncate text-2xs">
          {KIND_LABEL[entry.kind]}
          {/* What comes back WITH it, said before the click rather than
              discovered after. Both are things the user cannot see from the
              row's name and would be surprised by either way round. */}
          {children > 0 && ` · ${children} ${children === 1 ? 'subtask' : 'subtasks'}`}
          {members > 0 && ` · ${members} ${members === 1 ? 'item' : 'items'} refile`}
          {' · '}
          <span className="font-num">{whenGone(entry.deletedAt)}</span>
        </span>
      </span>

      <button
        type="button"
        onClick={onRestore}
        disabled={disabled}
        // The filter's ArrowDown target. `data-organize-row` is looked up with
        // querySelector at any depth inside the list, so putting it on the verb
        // rather than a row root keeps `/ type ↓ ↵` working AND makes Enter do
        // the only thing a trash row can do.
        data-organize-row=""
        data-testid="trash-restore"
        // The KIND is in the accessible name too, for the same reason it is on
        // the row: this is the one list that mixes kinds, so a trashed task and
        // a trashed project both called "Reading" would otherwise present two
        // buttons reading "Restore Reading" — and a screen-reader user would be
        // choosing between them blind, on the one surface where picking the
        // wrong one cannot be taken back by looking.
        aria-label={`Restore ${KIND_LABEL[entry.kind].toLowerCase()} ${entry.name}`}
        className="border-border text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-ring flex h-[22px] shrink-0 items-center gap-1 rounded-[5px] border px-2 text-xs disabled:opacity-40 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-solid"
      >
        <RotateCcw className="h-3 w-3" />
        Restore
      </button>
    </div>
  );
}

/**
 * How long ago, in the words a bin needs.
 *
 * Days rather than a date, because the only question a trash row has to answer
 * is "how much of my thirty days is left" — and "Aug 3" makes the reader do
 * that subtraction themselves. Rounded DOWN from the elapsed milliseconds, so
 * something deleted twenty-five hours ago reads "1d" rather than "2d" and the
 * count never runs ahead of the purge.
 */
export function whenGone(deletedAt: string, now = Date.now()): string {
  const elapsed = now - new Date(deletedAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'just now';
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
