'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Moon, Repeat, CalendarRange, Trash2, Plus } from 'lucide-react';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
} from '@/components/ui/responsive-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IconPicker } from '@/components/primitives/icon-picker';
import { ColorSwatchPicker } from '@/components/primitives/color-swatch-picker';
import { CategoryIcon } from '@/lib/category-icons';
import { usePlannerStore } from '@/lib/planner-store';
import { accentColorForName } from '@/lib/accent-colors';
import { isPausedOn } from '@/lib/active';
import { isCollectible } from '@/lib/item-registry';
import { toDateStr } from '@/lib/recurrence';
import { cn } from '@/lib/utils';
import type { Item, Routine } from '@/lib/planner-types';

/**
 * "Routines & Programs" — the manager.
 *
 * LAYOUT (chosen from the three studied directions: stacked drill-in, two-pane,
 * inline expand). It is B with A's editor grafted on above `md`:
 *
 *   < 768px   list OR detail, one at a time, with a back row. This is also the
 *             mobile bottom sheet, so nothing forks.
 *   >= 768px  list AND detail side by side; selecting never navigates.
 *
 * The breakpoint is `md`, NOT `sm`, and that is load-bearing: ResponsiveModal
 * switches to a vaul bottom sheet at useIsMobile's 768px. Using `sm` (640px) put
 * the two-pane desktop layout INSIDE a bottom sheet for a 128px band.
 *
 * Same components either way — the only difference is whether the list stays
 * mounted beside the detail. That matters because it means the LIST ROW has to
 * carry the full state (colour, name, paused, count) rather than leaning on an
 * editor that may not be there.
 *
 * WHY THE MEMBER LIST GREYS. A paused routine hides its members everywhere else
 * in the app; showing them greyed here — in the same frame as the control that
 * paused them — is the only place cause and consequence are visible together.
 *
 * GUILT-FREE LAW (overlap-blocks decision 1): paused is never a warning colour,
 * never a badge, never a dotted border. A muted pill and a moon glyph, and an
 * ACTIVE routine wears no marker at all — only the exception is labelled.
 */
