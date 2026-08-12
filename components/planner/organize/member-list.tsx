'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CategoryIcon } from '@/lib/category-icons';
import { usePlannerStore } from '@/lib/planner-store';
import { isCollectible } from '@/lib/item-registry';
import { countLive, swapMembers, useLiveItemIds } from '@/lib/collections';
import { Eyebrow } from './primitives';
import { inActiveSection, useEscapeRung } from './escape-ladder';
import { cn } from '@/lib/utils';
import type { Item, Routine } from '@/lib/planner-types';

/**
 * The member lists inside the Organize console's detail pane.
 *
 * MOVED, NOT REWRITTEN (memory/plans/organize-console.md, Phase 2). Every
 * data-testid travels verbatim, because Phase 2's acceptance criterion is that
 * `tests/e2e/programs.spec.ts` and `scope-rail.spec.ts` run UNCHANGED. The
 * geometry is re-cut to console scale (30px rows, 5px radii, a reserved control
 * rail) but no behaviour changes here.
 *
 * Two things deliberately NOT done yet, both Phase 5: the type glyph and meta
 * column on member rows, and the picker rewrite (browse on empty query, a
 * visible ↑/↓ cursor, staying open after an add).
 */

/* ── the row's shared control rail ────────────────────────────────────── */

/**
 * Hidden until hover or focus above `md`, unconditionally visible below it.
 *
 * The console is a bottom SHEET on a phone, where there is no hover and no
 * prior focus — reordering was the one thing group-by-routine shipped to make
 * observable, and on a phone it was two invisible targets you had to guess at.
 *
 * 24px boxes with a gap, not bare 14px glyphs touching each other: two adjacent
 * sub-24px targets are a mis-tap away from swapping in the wrong direction, and
 * the write goes straight to the DB.
 */
function ControlRail({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-[72px] shrink-0 items-center justify-end gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
      {children}
    </div>
  );
}

