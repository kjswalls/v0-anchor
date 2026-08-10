'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Check, Circle, Inbox, Layers, Minus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { useSelectionStore } from '@/lib/selection-store';
import { getItemTypeConfig, itemTypeName, isCollectible } from '@/lib/item-registry';
import { isRecurring, isCompletedOnDate, toDateStr } from '@/lib/recurrence';
import { accentColorForName } from '@/lib/accent-colors';
import type { Item, Program, Routine } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Floating multi-select toolbar. Mounts once in the shell and shows only while
 * a selection exists. Actions are gated per selection COMPOSITION off the type
 * registry — a mixed task+habit+custom selection is fine, each action just
 * applies to its eligible subset (habits aren't date/braindump eligible; only
 * one-off task-likes carry a date). Every verb it calls does one set() ⇒ one
 * undo, so a single Cmd+Z reverses the whole gesture.
 */

function isItemDone(item: Item, dateStr: string): boolean {
  if (item.type === 'habit') return item.completedDates.includes(dateStr);
  if (isRecurring(item)) return isCompletedOnDate(item, dateStr);
  return item.status === getItemTypeConfig(itemTypeName(item)).doneStatus;
}

/**
 * One row of the Collect menu. Tri-state, because a selection is rarely all-in
 * or all-out of a container and a plain checkbox would have to lie about the
 * middle: `all` clears the whole selection out, anything less collects the
 * whole selection in. That asymmetry is deliberate — the menu is reached from a
 * selection you just made, so the intent is nearly always "put these there",
 * and only the already-satisfied case can safely mean the opposite.
 */
function CollectRow({
  container,
  state,
  onToggle,
}: {
  container: Routine | Program;
  state: 'none' | 'some' | 'all';
  onToggle: (member: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false'}
      data-testid="bulk-collect-option"
      data-container-id={container.id}
      data-state={state}
      onClick={() => onToggle(state !== 'all')}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs',
        'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none'
      )}
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-[2px]"
        style={{ background: container.color ?? accentColorForName(container.name) }}
      />
      <span className="truncate">{container.name}</span>
      <span className="ml-auto flex size-3.5 shrink-0 items-center justify-center">
        {state === 'all' && <Check className="size-3.5" />}
        {state === 'some' && <Minus className="size-3.5 text-muted-foreground" />}
      </span>
    </button>
  );
}