export function ManageCollectionsDialog({
  open,
  onOpenChange,
  defaultTab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: string;
}) {
  const routines = usePlannerStore((s) => s.routines);
  const collectionsAvailable = usePlannerStore((s) => s.collectionsAvailable);
  const addRoutine = usePlannerStore((s) => s.addRoutine);
  const removeRoutine = usePlannerStore((s) => s.removeRoutine);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Routine | null>(null);

  const selected = routines.find((r) => r.id === selectedId) ?? null;

  // Reopening should land on the list, not on whatever was last inspected —
  // the dialog stays mounted between opens.
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setNewName('');
      setNewIcon(undefined);
    }
  }, [open]);

  // A routine deleted from under the selection (or by an undo) must not leave
  // the detail pane rendering a ghost.
  useEffect(() => {
    if (selectedId && !routines.some((r) => r.id === selectedId)) setSelectedId(null);
  }, [routines, selectedId]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name || !collectionsAvailable) return;
    const id = addRoutine({ name, icon: newIcon, itemIds: [] });
    setNewName('');
    setNewIcon(undefined);
    setSelectedId(id);
  };

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange}>
        <ResponsiveModalContent className="sm:max-w-[680px]">
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="text-foreground">
              Routines &amp; Programs
            </ResponsiveModalTitle>
            <ResponsiveModalDescription className="sr-only">
              Group items into routines, and pause a whole routine at once.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>

          {/* Keyed so a later open with a different tab actually lands there —
              the dialog stays mounted and defaultValue only applies once. The
              manage-categories precedent. */}
          <Tabs
            key={defaultTab ?? 'routines'}
            defaultValue={defaultTab ?? 'routines'}
            className="w-full"
          >
            <TabsList className="bg-secondary grid w-full grid-cols-2">
              <TabsTrigger value="routines" className="data-[state=active]:bg-card">
                <Repeat className="mr-1.5 h-4 w-4" />
                Routines
              </TabsTrigger>
              <TabsTrigger value="programs" className="data-[state=active]:bg-card">
                <CalendarRange className="mr-1.5 h-4 w-4" />
                Programs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="routines" className="mt-4">
              {!collectionsAvailable ? (
                <Unavailable />
              ) : (
                <div
                  className="md:grid md:grid-cols-[210px_1fr] md:gap-0"
                  data-testid="collections-routines"
                >
                  {/* On mobile the detail REPLACES the list; above md both are
                      mounted. One media query, no forked component tree. */}
                  <div className={cn('md:block md:border-border md:border-r md:pr-3', selected && 'hidden')}>
                    <RoutineList
                      routines={routines}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                    />
                    <div className="mt-3 flex gap-2">
                      <IconPicker value={newIcon} name={newName} onSelect={setNewIcon} />
                      <Input
                        placeholder="New routine…"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        className="bg-background border-border h-9 flex-1"
                        data-testid="routine-new-name"
                      />
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-9 w-9 shrink-0"
                        onClick={handleAdd}
                        disabled={!newName.trim()}
                        aria-label="Add routine"
                        data-testid="routine-add"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className={cn('md:block md:pl-4', !selected && 'hidden')}>
                    {selected ? (
                      <RoutineDetail
                        routine={selected}
                        onBack={() => setSelectedId(null)}
                        onDelete={() => setConfirmDelete(selected)}
                      />
                    ) : (
                      <p className="text-muted-foreground hidden py-10 text-center text-sm md:block">
                        Pick a routine to edit it.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="programs" className="mt-4">
              <p className="text-muted-foreground py-10 text-center text-sm">
                Programs arrive next — a routine is the smaller piece, and it comes first.
              </p>
            </TabsContent>
          </Tabs>
        </ResponsiveModalContent>
      </ResponsiveModal>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this routine?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `"${confirmDelete.name}" is removed, but its ${confirmDelete.itemIds.length} ${
                    confirmDelete.itemIds.length === 1 ? 'item' : 'items'
                  } stay exactly as they are — they just stop being grouped.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="routine-delete-confirm"
              onClick={() => {
                if (confirmDelete) removeRoutine(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Unavailable() {
  return (
    <p className="text-muted-foreground py-10 text-center text-sm" data-testid="collections-unavailable">
      Routines aren&apos;t available on this account yet.
    </p>
  );
}

/** Today, in the user's zone. Pausing is dateless — never the selected date. */
function useToday(): { todayStr: string; tz: string } {
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { todayStr: toDateStr(new Date(), tz), tz };
}

function RoutineList({
  routines,
  selectedId,
  onSelect,
}: {
  routines: Routine[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { todayStr, tz } = useToday();
  const items = usePlannerStore((s) => s.items);
  // Counted against the LIVE index, like the detail pane's list. itemIds may
  // name trashed items — join rows outlive an item's soft delete by design —
  // so raw length would make this row disagree with the editor beside it.
  const liveIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const liveCount = (r: Routine) => r.itemIds.reduce((n, id) => n + (liveIds.has(id) ? 1 : 0), 0);

  if (routines.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No routines yet. A routine groups items you want to pause together.
      </p>
    );
  }

  return (
    <div className="max-h-64 space-y-px overflow-y-auto">
      {routines.map((routine) => {
        const paused = isPausedOn(routine, todayStr, tz);
        return (
          <button
            key={routine.id}
            type="button"
            onClick={() => onSelect(routine.id)}
            data-testid="routine-row"
            data-routine-id={routine.id}
            data-paused={paused ? '' : undefined}
            className={cn(
              'hover:bg-secondary flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors',
              selectedId === routine.id && 'bg-secondary'
            )}
          >
            <CategoryIcon glyph={routine.icon} name={routine.name} />
            <span className="text-foreground flex-1 truncate text-sm font-medium">
              {routine.name}
            </span>
            {paused && <PausedPill until={routine.pausedUntil} />}
            <span className="text-muted-foreground text-xs tabular-nums">
              {liveCount(routine)}
            </span>
            <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0 md:hidden" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Muted, with a moon. Never amber, never red, never a dotted border — paused is
 * a decision the user made on purpose and should look like one.
 */
function PausedPill({ until }: { until?: string }) {
  return (
    <span
      data-testid="routine-paused-pill"
      className="bg-muted text-muted-foreground inline-flex h-[19px] shrink-0 items-center gap-1 rounded px-1.5 text-[10.5px] font-medium"
    >
      <Moon className="h-2.5 w-2.5" aria-hidden />
      {until ? `Until ${formatShort(until)}` : 'Paused'}
    </span>
  );
}

function formatShort(dateStr: string): string {
  // Parsed as local noon rather than through Date(yyyy-mm-dd) — that overload
  // is UTC midnight, which formats as the PREVIOUS day west of Greenwich.
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function RoutineDetail({
  routine,
  onBack,
  onDelete,
}: {
  routine: Routine;
  onBack: () => void;
  onDelete: () => void;
}) {
  const items = usePlannerStore((s) => s.items);
  const updateRoutine = usePlannerStore((s) => s.updateRoutine);
  const setRoutinePaused = usePlannerStore((s) => s.setRoutinePaused);
  const { todayStr, tz } = useToday();

  // The name is BUFFERED, not written per keystroke. updateRoutine stamps a
  // history label and set()s, and the subscriber deep-clones the whole snapshot
  // on every change — so a live-bound input turns renaming "Morning kickoff"
  // into 15 undo entries and 15 PATCHes, evicting the user's real history from
  // a 50-deep stack. Committed on blur and on Enter, the EditProjectDialog
  // precedent. Keyed on the routine id so switching rows reloads the buffer.
  const [nameDraft, setNameDraft] = useState(routine.name);
  useEffect(() => setNameDraft(routine.name), [routine.id, routine.name]);
  const commitName = () => {
    const next = nameDraft.trim();
    if (!next || next === routine.name) {
      setNameDraft(routine.name);
      return;
    }
    updateRoutine(routine.id, { name: next });
  };

  const paused = isPausedOn(routine, todayStr, tz);

  // Member ids may reference trashed items — join rows survive an item's soft
  // delete by design, so the arrays are pruned only by the purge CASCADE.
  // Every consumer filters against the live index rather than eagerly cleaning.
  const members = routine.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => !!i);

  return (
    <div className="flex flex-col gap-4" data-testid="routine-detail" data-routine-id={routine.id}>
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground -ml-1 flex items-center gap-1.5 self-start text-sm md:hidden"
        data-testid="routine-detail-back"
      >
        <ChevronLeft className="h-4 w-4" />
        Routines
      </button>

      <div className="flex gap-2">
        <IconPicker
          value={routine.icon}
          name={routine.name}
          onSelect={(icon) => updateRoutine(routine.id, { icon })}
        />
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitName();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') setNameDraft(routine.name);
          }}
          className="bg-background border-border h-9 flex-1"
          aria-label="Routine name"
          data-testid="routine-name-input"
        />
        <ColorSwatchPicker
          value={routine.color}
          fallback={accentColorForName(routine.name)}
          onSelect={(color) => updateRoutine(routine.id, { color })}
          aria-label="Routine color"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="bg-secondary inline-grid grid-flow-col gap-0.5 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setRoutinePaused(routine.id, false)}
            data-testid="routine-state-active"
            className={cn(
              'rounded-md px-3 py-1 text-xs transition-colors',
              !paused ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground'
            )}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setRoutinePaused(routine.id, true)}
            data-testid="routine-state-paused"
            className={cn(
              'rounded-md px-3 py-1 text-xs transition-colors',
              paused ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground'
            )}
          >
            Paused
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-8 w-8"
          onClick={onDelete}
          aria-label="Delete routine"
          data-testid="routine-delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {paused && (
        <p className="text-muted-foreground text-xs" data-testid="routine-paused-note">
          {routine.pausedUntil
            ? `Its items come back on ${formatShort(routine.pausedUntil)}, on their own.`
            : 'Its items are hidden until you resume.'}{' '}
          Streaks and history stay exactly as they are.
        </p>
      )}

      <MemberList routine={routine} members={members} paused={paused} />
    </div>
  );
}

function MemberList({
  routine,
  members,
  paused,
}: {
  routine: Routine;
  members: Item[];
  paused: boolean;
}) {
  const items = usePlannerStore((s) => s.items);
  const updateRoutine = usePlannerStore((s) => s.updateRoutine);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const remove = (id: string) =>
    updateRoutine(routine.id, { itemIds: routine.itemIds.filter((m) => m !== id) });

  const add = (id: string) => {
    updateRoutine(routine.id, { itemIds: [...routine.itemIds, id] });
    setQuery('');
    setAdding(false);
  };

  const q = query.trim().toLowerCase();
  const candidates = q
    ? items
        .filter(
          (i) =>
            isCollectible(i) &&
            !routine.itemIds.includes(i.id) &&
            i.title.toLowerCase().includes(q)
        )
        .slice(0, 6)
    : [];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[10.5px] font-medium tracking-wider uppercase">
        {members.length} {members.length === 1 ? 'item' : 'items'}
      </span>

      {/* Plain overflow-y-auto: <ScrollArea> silently drops max-h. */}
      <div className="max-h-44 space-y-px overflow-y-auto">
        {members.map((item) => (
          <div
            key={item.id}
            data-testid="routine-member"
            data-item-id={item.id}
            className="hover:bg-secondary group flex h-9 items-center gap-2.5 rounded-lg px-2.5"
          >
            {/* Greyed while the routine is paused, NOT struck through — struck
                through means done, and this isn't done, it's set aside. */}
            <span
              className={cn(
                'flex-1 truncate text-sm',
                paused ? 'text-muted-foreground' : 'text-foreground'
              )}
            >
              {item.title}
            </span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove ${item.title} from ${routine.name}`}
              data-testid="routine-member-remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
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
              if (e.key === 'Escape') {
                setAdding(false);
                setQuery('');
              }
              if (e.key === 'Enter' && candidates[0]) add(candidates[0].id);
            }}
            className="bg-background border-border h-8"
            data-testid="routine-member-search"
          />
          {candidates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => add(item.id)}
              data-testid="routine-member-candidate"
              data-item-id={item.id}
              className="hover:bg-secondary flex h-8 items-center rounded-lg px-2.5 text-left text-sm"
            >
              <span className="truncate">{item.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm"
          data-testid="routine-member-add"
        >
          <Plus className="h-3.5 w-3.5" />
          Add an item
        </button>
      )}
    </div>
  );
}