function RailButton({
  onClick,
  label,
  testId,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  testId: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // aria-disabled, NOT disabled. A real `disabled` at the end of the list
      // drops focus to the body the moment the last press lands it there, and
      // `focus-within` then fades the pair out — so a keyboard user walking a
      // member down loses their place and has to tab from the top of the plate.
      // The handler guards instead.
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onClick()}
      aria-label={label}
      data-testid={testId}
      className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-6 w-6 items-center justify-center rounded-[4px] aria-disabled:pointer-events-none aria-disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* ── items ────────────────────────────────────────────────────────────── */

export function ItemMemberList({
  ownerId,
  ownerName,
  memberIds,
  members,
  dimmed,
  testPrefix,
  orderable = false,
  onChange,
}: {
  /** Only used to disarm the search when the selection changes. */
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  members: Item[];
  dimmed: boolean;
  testPrefix: string;
  /**
   * Routines only, and not a taste call: `routine_items` carries a `sort_order`
   * column (written from the array index by reconcileMembership) and
   * `program_items` does not. Offering the controls on a program would let the
   * user arrange an order that survives until the next fetch and then silently
   * reshuffles.
   */
  orderable?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const items = usePlannerStore((s) => s.items);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // The two-pane layout never remounts this component — it swaps the props
  // under it — so without this an open search box AND its typed query survive a
  // click on a different container, and Enter adds the top match to whichever
  // one is selected NOW. A silent write to the wrong owner.
  //
  // Adjusted during render, not in an effect: an effect paints one frame with
  // the PREVIOUS owner's query still in the box, and that frame is live — the
  // candidate list under it is already resolved against the new owner, so a fast
  // Enter lands the old query's top match on the new container.
  const [lastOwnerId, setLastOwnerId] = useState(ownerId);
  if (ownerId !== lastOwnerId) {
    setLastOwnerId(ownerId);
    setAdding(false);
    setQuery('');
  }

  const add = (id: string) => {
    onChange([...memberIds, id]);
    setQuery('');
    setAdding(false);
  };

  // Rung: close the search before the plate. The active-section guard is
  // belt-and-braces — see inActiveSection for why it is worth keeping even
  // though Radix does not mount inactive panels today.
  useEscapeRung(() => {
    if (!adding || !inActiveSection(rootRef.current)) return false;
    setAdding(false);
    setQuery('');
    return true;
  });

  const q = query.trim().toLowerCase();
  const candidates = q
    ? items
        .filter(
          (i) => isCollectible(i) && !memberIds.includes(i.id) && i.title.toLowerCase().includes(q)
        )
        .slice(0, 6)
    : [];

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5">
      <div className="flex h-[22px] items-center">
        <Eyebrow>
          {members.length} {members.length === 1 ? 'item' : 'items'}
        </Eyebrow>
      </div>

      {/* Plain overflow-y-auto: <ScrollArea> silently drops max-h. */}
      <div className="max-h-44 space-y-px overflow-y-auto">
        {members.length === 0 && (
          <p className="text-muted-foreground px-[7px] py-1 text-xs">Nothing in here yet.</p>
        )}
        {members.map((item, i) => (
          <div
            key={item.id}
            data-testid={`${testPrefix}-member`}
            data-item-id={item.id}
            data-member-index={i}
            className="hover:bg-accent group flex h-[30px] items-center gap-[9px] rounded-[5px] px-[7px]"
          >
            {/* Greyed while the container is off, NOT struck through — struck
                through means done, and this isn't done, it's set aside. */}
            <span
              title={item.title}
              className={cn(
                'font-content text-content min-w-0 flex-1 truncate',
                dimmed ? 'text-muted-foreground' : 'text-foreground'
              )}
            >
              {item.title}
            </span>

            {/* Buttons, not drag. The console renders inside the shell's
                DndContext, so a sortable list here would need a nested one and
                would compete with the item-drag sensors for the same pointer.
                Two buttons are also the only version a keyboard can reach.

                Swaps by ID, never by index: `members` drops ids that name a
                TRASHED item (join rows survive an item's soft delete by
                design), so visible position and array position diverge the
                moment one member is in the bin. */}
            <ControlRail>
              {orderable && (
                <>
                  <RailButton
                    onClick={() => onChange(swapMembers(memberIds, item.id, members[i - 1].id))}
                    disabled={i === 0}
                    label={`Move ${item.title} up in ${ownerName}`}
                    testId={`${testPrefix}-member-up`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </RailButton>
                  <RailButton
                    onClick={() => onChange(swapMembers(memberIds, item.id, members[i + 1].id))}
                    disabled={i === members.length - 1}
                    label={`Move ${item.title} down in ${ownerName}`}
                    testId={`${testPrefix}-member-down`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </RailButton>
                </>
              )}
              <RailButton
                onClick={() => onChange(memberIds.filter((m) => m !== item.id))}
                label={`Remove ${item.title} from ${ownerName}`}
                testId={`${testPrefix}-member-remove`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </RailButton>
            </ControlRail>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="flex flex-col gap-1">
          <Input
            autoFocus
            placeholder="Find an item…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && candidates[0]) add(candidates[0].id);
            }}
            className="bg-background border-border h-8"
            data-testid={`${testPrefix}-member-search`}
          />
          {candidates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => add(item.id)}
              data-testid={`${testPrefix}-member-candidate`}
              data-item-id={item.id}
              className="hover:bg-accent flex h-8 items-center rounded-[5px] px-[7px] text-left text-sm"
            >
              <span className="truncate">{item.title}</span>
            </button>
          ))}
          {/* Inside the list, never a replacement screen, so ↑/↓/↵ keep meaning
              something and the field keeps focus. */}
          {q && candidates.length === 0 && (
            <p className="text-muted-foreground px-[7px] py-1 text-xs">
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-8 items-center gap-2 self-start rounded-[5px] px-[7px] text-sm"
          data-testid={`${testPrefix}-member-add`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add an item
        </button>
      )}
    </div>
  );
}

/* ── routines held by a program ───────────────────────────────────────── */

/**
 * The routines a program holds.
 *
 * Attaching is the one membership write in the app with a NON-OBVIOUS
 * consequence, so it is the one that confirms first — the caller owns that
 * dialog and passes `onRequestAttach`, because the `wouldHide` simulation needs
 * the whole store and does not belong in a list component.
 */
export function RoutineMemberList({
  program,
  live,
  members,
  candidates,
  onRequestAttach,
  onRemove,
}: {
  program: { id: string; name: string };
  live: boolean;
  members: Routine[];
  candidates: Routine[];
  onRequestAttach: (routine: Routine) => void;
  onRemove: (routineId: string) => void;
}) {
  const liveIds = useLiveItemIds();
  const [adding, setAdding] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Same render-phase reset as ItemMemberList, and for the same reason: above
  // `md` this component is never remounted, so an open candidate list would
  // survive a click on a different program and stay pointed at the one you left.
  const [lastProgramId, setLastProgramId] = useState(program.id);
  if (program.id !== lastProgramId) {
    setLastProgramId(program.id);
    setAdding(false);
  }

  // Escape closes the candidate list before it closes the plate.
  //
  // This USED to be a capture-phase listener on the document, on the theory
  // that Radix binds in the bubble phase. It does not — `useEscapeKeydown` binds
  // on the document with `{ capture: true }`, so it wins on registration order
  // and that handler never got in front of anything. The ladder goes through
  // Radix's own `onEscapeKeyDown` instead.
  useEscapeRung(() => {
    if (!adding || !inActiveSection(rootRef.current)) return false;
    setAdding(false);
    return true;
  });

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5">
      <div className="flex h-[22px] items-center">
        <Eyebrow>
          {members.length} {members.length === 1 ? 'routine' : 'routines'}
        </Eyebrow>
      </div>

      <div className="max-h-32 space-y-px overflow-y-auto">
        {members.map((routine) => (
          <div
            key={routine.id}
            data-testid="program-routine-member"
            data-routine-id={routine.id}
            className="hover:bg-accent group flex h-[30px] items-center gap-[9px] rounded-[5px] px-[7px]"
          >
            <span className="flex w-[18px] shrink-0 justify-center">
              <CategoryIcon glyph={routine.icon} name={routine.name} className="h-3.5 w-3.5" />
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                live ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {routine.name}
            </span>
            <span className="text-muted-foreground font-num w-[22px] shrink-0 text-right text-2xs">
              {countLive(routine.itemIds, liveIds)}
            </span>
            <ControlRail>
              <RailButton
                onClick={() => onRemove(routine.id)}
                label={`Remove ${routine.name} from ${program.name}`}
                testId="program-routine-remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </RailButton>
            </ControlRail>
          </div>
        ))}
      </div>

      {adding && candidates.length > 0 ? (
        <div className="flex flex-col gap-1">
          {candidates.map((routine) => (
            <button
              key={routine.id}
              type="button"
              onClick={() => {
                setAdding(false);
                onRequestAttach(routine);
              }}
              data-testid="program-routine-candidate"
              data-routine-id={routine.id}
              className="hover:bg-accent flex h-8 items-center gap-2 rounded-[5px] px-[7px] text-left text-sm"
            >
              <CategoryIcon glyph={routine.icon} name={routine.name} className="h-3.5 w-3.5" />
              <span className="truncate">{routine.name}</span>
            </button>
          ))}
          {/* The way out. Without it the only exits are attaching a routine you
              may not have wanted, or closing the whole console. */}
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-8 items-center rounded-[5px] px-[7px] text-left text-sm"
            data-testid="program-routine-add-cancel"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={candidates.length === 0}
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-8 items-center gap-2 self-start rounded-[5px] px-[7px] text-sm disabled:opacity-50 disabled:hover:bg-transparent"
          data-testid="program-routine-add"
        >
          <Plus className="h-3.5 w-3.5" />
          {candidates.length === 0 ? 'Every routine is already here' : 'Add a routine'}
        </button>
      )}
    </div>
  );
}
