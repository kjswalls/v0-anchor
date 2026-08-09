'use client';

import { useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AlignLeft, FolderOpen, ListFilter, X, Check, Moon, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TaskRow, type RowItem } from '@/components/primitives/task-row';
import { GroupSection } from '@/components/primitives/group-section';
import { AddIconButton } from '@/components/primitives/add-icon-button';
import { RelayField } from '@/components/primitives/relay-field';
import { CategoryIcon } from '@/lib/category-icons';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore, openAddDialog } from '@/lib/ui-store';
import { useViewStore, type BraindumpGroupBy } from '@/lib/view-store';
import { RELAY } from '@/lib/relay-config';
import { inactiveItemIdsOn } from '@/lib/active';
import { toDateStr } from '@/lib/recurrence';
import type { Priority, Task, Habit } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * The Braindump: every item that has no assigned day — unscheduled tasks
 * (no bucket) and habits with no bucket and no recurrence. Remains the DnD
 * source/target for scheduling ('sidebar' droppable = unschedule, see
 * lib/dnd/CONTRACT.md).
 */

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

function FilterPopover() {
  const { braindumpGroupBy, setBraindumpGroupBy, braindumpFilters, setBraindumpFilters } =
    useViewStore();
  const projects = usePlannerStore((s) => s.projects);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const activeCount =
    braindumpFilters.projects.length +
    braindumpFilters.priorities.length +
    (braindumpFilters.hideCompleted ? 1 : 0);
  // The dot also signals an active grouping (group-by lives in this popover).
  const isActive = activeCount > 0 || braindumpGroupBy !== 'none';

  const groupOptions: { value: BraindumpGroupBy; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'type', label: 'Type' },
    { value: 'project', label: 'Project' },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative h-6 w-6 text-muted-foreground hover:text-foreground', isActive && 'text-foreground')}
          aria-label={isActive ? 'Filter and group (active)' : 'Filter and group'}
        >
          <ListFilter className="h-4 w-4" />
          {isActive && (
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Group by</div>
        <div className="flex gap-1 pb-2">
          {groupOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBraindumpGroupBy(opt.value)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
                braindumpGroupBy === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Priority</div>
        <div className="flex gap-1 pb-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() =>
                setBraindumpFilters({
                  ...braindumpFilters,
                  priorities: toggle(braindumpFilters.priorities, p),
                })
              }
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs capitalize transition-colors',
                braindumpFilters.priorities.includes(p)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <>
            <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Project</div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto pb-2">
              {projects.map((project) => {
                const active = braindumpFilters.projects.includes(project.name);
                return (
                  <button
                    key={project.name}
                    onClick={() =>
                      setBraindumpFilters({
                        ...braindumpFilters,
                        projects: toggle(braindumpFilters.projects, project.name),
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                  >
                    <span
                      className={cn(
                        'flex h-3.5 w-3.5 items-center justify-center rounded border',
                        active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      )}
                    >
                      {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    <CategoryIcon glyph={project.emoji} name={project.name} />
                    {project.name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          onClick={() =>
            setBraindumpFilters({ ...braindumpFilters, hideCompleted: !braindumpFilters.hideCompleted })
          }
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
        >
          <span
            className={cn(
              'flex h-3.5 w-3.5 items-center justify-center rounded border',
              braindumpFilters.hideCompleted ? 'border-primary bg-primary' : 'border-muted-foreground/40'
            )}
          >
            {braindumpFilters.hideCompleted && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
          </span>
          Hide completed
        </button>

        {activeCount > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={() =>
                setBraindumpFilters({ projects: [], priorities: [], hideCompleted: false })
              }
            >
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

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
function PausedSection({ rows }: { rows: RowItem[] }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

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
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{rows.length}</span>
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
          {rows.map((row) => (
            <TaskRow key={row.item.id} row={row} context="braindump" />
          ))}
        </div>
      )}
    </div>
  );
}

export function Braindump() {
  const { tasks, habits, items, routines, programs, userTimezone } = usePlannerStore();
  const { openDialog } = useUIStore();
  const { braindumpGroupBy, braindumpFilters } = useViewStore();
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
      if (braindumpFilters.hideCompleted && task.status === 'completed') return false;
      if (braindumpFilters.priorities.length && (!task.priority || !braindumpFilters.priorities.includes(task.priority)))
        return false;
      if (braindumpFilters.projects.length && (!task.project || !braindumpFilters.projects.includes(task.project)))
        return false;
      return true;
    });

    // Habits belong in the braindump when nothing places them on a day:
    // no bucket and no recurrence.
    const unscheduledHabits =
      braindumpFilters.priorities.length || braindumpFilters.projects.length
        ? []
        : habits.filter((habit) => {
            if (suppressedIds.has(habit.id)) return false;
            if (habit.timeBucket) return false;
            if (habit.repeatFrequency && habit.repeatFrequency !== 'none') return false;
            if (braindumpFilters.hideCompleted && habit.status === 'done') return false;
            return true;
          });

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
  const pausedRows: RowItem[] = useMemo(
    () =>
      items
        .filter((i) => suppressedIds.has(i.id) && !('parentItemId' in i && i.parentItemId))
        .map((i) =>
          i.type === 'habit'
            ? { itemType: 'habit' as const, item: i as unknown as Habit }
            : { itemType: 'task' as const, item: i as unknown as Task }
        ),
    [items, suppressedIds]
  );

  const grouped: [string, RowItem[]][] = useMemo(() => {
    if (braindumpGroupBy === 'none') return [['', rows]];
    const groups = new Map<string, RowItem[]>();
    for (const row of rows) {
      const key =
        braindumpGroupBy === 'type'
          ? row.itemType === 'task'
            ? 'Tasks'
            : 'Habits'
          : (row.itemType === 'task' && row.item.project) || 'No project';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return [...groups.entries()];
  }, [rows, braindumpGroupBy]);

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
          <FilterPopover />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => openDialog({ type: 'manage-categories' })}
            aria-label="Manage projects & groups"
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
          the empty-state poem stays vertically centered. */}
      <div
        ref={listRef}
        className={cn(
          'min-h-0 overflow-y-auto rounded-card transition-colors',
          // Fill the column only when there is genuinely nothing here — a
          // paused-only sidebar still wants the poem's space collapsed so the
          // Paused strip sits under the header rather than adrift at the foot.
          rows.length === 0 && pausedRows.length === 0 && 'flex-1',
          isOver && 'ring-2 ring-ring/60'
        )}
      >
        <div className="px-[14px] py-2">
          {grouped.map(([label, groupRows]) =>
            label ? (
              <GroupSection key={label} label={label} className="pt-5 first:pt-1">
                {groupRows.map((row) => (
                  <TaskRow key={row.item.id} row={row} context="braindump" />
                ))}
              </GroupSection>
            ) : (
              <div key="all" className="space-y-0">
                {groupRows.map((row) => (
                  <TaskRow key={row.item.id} row={row} context="braindump" />
                ))}
              </div>
            )
          )}

          {rows.length === 0 && pausedRows.length === 0 && (
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

      <PausedSection rows={pausedRows} />

      {/* Quick-add — a floating card at the section foot, peer of the header. */}
      <QuickAddRow scrollRef={listRef} />
    </section>
  );
}
