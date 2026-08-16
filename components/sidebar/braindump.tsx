'use client';

import { useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AlignLeft, FolderOpen, Moon, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TaskRow, type RowItem } from '@/components/primitives/task-row';
import { GroupSection } from '@/components/primitives/group-section';
import { AddIconButton } from '@/components/primitives/add-icon-button';
import { RelayField } from '@/components/primitives/relay-field';
import { DisplayMenu } from '@/components/primitives/display-menu';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore, openAddDialog } from '@/lib/ui-store';
import { useViewStore } from '@/lib/view-store';
import { passesFilters } from '@/lib/filters';
import { groupRows, type RowGroup } from '@/lib/grouping';
import { sortRows } from '@/lib/sort-rows';
import { RELAY } from '@/lib/relay-config';
import { inactiveItemIdsOn, suppressionReason, suppressionLabel } from '@/lib/active';
import { toDateStr } from '@/lib/recurrence';
import type { Task, Habit } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * The Braindump: every item that has no assigned day — unscheduled tasks
 * (no bucket) and habits with no bucket and no recurrence. Remains the DnD
 * source/target for scheduling ('sidebar' droppable = unschedule, see
 * lib/dnd/CONTRACT.md).
 */

/**
 * Persistent capture card at the foot of the sidebar — a boxed-plus and a
 * borderless field inside a pill that rhymes with the Braindump header. Enter
 * commits the title as a new unscheduled task (lands right here in the
 * braindump), clears, and holds focus — type, Enter, type, Enter. The plus
 * commits the same way, or focuses the field when it's empty.
 */
function QuickAddRow({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const addTask = usePlannerStore((s) => s.addTask);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [focused, setFocused] = useState(false);

  const commit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    addTask({ title: trimmed });
    setTitle('');
    // Focus survives the re-render (same DOM node), but re-assert it so the
    // plus-button path lands the caret back in the field too.
    inputRef.current?.focus();
    // Keep the just-added item in view: once it mounts (two frames — one for
    // React's commit, one for layout) drop the scroll to the bottom so the new
    // row lands just above this card. A no-op when the list doesn't overflow,
    // so short lists never jump.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      })
    );
  };

  // The plus hands off to the full add dialog instead of quick-committing,
  // seeding it with whatever's typed so far. Enter stays the fast inline path.
  const openFull = () => {
    openAddDialog('task', undefined, undefined, title.trim() || undefined);
    setTitle('');
    inputRef.current?.blur();
  };

  return (
    // A sunken tray at the foot of the sidebar — a recessed well (surface-3 + an
    // inset shadow), deliberately the INVERSE of the raised omnibar just below,
    // so the two never read as the same control. It sits OUTSIDE the scroll area
    // as a section child; the list shrinks (flex) to make room, so this rides
    // just under a short list and pins above the omnibar when the list runs long.
    // shrink-0 keeps it from compressing. mx-[10px] holds it to the width of the
    // header's inner pill (which sat inside the capsule's px-[10px]).
    <div
      data-testid="braindump-quick-add"
      data-focused={focused ? 'true' : 'false'}
      className={cn(
        'mx-[10px] flex h-[37px] shrink-0 items-center gap-2 rounded-[10px] bg-surface-3 px-[15px] shadow-[var(--shadow-inset-well)] transition-[box-shadow,background-color] duration-150 ease-[var(--ease-out-soft)]',
        // Hover, only while NOT focused (so focus stays a clean lit recess): a
        // 1px inner hairline traces the tray on top of the inset well.
        '[&:hover:not(:focus-within)]:shadow-[var(--shadow-inset-well),inset_0_0_0_1px_var(--border)]',
        // Focused: the recess LIGHTENS IN PLACE (fill eases toward white but the
        // inset shadow stays) — it never rises to a raised pill, which would twin
        // the omnibar's press.
        focused && 'bg-[var(--surface-3-lit)]'
      )}
    >
      <AddIconButton
        size="md"
        onClick={openFull}
        aria-label="Open the full add dialog"
        // Brightens from its resting 80% to full foreground while the tray is
        // focused — no lime; the tray's own fill carries the active state.
        className={cn(focused && 'text-foreground')}
      />
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setTitle('');
            inputRef.current?.blur();
          }
        }}
        placeholder="Add item"
        aria-label="Add item"
        data-testid="braindump-quick-add-input"
        className="min-w-0 flex-1 bg-transparent font-content text-content text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      {/* Enter affordance — the row commits on Enter, so surface a ↵ keycap
          while it's focused to make that discoverable. Kept mounted (opacity,
          not conditional render) so the field width doesn't jump on focus. */}
      <kbd
        aria-hidden
        className={cn(
          'pointer-events-none flex-shrink-0 rounded-xs border border-border px-1 font-mono text-[10px] text-muted-foreground transition-opacity',
          focused ? 'opacity-100' : 'opacity-0'
        )}
      >
        ↵
      </kbd>
    </div>
  );
}