export function BulkActionBar() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const prune = useSelectionStore((s) => s.prune);

  const items = usePlannerStore((s) => s.items);
  const selectedDate = usePlannerStore((s) => s.selectedDate);
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const deleteItems = usePlannerStore((s) => s.deleteItems);
  const setItemsCompleted = usePlannerStore((s) => s.setItemsCompleted);
  const moveTasksToDate = usePlannerStore((s) => s.moveTasksToDate);
  const unscheduleTasks = usePlannerStore((s) => s.unscheduleTasks);
  const confirm = useUIStore((s) => s.confirm);
  const routines = usePlannerStore((s) => s.routines);
  const programs = usePlannerStore((s) => s.programs);
  const collectionsAvailable = usePlannerStore((s) => s.collectionsAvailable);
  const setItemsCollected = usePlannerStore((s) => s.setItemsCollected);

  const [dateOpen, setDateOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);

  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = toDateStr(selectedDate, tz);

  // Drop ids whose item was deleted elsewhere (row control, agent, undo), so a
  // bulk action never fans out over ghosts and the count stays honest.
  const liveIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  useEffect(() => {
    prune((id) => liveIds.has(id));
  }, [liveIds, prune]);

  // Escape clears the selection. This bar mounts for the whole session (it just
  // renders null below the threshold), so the listener guards hard against
  // stealing Escape from something else:
  //   - defaultPrevented → a Radix layer (its own date popover, Settings dialog,
  //     shortcuts modal, …) already consumed this Escape in the capture phase to
  //     close itself; clearing the selection on the same keypress would wipe it
  //     out from under an unrelated dismiss.
  //   - an open confirm dialog owns Escape (cancelling a delete must not also
  //     clear what was about to be deleted).
  //   - a focused text field owns its own Escape (omnibar, inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (useUIStore.getState().confirmRequest) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
      clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear]);

  const selected = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  );
  const count = selected.length;

  // Movable = one-off (a recurring startDate is the recurrence anchor, not a
  // due date) task-likes whose type is date-addressable. Braindumpable = types
  // that can return to the sidebar. Both computed off the registry.
  const movable = useMemo(
    () =>
      selected.filter(
        (i) => getItemTypeConfig(itemTypeName(i)).dateAddressable && !isRecurring(i)
      ),
    [selected]
  );
  const braindumpable = useMemo(
    () => selected.filter((i) => getItemTypeConfig(itemTypeName(i)).braindumpEligible),
    [selected]
  );
  const allDone = count > 0 && selected.every((i) => isItemDone(i, dateStr));

  // Subtasks are not collectible (they surface only inside their parent), so a
  // selection swept off the canvas can carry ids no container will take. Same
  // eligible-subset posture as Move and Braindump above.
  const collectible = useMemo(() => selected.filter(isCollectible), [selected]);
  const collectibleIds = useMemo(() => collectible.map((i) => i.id), [collectible]);
  const membership = useMemo(() => {
    const of = (c: { itemIds: string[] }): 'none' | 'some' | 'all' => {
      if (collectibleIds.length === 0) return 'none';
      const held = new Set(c.itemIds);
      const n = collectibleIds.filter((id) => held.has(id)).length;
      return n === 0 ? 'none' : n === collectibleIds.length ? 'all' : 'some';
    };
    return { of };
  }, [collectibleIds]);

  // Only a genuine MULTI-selection (>=2) raises the bar. A plain click selects
  // exactly one row (and opens it in the edit pane, which is the single-item
  // action surface), so a >=1 threshold would pop the bar on every normal click.
  if (count < 2) return null;

  const ids = selected.map((i) => i.id);

  const handleDelete = () => {
    confirm({
      title: `Delete ${count} ${count === 1 ? 'item' : 'items'}?`,
      description:
        'This will permanently delete the selected items (and any subtasks). This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        deleteItems(ids);
        clear();
      },
    });
  };

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      data-testid="bulk-action-bar"
      className={cn(
        'fixed bottom-20 left-1/2 z-40 -translate-x-1/2 md:bottom-6',
        'flex items-center gap-1 rounded-full border border-border bg-card p-1 pl-3 shadow-soft-lg'
      )}
    >
      <span className="mr-1 whitespace-nowrap text-sm font-medium text-foreground" data-testid="bulk-count">
        {count} selected
      </span>

      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
        data-testid="bulk-complete"
        onClick={() => setItemsCompleted(ids, !allDone, selectedDate)}
      >
        {allDone ? <Circle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {allDone ? 'Mark incomplete' : 'Complete'}
      </Button>

      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
            data-testid="bulk-move"
            disabled={movable.length === 0}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Move to date
            {movable.length < count && <span className="text-muted-foreground">· {movable.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return;
              moveTasksToDate(
                movable.map((i) => i.id),
                toDateStr(date, tz)
              );
              setDateOpen(false);
              clear();
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
        data-testid="bulk-unschedule"
        disabled={braindumpable.length === 0}
        onClick={() => {
          unscheduleTasks(braindumpable.map((i) => i.id));
          clear();
        }}
      >
        <Inbox className="h-3.5 w-3.5" />
        Braindump
        {braindumpable.length < count && (
          <span className="text-muted-foreground">· {braindumpable.length}</span>
        )}
      </Button>

      {/* Hidden entirely when migration 024's tables are unreachable — a
          disabled control would promise a feature the writes cannot reach, and
          the store gates on the same flag everywhere else. Also hidden when
          nothing in the selection can be collected at all, rather than shown
          disabled: a subtasks-only selection has no story to tell here. */}
      {collectionsAvailable && collectible.length > 0 && (routines.length > 0 || programs.length > 0) && (
        <Popover open={collectOpen} onOpenChange={setCollectOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
              data-testid="bulk-collect"
            >
              <Layers className="h-3.5 w-3.5" />
              Collect
              {collectible.length < count && (
                <span className="text-muted-foreground">· {collectible.length}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-56 p-1">
            <div className="max-h-64 overflow-y-auto" role="menu" aria-label="Add to routine or program">
              {routines.length > 0 && (
                <>
                  <div className="px-2 pb-1 pt-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
                    Routines
                  </div>
                  {routines.map((r) => (
                    <CollectRow
                      key={r.id}
                      container={r}
                      state={membership.of(r)}
                      onToggle={(member) =>
                        setItemsCollected(collectibleIds, 'routine', r.id, member)
                      }
                    />
                  ))}
                </>
              )}
              {programs.length > 0 && (
                <>
                  <div className="px-2 pb-1 pt-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
                    Programs
                  </div>
                  {programs.map((p) => (
                    <CollectRow
                      key={p.id}
                      container={p}
                      state={membership.of(p)}
                      onToggle={(member) =>
                        setItemsCollected(collectibleIds, 'program', p.id, member)
                      }
                    />
                  ))}
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:text-destructive"
        data-testid="bulk-delete"
        onClick={handleDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-muted-foreground"
        aria-label="Clear selection"
        data-testid="bulk-clear"
        onClick={clear}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