/**
 * The foot-of-the-sidebar home for everything currently paused.
 *
 * It sits OUTSIDE the scroll port, as a peer of the quick-add card, for two
 * reasons. It stays reachable without scrolling past the working list, which is
 * what makes it a recovery surface rather than another place to lose things.
 * And QuickAddRow parks a freshly captured row by scrolling the port to its
 * bottom — with this block inside, every capture would scroll past the new row
 * to land on a heading, which would break the type-Enter-type-Enter rhythm the
 * capture row exists for.
 *
 * Collapsed by default, and quiet: paused is not an error state, so no badge,
 * no warning colour, no dotted border — a muted heading and a count. The count
 * is the whole affordance; it answers "did I leave anything set aside?" without
 * making the answer feel like a debt.
 */
type PausedGroup = { key: string; label: string; rows: RowItem[] };

function PausedSection({ groups, count }: { groups: PausedGroup[]; count: number }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <div
      data-testid="braindump-paused-section"
      className="mx-[10px] mb-2 shrink-0 rounded-[10px] bg-surface-2"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="braindump-paused-toggle"
        className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left hover-wash"
      >
        <Moon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-content text-content text-muted-foreground">Paused</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90'
          )}
        />
      </button>
      {/* Plain overflow-y-auto, never <ScrollArea> — the Radix wrapper silently
          drops max-h and the list would grow without bound. */}
      {open && (
        <div className="max-h-[40vh] overflow-y-auto px-[6px] pb-2">
          {groups.map((group) => (
            <div key={group.key}>
              {/* Suppressed only when there is nothing to disambiguate — one
                  cause needs no heading, and a lone label would read as a
                  category rather than an explanation. */}
              {groups.length > 1 && (
                <p
                  className="text-muted-foreground px-2 pt-2 pb-0.5 text-[10.5px] font-medium tracking-wider uppercase"
                  data-testid="braindump-paused-group"
                >
                  {group.label}
                </p>
              )}
              {group.rows.map((row) => (
                <TaskRow key={row.item.id} row={row} context="braindump" />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Braindump() {
  const { tasks, habits, items, routines, programs, userTimezone } = usePlannerStore();
  const { openDialog } = useUIStore();
  const { braindumpGroupBy, braindumpFilters, braindumpSortBy } = useViewStore();
  // The scroll port — QuickAddRow drops it to the bottom after each add so the
  // new row stays visible above the sticky capture row.
  const listRef = useRef<HTMLDivElement>(null);

  const { isOver, setNodeRef } = useDroppable({ id: 'sidebar' });

  /**
   * Suppressed ids, resolved at TODAY.
   *
   * Today, not `selectedDate`: the braindump carries no date of its own, so a
   * paused row must not appear and vanish as the user walks the week (plan
   * decision 3). The set feeds two places — it is subtracted from the live list
   * below, and it builds the Paused section — because an item may satisfy both
   * predicates and rendering it twice makes the second copy a ghost that
   * shift-range and ⌘A silently skip.
   */
  const suppressedIds = useMemo(() => {
    const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return inactiveItemIdsOn(items, toDateStr(new Date(), tz), {
      userTimezone: tz,
      routines,
      programs,
    });
  }, [items, routines, programs, userTimezone]);

  const rows: RowItem[] = useMemo(() => {
    const unscheduledTasks = tasks.filter((task) => {
      if (suppressedIds.has(task.id)) return false;
      if (task.isScheduled || task.timeBucket) return false;
      if (braindumpFilters.hideFinished && task.status === 'completed') return false;
      if (!passesFilters(task, braindumpFilters)) return false;
      return true;
    });

    // Habits belong in the braindump when nothing places them on a day:
    // no bucket and no recurrence.
    //
    // The wipe that used to sit here is gone — see lib/filters.ts. It was the
    // same rule as the canvas's, and it was guarding a list that is empty in
    // practice anyway: a habit cannot reach repeatFrequency 'none' through any
    // UI path today. The branch stays because habit DRAFTS are meant to live
    // here eventually (memory/plans/display-menu.md); it now narrows by the
    // same rule as everything else instead of vanishing wholesale.
    //
    // No hideSkipped term: a skip is per-date and the braindump is dateless.
    const unscheduledHabits = habits.filter((habit) => {
      if (suppressedIds.has(habit.id)) return false;
      if (habit.timeBucket) return false;
      if (habit.repeatFrequency && habit.repeatFrequency !== 'none') return false;
      if (braindumpFilters.hideFinished && habit.status === 'done') return false;
      // 'habit' explicitly — see the note in lib/day-items.ts.
      if (!passesFilters(habit, braindumpFilters, 'habit')) return false;
      return true;
    });

    // Concatenation is the DEFAULT order, not the only one. All tasks then all
    // habits is an accidental type grouping baked into the sort — nobody chose
    // it; it is what building the list in two passes produces. The ordering is
    // applied in `grouped` below, per group, NOT here: see the note there.
    return [
      ...unscheduledTasks.map((task) => ({ itemType: 'task' as const, item: task })),
      ...unscheduledHabits.map((habit) => ({ itemType: 'habit' as const, item: habit })),
    ];
  }, [tasks, habits, braindumpFilters, suppressedIds]);

  /**
   * Everything currently set aside — the home paused work would otherwise not
   * have.
   *
   * Without this, "hidden entirely" means an indefinitely-paused item is absent
   * from the grid, the review, the past-due bar AND this list, and the only way
   * back is remembering it exists and searching its name. That is data loss
   * wearing a feature's clothes.
   *
   * Reads `items` rather than the projections on purpose: the section spans
   * dated and scheduled work that the braindump's own membership predicate
   * would never admit. That means re-applying the projection's subtask rule by
   * hand — a subtask has no standalone row anywhere else, and one surfacing
   * here as a free-floating item is exactly what that filter exists to prevent.
   *
   * Deliberately ignores braindumpFilters and braindumpGroupBy: those shape the
   * working list, and filtering the recovery surface would reintroduce the very
   * problem this section solves.
   */
  const pausedGroups: PausedGroup[] = useMemo(() => {
    const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const todayStr = toDateStr(new Date(), tz);
    // Grouped BY CAUSE rather than listed flat. With three layers able to hide
    // an item, a flat list of twelve rows can't tell you whether to resume an
    // item, a routine or a program — and the heading is the only place to say
    // so, because the row's trailing rail is width-budgeted down to the pixel
    // and has no slot to spend (see task-row.tsx's "quiet rail" note).
    const groups = new Map<string, PausedGroup>();
    for (const item of items) {
      if (!suppressedIds.has(item.id)) continue;
      if ('parentItemId' in item && item.parentItemId) continue;
      const reason = suppressionReason(item, todayStr, { userTimezone: tz, routines, programs });
      // Self-paused items key on their RESUME DATE as well as the cause. The
      // heading is taken from whichever row lands in the bucket first, and
      // store order is sort_order/created_at — nothing to do with pause dates —
      // so a single 'paused' bucket puts "Paused until Sep 1" over an item that
      // has no scheduled return at all, or the bare "Paused" over one that does.
      // Container causes need no such split: every member of a routine shares
      // its one resume date by construction.
      const key = !reason
        ? 'paused'
        : reason.kind === 'routine'
          ? `routine:${reason.routine.id}`
          : reason.kind === 'program'
            ? `program:${reason.program.id}`
            : `paused:${reason.until ?? ''}`;
      const row: RowItem =
        item.type === 'habit'
          ? { itemType: 'habit' as const, item: item as unknown as Habit }
          : { itemType: 'task' as const, item: item as unknown as Task };
      const group = groups.get(key);
      if (group) group.rows.push(row);
      // A null reason can't normally reach here (suppressedIds and
      // suppressionReason agree), but falling back to the bare "Paused"
      // heading keeps a row visible rather than dropping it on the floor.
      else groups.set(key, { key, label: reason ? suppressionLabel(reason) : 'Paused', rows: [row] });
    }
    return [...groups.values()];
  }, [items, suppressedIds, routines, programs, userTimezone]);

  const pausedCount = pausedGroups.reduce((n, g) => n + g.rows.length, 0);

  /**
   * Grouped first, then sorted WITHIN each group — the order Day × List uses,
   * and the rule the plan states: grouping owns the outer order.
   *
   * Sorting `rows` before this ran instead made the SECTIONS move. The map is
   * filled by walking the row list, so its insertion order — which is what
   * `[...groups.entries()]` returns — became "whichever group owns the first
   * row under the current ordering". Grouping by Project with Ordering off
   * rendered [Work, Home]; switching to Title A–Z rendered [Home, Work]. The
   * rows inside were right either way, which is why it reads as a jump rather
   * than as a bug.
   */
  const grouped: RowGroup<RowItem>[] = useMemo(() => {
    // 'type' is the braindump's own value and has no canvas counterpart — the
    // canvas answers "what is in here" with the Type FILTER instead. Everything
    // else routes through the shared core, so 'project' resolves the container
    // axis through the registry here exactly as it does on the canvas.
    const groups: RowGroup<RowItem>[] =
      braindumpGroupBy === 'type'
        ? [
            { key: 'Tasks', label: 'Tasks', rows: rows.filter((r) => r.itemType === 'task') },
            { key: 'Habits', label: 'Habits', rows: rows.filter((r) => r.itemType === 'habit') },
          ].filter((g) => g.rows.length > 0)
        : groupRows(rows, braindumpGroupBy, {});
    return groups.map((g) => ({ ...g, rows: sortRows(g.rows, braindumpSortBy) }));
  }, [rows, braindumpGroupBy, braindumpSortBy]);

  return (
    <section
      ref={setNodeRef}
      data-dnd-id="sidebar"
      data-dnd-over={isOver ? 'true' : 'false'}
      // Separates the CONTENT scope from the DnD hook: data-dnd-id="sidebar"
      // currently does double duty as both, so a spec scoping assertions to the
      // braindump is really asserting against a drop target.
      data-testid="braindump"
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      {/* Header — gray capsule (flat) framing a shadowed white row-pill.
          Dims from Figma: gray 406×50 r10; pill 385×37 r10, inset (10,6),
          shadow 0 4 4 rgba(0,0,0,.15). Title downsized to Inter Medium 13
          for the Linear-style exploration. */}
      <div className="shrink-0 rounded-[10px] bg-surface-3 px-[10px] py-[6px] shadow-[var(--shadow-elev-bar)]">
        <div className="flex h-[37px] items-center gap-2 rounded-[10px] bg-surface-2 px-[15px] shadow-[var(--shadow-elev-sm)]">
          <AlignLeft className="h-4 w-4 text-muted-foreground" />
          <h2 className="flex-1 font-sans text-sm font-medium leading-none text-foreground">
            Braindump
          </h2>
          {/* Portalled, so the sidebar's 280px minimum never constrains the
              240px panel — which is the decisive advantage over a persistent
              chip bar. A bar would sit IN FLOW above a grid whose hour height is
              derived from remaining column height, so adding your first filter
              would visibly re-scale every hour row of the day. */}
          <DisplayMenu surface="braindump" trigger="icon" align="start" />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => openDialog({ type: 'organize', section: 'projects' })}
            aria-label="Organize projects & groups"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          {/* No routines button here on purpose. This row is width-critical at
              the 280px minimum — the collapse control moved off it to buy the
              title ~30px, and a fifth control spends exactly that back. The
              manager is reached from the palette and from the item dialog's
              Routine chip instead. */}
          {/* Collapse used to sit here, as a fifth control. It moved onto the
              resize sash (components/sidebar/sidebar.tsx) so all the chrome
              that acts on the COLUMN — its width and whether it's there at all
              — lives on the column's own edge, and this row is left holding
              only things that act on the LIST. It also buys the title back
              ~30px, which is the difference between fitting and truncating at
              the 280px minimum width. ⌘[ is unchanged. */}
          <AddIconButton
            size="md"
            onClick={() => openAddDialog('task')}
            aria-label="Add task"
          />
        </div>
      </div>

      {/* List — sits directly on the paper backdrop, no card. A plain
          overflow-y-auto container, NOT Radix <ScrollArea>: it shrinks (flex) so
          the quick-add card below can pin to the section foot, and its ref drives
          scroll-to-bottom after each add. It fills the column only when empty, so
          the empty-state poem stays vertically centered.

          overflow-x is pinned hidden, not left alone: CSS promotes an untouched
          `visible` to `auto` the moment the other axis scrolls, so overflow-y
          here quietly made the port horizontally scrollable too — and the empty
          state's relay field, which overhangs its box by design, then poked far
          enough past the padding to raise a horizontal scrollbar under an empty
          braindump. It clips a couple of px the field's mask has already faded
          to nothing. */}
      <div
        ref={listRef}
        className={cn(
          'min-h-0 overflow-y-auto overflow-x-hidden rounded-card transition-colors',
          // Fill the column only when there is genuinely nothing here — a
          // paused-only sidebar still wants the poem's space collapsed so the
          // Paused strip sits under the header rather than adrift at the foot.
          rows.length === 0 && pausedCount === 0 && 'flex-1',
          isOver && 'ring-2 ring-ring/60'
        )}
      >
        <div className="px-[14px] py-2">
          {grouped.map((g) =>
            g.label ? (
              <GroupSection key={g.key} groupKey={g.key} label={g.label} className="pt-5 first:pt-1">
                {g.rows.map((row) => (
                  <TaskRow key={row.item.id} row={row} context="braindump" />
                ))}
              </GroupSection>
            ) : (
              <div key="all" className="space-y-0">
                {g.rows.map((row) => (
                  <TaskRow key={row.item.id} row={row} context="braindump" />
                ))}
              </div>
            )
          )}

          {rows.length === 0 && pausedCount === 0 && (
            <div className="relative flex min-h-[220px] flex-col items-center justify-center gap-2 py-12 text-center">
              {RELAY.emptyState && (
                // pitch matches the dock capsule (20) — tile size derives from it.
                // The field overhangs the box horizontally and its mask reaches
                // full transparency inside its own bounds (closest-side), so the
                // grid dissolves at every edge instead of being clipped mid-tile.
                <RelayField
                  className="absolute -inset-x-4 inset-y-0 z-0"
                  focalY={0.45}
                  pitch={20}
                  period={4.5}
                  idleIntensity={0.35}
                  mask="radial-gradient(closest-side at 50% 45%, black 0%, black 40%, transparent 100%)"
                />
              )}
              <p className="relative z-10 font-serif text-base italic text-muted-foreground">
                A clear head. Drop stray thoughts here.
              </p>
              <button
                onClick={() => openAddDialog('task')}
                className="relative z-10 text-xs text-success-text hover:underline underline-offset-2"
              >
                + Add something
              </button>
            </div>
          )}
        </div>
      </div>

      <PausedSection groups={pausedGroups} count={pausedCount} />

      {/* Quick-add — a floating card at the section foot, peer of the header. */}
      <QuickAddRow scrollRef={listRef} />
    </section>
  );
}
