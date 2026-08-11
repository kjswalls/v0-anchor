'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Moon,
  Repeat,
  CalendarRange,
  Trash2,
  Plus,
  X,
} from 'lucide-react';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { isPausedOn, isProgramActiveOn, inactiveItemIdsOn } from '@/lib/active';
import { isCollectible } from '@/lib/item-registry';
import { toDateStr } from '@/lib/recurrence';
import { cn } from '@/lib/utils';
import type { Item, Routine, Program } from '@/lib/planner-types';

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
 * carry the full state (colour, name, state pill, count) rather than leaning on
 * an editor that may not be there.
 *
 * WHY THE MEMBER LIST GREYS. An inactive container hides its members everywhere
 * else in the app; showing them greyed here — in the same frame as the control
 * that hid them — is the only place cause and consequence are visible together.
 *
 * GUILT-FREE LAW (overlap-blocks decision 1): inactive is never a warning
 * colour, never a badge, never a dotted border. A muted pill and a moon glyph,
 * and a LIVE container wears no marker at all — only the exception is labelled.
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
  const programs = usePlannerStore((s) => s.programs);
  const collectionsAvailable = usePlannerStore((s) => s.collectionsAvailable);
  const addRoutine = usePlannerStore((s) => s.addRoutine);
  const removeRoutine = usePlannerStore((s) => s.removeRoutine);
  const addProgram = usePlannerStore((s) => s.addProgram);
  const removeProgram = usePlannerStore((s) => s.removeProgram);

  // Selection is per-tab. One shared id would make switching tabs open whatever
  // row happened to share an index, which reads as the dialog losing its place.
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'routine'; routine: Routine } | { kind: 'program'; program: Program } | null
  >(null);

  const selectedRoutine = routines.find((r) => r.id === selectedRoutineId) ?? null;
  const selectedProgram = programs.find((p) => p.id === selectedProgramId) ?? null;

  // Reopening should land on the list, not on whatever was last inspected —
  // the dialog stays mounted between opens.
  useEffect(() => {
    if (!open) {
      setSelectedRoutineId(null);
      setSelectedProgramId(null);
    }
  }, [open]);

  // A container deleted from under the selection (or by an undo) must not leave
  // the detail pane rendering a ghost.
  useEffect(() => {
    if (selectedRoutineId && !routines.some((r) => r.id === selectedRoutineId)) {
      setSelectedRoutineId(null);
    }
  }, [routines, selectedRoutineId]);
  useEffect(() => {
    if (selectedProgramId && !programs.some((p) => p.id === selectedProgramId)) {
      setSelectedProgramId(null);
    }
  }, [programs, selectedProgramId]);

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange}>
        <ResponsiveModalContent className="sm:max-w-[680px]">
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="text-foreground">
              Routines &amp; Programs
            </ResponsiveModalTitle>
            <ResponsiveModalDescription className="sr-only">
              Group items into routines and programs, and switch a whole group off at once.
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
                <TwoPane
                  testId="collections-routines"
                  hasSelection={!!selectedRoutine}
                  emptyDetail="Pick a routine to edit it."
                  list={
                    <>
                      <RoutineList
                        routines={routines}
                        selectedId={selectedRoutineId}
                        onSelect={setSelectedRoutineId}
                      />
                      <NewContainerRow
                        placeholder="New routine…"
                        addLabel="Add routine"
                        testPrefix="routine"
                        onAdd={(name, icon) => setSelectedRoutineId(addRoutine({ name, icon, itemIds: [] }))}
                      />
                    </>
                  }
                  detail={
                    selectedRoutine && (
                      <RoutineDetail
                        routine={selectedRoutine}
                        onBack={() => setSelectedRoutineId(null)}
                        onDelete={() =>
                          setConfirmDelete({ kind: 'routine', routine: selectedRoutine })
                        }
                      />
                    )
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="programs" className="mt-4">
              {!collectionsAvailable ? (
                <Unavailable />
              ) : (
                <TwoPane
                  testId="collections-programs"
                  hasSelection={!!selectedProgram}
                  emptyDetail="Pick a program to edit it."
                  list={
                    <>
                      <ProgramList
                        programs={programs}
                        selectedId={selectedProgramId}
                        onSelect={setSelectedProgramId}
                      />
                      <NewContainerRow
                        placeholder="New program…"
                        addLabel="Add program"
                        testPrefix="program"
                        onAdd={(name, icon) =>
                          setSelectedProgramId(
                            // Born 'auto' with no range, which resolves to
                            // always-on: a program you just made must not hide
                            // anything before you have said what it is for.
                            addProgram({ name, icon, state: 'auto', itemIds: [], routineIds: [] })
                          )
                        }
                      />
                    </>
                  }
                  detail={
                    selectedProgram && (
                      <ProgramDetail
                        program={selectedProgram}
                        onBack={() => setSelectedProgramId(null)}
                        onDelete={() =>
                          setConfirmDelete({ kind: 'program', program: selectedProgram })
                        }
                      />
                    )
                  }
                />
              )}
            </TabsContent>
          </Tabs>
        </ResponsiveModalContent>
      </ResponsiveModal>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this {confirmDelete?.kind === 'program' ? 'program' : 'routine'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && <DeleteConsequence target={confirmDelete} />}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="collection-delete-confirm"
              onClick={() => {
                if (confirmDelete?.kind === 'routine') removeRoutine(confirmDelete.routine.id);
                if (confirmDelete?.kind === 'program') removeProgram(confirmDelete.program.id);
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

/**
 * What deleting actually does, said plainly.
 *
 * A deleted container releases its members rather than taking them with it, and
 * for an INACTIVE one that means work reappears. Saying so beats letting the
 * user discover it on the grid: "delete" reads as subtraction, and here it can
 * add rows back.
 */
function DeleteConsequence({
  target,
}: {
  target: { kind: 'routine'; routine: Routine } | { kind: 'program'; program: Program };
}) {
  const { todayStr, tz } = useToday();
  const liveIds = useLiveItemIds();
  const liveRoutineIds = useLiveRoutineIds();

  if (target.kind === 'routine') {
    const n = countLive(target.routine.itemIds, liveIds);
    const paused = isPausedOn(target.routine, todayStr, tz);
    return (
      <>
        &ldquo;{target.routine.name}&rdquo; is removed, but its {n} {n === 1 ? 'item' : 'items'}{' '}
        stay exactly as they are — they just stop being grouped
        {paused ? ', and they come back into view' : ''}.
      </>
    );
  }

  const program = target.program;
  const n = countLive(program.itemIds, liveIds);
  const r = countLive(program.routineIds, liveRoutineIds);
  const live = isProgramActiveOn(program, todayStr);
  const held = [
    n > 0 ? `${n} ${n === 1 ? 'item' : 'items'}` : null,
    r > 0 ? `${r} ${r === 1 ? 'routine' : 'routines'}` : null,
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    <>
      &ldquo;{program.name}&rdquo; is removed
      {held ? `, but the ${held} it holds stay exactly as they are` : ''}
      {!live && (n > 0 || r > 0) ? ' — and anything it was hiding comes back into view' : ''}.
    </>
  );
}

/**
 * The list/detail shell both tabs share. Below `md` the detail REPLACES the
 * list; above it, both are mounted. One media query, no forked component tree.
 */
function TwoPane({
  testId,
  hasSelection,
  list,
  detail,
  emptyDetail,
}: {
  testId: string;
  hasSelection: boolean;
  list: React.ReactNode;
  detail: React.ReactNode;
  emptyDetail: string;
}) {
  return (
    <div className="md:grid md:grid-cols-[210px_1fr] md:gap-0" data-testid={testId}>
      <div className={cn('md:block md:border-border md:border-r md:pr-3', hasSelection && 'hidden')}>
        {list}
      </div>
      <div className={cn('md:block md:pl-4', !hasSelection && 'hidden')}>
        {hasSelection ? (
          detail
        ) : (
          <p className="text-muted-foreground hidden py-10 text-center text-sm md:block">
            {emptyDetail}
          </p>
        )}
      </div>
    </div>
  );
}

function NewContainerRow({
  placeholder,
  addLabel,
  testPrefix,
  onAdd,
}: {
  placeholder: string;
  addLabel: string;
  testPrefix: string;
  onAdd: (name: string, icon: string | undefined) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | undefined>(undefined);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, icon);
    setName('');
    setIcon(undefined);
  };

  return (
    <div className="mt-3 flex gap-2">
      <IconPicker value={icon} name={name} onSelect={setIcon} />
      <Input
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="bg-background border-border h-9 flex-1"
        data-testid={`${testPrefix}-new-name`}
      />
      <Button
        size="icon"
        variant="secondary"
        className="h-9 w-9 shrink-0"
        onClick={submit}
        disabled={!name.trim()}
        aria-label={addLabel}
        data-testid={`${testPrefix}-add`}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Unavailable() {
  return (
    <p
      className="text-muted-foreground py-10 text-center text-sm"
      data-testid="collections-unavailable"
    >
      Routines and programs aren&apos;t available on this account yet.
    </p>
  );
}

/** Today, in the user's zone. Activation is dateless — never the selected date. */
function useToday(): { todayStr: string; tz: string } {
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { todayStr: toDateStr(new Date(), tz), tz };
}

/**
 * Member ids may name trashed items — join rows outlive an item's soft delete by
 * design, so the arrays are pruned only by the purge CASCADE. Every consumer
 * filters against this live index rather than eagerly cleaning.
 */
function useLiveItemIds(): Set<string> {
  const items = usePlannerStore((s) => s.items);
  return useMemo(() => new Set(items.map((i) => i.id)), [items]);
}

/** The same rule one layer up: `program.routineIds` may name a trashed routine. */
function useLiveRoutineIds(): Set<string> {
  const routines = usePlannerStore((s) => s.routines);
  return useMemo(() => new Set(routines.map((r) => r.id)), [routines]);
}

const countLive = (ids: readonly string[], live: Set<string>) =>
  ids.reduce((n, id) => n + (live.has(id) ? 1 : 0), 0);

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
  const liveIds = useLiveItemIds();

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
          <ContainerRow
            key={routine.id}
            testId="routine-row"
            idAttr={{ 'data-routine-id': routine.id }}
            icon={routine.icon}
            name={routine.name}
            selected={selectedId === routine.id}
            dimmed={paused}
            pill={paused ? <StatePill label={routine.pausedUntil ? `Until ${formatShort(routine.pausedUntil)}` : 'Paused'} testId="routine-paused-pill" /> : null}
            count={countLive(routine.itemIds, liveIds)}
            onSelect={() => onSelect(routine.id)}
          />
        );
      })}
    </div>
  );
}

function ProgramList({
  programs,
  selectedId,
  onSelect,
}: {
  programs: Program[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { todayStr } = useToday();
  const liveIds = useLiveItemIds();
  // Routine ids need the same live-index filter the item ids get. A routine's
  // soft delete leaves the program_routines join row alone (restore-intact, by
  // design), so a raw length keeps counting a routine nobody can see — and the
  // detail pane one click away filters it out, so the manager disagreed with
  // itself permanently rather than for a frame.
  const liveRoutineIds = useLiveRoutineIds();

  if (programs.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No programs yet. A program is a stretch of life — a summer, a term — that switches whole
        routines on and off.
      </p>
    );
  }

  return (
    <div className="max-h-64 space-y-px overflow-y-auto">
      {programs.map((program) => {
        const pill = programPillLabel(program, todayStr);
        return (
          <ContainerRow
            key={program.id}
            testId="program-row"
            idAttr={{ 'data-program-id': program.id }}
            icon={program.icon}
            name={program.name}
            selected={selectedId === program.id}
            dimmed={!!pill}
            pill={pill ? <StatePill label={pill} testId="program-state-pill" /> : null}
            // Items held directly PLUS whole routines: both are things this
            // program switches, and a program that holds only routines would
            // otherwise read as empty.
            count={
              countLive(program.itemIds, liveIds) + countLive(program.routineIds, liveRoutineIds)
            }
            onSelect={() => onSelect(program.id)}
          />
        );
      })}
    </div>
  );
}

/**
 * The one-line reason a program is not currently carrying its members, or null
 * when it is. A live program wears no marker — only the exception is labelled.
 */
function programPillLabel(program: Program, todayStr: string): string | null {
  if (isProgramActiveOn(program, todayStr)) return null;
  if (program.state === 'paused') return 'Paused';
  if (program.startsOn && todayStr < program.startsOn) return `From ${formatShort(program.startsOn)}`;
  return 'Ended';
}

function ContainerRow({
  testId,
  idAttr,
  icon,
  name,
  selected,
  dimmed,
  pill,
  count,
  onSelect,
}: {
  testId: string;
  idAttr: Record<string, string>;
  icon?: string;
  name: string;
  selected: boolean;
  dimmed: boolean;
  pill: React.ReactNode;
  count: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      data-paused={dimmed ? '' : undefined}
      {...idAttr}
      className={cn(
        'hover:bg-secondary flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors',
        selected && 'bg-secondary'
      )}
    >
      <CategoryIcon glyph={icon} name={name} />
      <span className="text-foreground flex-1 truncate text-sm font-medium">{name}</span>
      {pill}
      <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0 md:hidden" />
    </button>
  );
}

/**
 * Muted, with a moon. Never amber, never red, never a dotted border — set aside
 * is a decision the user made on purpose and should look like one.
 */
function StatePill({ label, testId }: { label: string; testId: string }) {
  return (
    <span
      data-testid={testId}
      className="bg-muted text-muted-foreground inline-flex h-[19px] shrink-0 items-center gap-1 rounded px-1.5 text-[10.5px] font-medium"
    >
      <Moon className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

function formatShort(dateStr: string): string {
  // Parsed as local noon rather than through Date(yyyy-mm-dd) — that overload
  // is UTC midnight, which formats as the PREVIOUS day west of Greenwich.
  const d = parseDay(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** `yyyy-MM-dd` → a local-noon Date, or undefined. Same anti-UTC reasoning. */
function parseDay(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12);
}

/** Buffered rename — see the long note in ContainerNameRow's caller. */
function useNameDraft(id: string, name: string, commit: (next: string) => void) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [id, name]);
  return {
    draft,
    setDraft,
    reset: () => setDraft(name),
    commit: () => {
      const next = draft.trim();
      if (!next || next === name) {
        setDraft(name);
        return;
      }
      commit(next);
    },
  };
}

/**
 * Icon + name + colour, shared by both detail panes.
 *
 * The name is BUFFERED, not written per keystroke. The update actions stamp a
 * history label and set(), and the subscriber deep-clones the whole snapshot on
 * every change — so a live-bound input turns renaming "Morning kickoff" into 15
 * undo entries and 15 PATCHes, evicting the user's real history from a 50-deep
 * stack. Committed on blur and on Enter, the EditProjectDialog precedent.
 */
function IdentityRow({
  id,
  name,
  icon,
  color,
  label,
  testPrefix,
  onPatch,
}: {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  label: string;
  testPrefix: string;
  onPatch: (patch: { name?: string; icon?: string; color?: string }) => void;
}) {
  const nameDraft = useNameDraft(id, name, (next) => onPatch({ name: next }));

  return (
    <div className="flex gap-2">
      <IconPicker value={icon} name={name} onSelect={(next) => onPatch({ icon: next })} />
      <Input
        value={nameDraft.draft}
        onChange={(e) => nameDraft.setDraft(e.target.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            nameDraft.commit();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') nameDraft.reset();
        }}
        className="bg-background border-border h-9 flex-1"
        aria-label={`${label} name`}
        data-testid={`${testPrefix}-name-input`}
      />
      <ColorSwatchPicker
        value={color}
        fallback={accentColorForName(name)}
        onSelect={(next) => onPatch({ color: next })}
        aria-label={`${label} color`}
      />
    </div>
  );
}

function Segmented({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-secondary inline-grid grid-flow-col gap-0.5 rounded-lg p-0.5">{children}</div>
  );
}

function SegmentedOption({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? '' : undefined}
      className={cn(
        'rounded-md px-3 py-1 text-xs transition-colors',
        active ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground'
      )}
    >
      {children}
    </button>
  );
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

  const paused = isPausedOn(routine, todayStr, tz);
  const members = routine.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => !!i);

  return (
    <div className="flex flex-col gap-4" data-testid="routine-detail" data-routine-id={routine.id}>
      <BackRow onBack={onBack} label="Routines" testId="routine-detail-back" />

      <IdentityRow
        id={routine.id}
        name={routine.name}
        icon={routine.icon}
        color={routine.color}
        label="Routine"
        testPrefix="routine"
        onPatch={(patch) => updateRoutine(routine.id, patch)}
      />

      <div className="flex items-center justify-between">
        <Segmented>
          <SegmentedOption
            active={!paused}
            onClick={() => setRoutinePaused(routine.id, false)}
            testId="routine-state-active"
          >
            Active
          </SegmentedOption>
          <SegmentedOption
            active={paused}
            onClick={() => setRoutinePaused(routine.id, true)}
            testId="routine-state-paused"
          >
            Paused
          </SegmentedOption>
        </Segmented>
        <DeleteButton onDelete={onDelete} label="Delete routine" testId="routine-delete" />
      </div>

      {paused && (
        <p className="text-muted-foreground text-xs" data-testid="routine-paused-note">
          {routine.pausedUntil
            ? `Its items come back on ${formatShort(routine.pausedUntil)}, on their own.`
            : 'Its items are hidden until you resume.'}{' '}
          Streaks and history stay exactly as they are.
        </p>
      )}

      <ItemMemberList
        ownerName={routine.name}
        memberIds={routine.itemIds}
        members={members}
        dimmed={paused}
        testPrefix="routine"
        orderable
        onChange={(itemIds) => updateRoutine(routine.id, { itemIds })}
      />
    </div>
  );
}

function BackRow({
  onBack,
  label,
  testId,
}: {
  onBack: () => void;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="text-muted-foreground -ml-1 flex items-center gap-1.5 self-start text-sm md:hidden"
      data-testid={testId}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

function DeleteButton({
  onDelete,
  label,
  testId,
}: {
  onDelete: () => void;
  label: string;
  testId: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-destructive h-8 w-8"
      onClick={onDelete}
      aria-label={label}
      data-testid={testId}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function ProgramDetail({
  program,
  onBack,
  onDelete,
}: {
  program: Program;
  onBack: () => void;
  onDelete: () => void;
}) {
  const items = usePlannerStore((s) => s.items);
  const programs = usePlannerStore((s) => s.programs);
  const updateProgram = usePlannerStore((s) => s.updateProgram);
  const setProgramState = usePlannerStore((s) => s.setProgramState);
  const swapToProgram = usePlannerStore((s) => s.swapToProgram);
  const { todayStr } = useToday();

  const live = isProgramActiveOn(program, todayStr);
  const members = program.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => !!i);

  // The swap verb only earns its place when there is something to swap AWAY
  // from. With no other program on, "Switch to this" and "Active" would be the
  // same button wearing two labels.
  const displaced = programs.filter((p) => p.id !== program.id && isProgramActiveOn(p, todayStr));

  return (
    <div className="flex flex-col gap-4" data-testid="program-detail" data-program-id={program.id}>
      <BackRow onBack={onBack} label="Programs" testId="program-detail-back" />

      <IdentityRow
        id={program.id}
        name={program.name}
        icon={program.icon}
        color={program.color}
        label="Program"
        testPrefix="program"
        onPatch={(patch) => updateProgram(program.id, patch)}
      />

      <div className="flex items-center justify-between">
        <Segmented>
          <SegmentedOption
            active={program.state === 'active'}
            onClick={() => setProgramState(program.id, 'active')}
            testId="program-state-active"
          >
            On
          </SegmentedOption>
          <SegmentedOption
            active={program.state === 'paused'}
            onClick={() => setProgramState(program.id, 'paused')}
            testId="program-state-paused"
          >
            Off
          </SegmentedOption>
          <SegmentedOption
            active={program.state === 'auto'}
            onClick={() => setProgramState(program.id, 'auto')}
            testId="program-state-auto"
          >
            Dates
          </SegmentedOption>
        </Segmented>
        <DeleteButton onDelete={onDelete} label="Delete program" testId="program-delete" />
      </div>

      {/* The range only renders under 'Dates'. On/Off are manual overrides that
          always win, so showing pickers beside them would offer a control with
          no effect — and the dates are still on the row, waiting, when the user
          switches back. */}
      {program.state === 'auto' && (
        <DateRangeRow
          startsOn={program.startsOn}
          endsOn={program.endsOn}
          onChange={(patch) => updateProgram(program.id, patch)}
        />
      )}

      <p className="text-muted-foreground text-xs" data-testid="program-state-note">
        <ProgramStateNote program={program} live={live} />
      </p>

      {!live && displaced.length > 0 && (
        <button
          type="button"
          onClick={() => swapToProgram(program.id)}
          data-testid="program-swap"
          className="text-foreground hover:bg-secondary -mx-1 flex flex-col items-start gap-0.5 rounded-lg px-1 py-1.5 text-left text-xs transition-colors"
        >
          <span className="font-medium">Switch to this program</span>
          <span className="text-muted-foreground">
            Turns off {displaced.map((p) => p.name).join(', ')}. One undo puts it all back.
          </span>
        </button>
      )}

      <RoutineMemberList program={program} live={live} />

      <ItemMemberList
        ownerName={program.name}
        memberIds={program.itemIds}
        members={members}
        dimmed={!live}
        testPrefix="program"
        onChange={(itemIds) => updateProgram(program.id, { itemIds })}
      />
    </div>
  );
}

function ProgramStateNote({ program, live }: { program: Program; live: boolean }) {
  if (program.state === 'active') {
    return <>On until you say otherwise — dates are ignored while it is set this way.</>;
  }
  if (program.state === 'paused') {
    return <>Off. Everything it holds is hidden, and streaks and history stay exactly as they are.</>;
  }
  if (!program.startsOn && !program.endsOn) {
    return <>Always on. Give it a start or an end to make it follow the calendar.</>;
  }
  const from = program.startsOn ? formatShort(program.startsOn) : null;
  const to = program.endsOn ? formatShort(program.endsOn) : null;
  const span = from && to ? `${from} to ${to}` : from ? `from ${from}` : `until ${to}`;
  return (
    <>
      Runs {span}, inclusive. {live ? 'On now.' : 'Off right now — nothing it holds is showing.'}
    </>
  );
}

function DateRangeRow({
  startsOn,
  endsOn,
  onChange,
}: {
  startsOn?: string;
  endsOn?: string;
  onChange: (patch: { startsOn?: string; endsOn?: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Each field bounds the other. Without this the two are independent
          single-day pickers and an inverted range (starts after ends) is one
          careless click away — a range that is live on NO date, so every member
          vanishes permanently with the manager still cheerfully reporting
          "Runs Sep 1 to Aug 1, inclusive." */}
      <DayField
        label="Starts"
        value={startsOn}
        testId="program-starts-on"
        disabledDays={endsOn ? { after: parseDay(endsOn)! } : undefined}
        onChange={(next) => onChange({ startsOn: next })}
      />
      <span className="text-muted-foreground text-xs">→</span>
      <DayField
        label="Ends"
        value={endsOn}
        testId="program-ends-on"
        disabledDays={startsOn ? { before: parseDay(startsOn)! } : undefined}
        onChange={(next) => onChange({ endsOn: next })}
      />
    </div>
  );
}

function DayField({
  label,
  value,
  testId,
  disabledDays,
  onChange,
}: {
  label: string;
  value?: string;
  testId: string;
  /**
   * A react-day-picker v9 matcher. Typed as the two single-key shapes rather
   * than `{before?, after?}`, because both-optional matches no member of the
   * library's Matcher union — `DateInterval` requires BOTH, and it would also
   * be the wrong semantics here (that one disables the days between them).
   */
  disabledDays?: { before: Date } | { after: Date };
  onChange: (next: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDay(value);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-border h-8 gap-1.5 text-xs font-normal"
            data-testid={testId}
          >
            <span className="text-muted-foreground">{label}</span>
            {value ? formatShort(value) : <span className="text-muted-foreground">any day</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            // v9 matcher. `{before}`/`{after}` are STRICT, which is what an
            // inclusive range wants: starts and ends may legitimately be the
            // same day (a one-day program), and only crossing is forbidden.
            disabled={disabledDays}
            onSelect={(date) => {
              // `format`, not toDateStr: react-day-picker hands back a
              // browser-LOCAL-midnight Date, and re-reading that instant in
              // another zone shifts it to the previous day. A picked day is a
              // wall-calendar choice, not an instant. (Phase 1 shipped the bug.)
              onChange(date ? format(date, 'yyyy-MM-dd') : undefined);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Clear ${label.toLowerCase()} date`}
          data-testid={`${testId}-clear`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * The routines a program holds.
 *
 * Attaching is the one membership write in the app with a NON-OBVIOUS
 * consequence, so it is the one that confirms first — see AttachRoutineConfirm.
 */
function RoutineMemberList({ program, live }: { program: Program; live: boolean }) {
  const routines = usePlannerStore((s) => s.routines);
  const allPrograms = usePlannerStore((s) => s.programs);
  const items = usePlannerStore((s) => s.items);
  const updateProgram = usePlannerStore((s) => s.updateProgram);
  const liveIds = useLiveItemIds();
  const { todayStr, tz } = useToday();
  const [adding, setAdding] = useState(false);
  const [pendingAttach, setPendingAttach] = useState<{ routine: Routine; hides: number } | null>(
    null
  );

  const members = program.routineIds
    .map((id) => routines.find((r) => r.id === id))
    .filter((r): r is Routine => !!r);

  const attach = (routine: Routine) =>
    updateProgram(program.id, { routineIds: [...program.routineIds, routine.id] });

  /**
   * How many items this attach would ACTUALLY hide, asked of the resolver by
   * simulating the join rather than counting members.
   *
   * A raw member count is wrong three ways at once: members already hidden by
   * the routine's own pause, members the user paused by hand, and members held
   * by a second live program all count toward it while none of them would move.
   * At worst that produces a confirm saying "this will hide 5 items" for a
   * write that hides nothing — which teaches the user to dismiss the dialog
   * unread, and this is the one dialog in the app that has something to say.
   */
  const wouldHide = (routine: Routine): number => {
    const ctx = { userTimezone: tz, routines, programs: allPrograms };
    const before = inactiveItemIdsOn(items, todayStr, ctx);
    const after = inactiveItemIdsOn(items, todayStr, {
      ...ctx,
      programs: allPrograms.map((p) =>
        p.id === program.id ? { ...p, routineIds: [...p.routineIds, routine.id] } : p
      ),
    });
    let n = 0;
    for (const id of after) if (!before.has(id)) n += 1;
    return n;
  };

  const requestAttach = (routine: Routine) => {
    setAdding(false);
    // Only the FIRST program a routine joins rescopes it. A second is purely
    // additive — the path algebra is disjunctive — so warning there would train
    // the user to dismiss the dialog that matters.
    const heldElsewhere = allPrograms.some(
      (p) => p.id !== program.id && p.routineIds.includes(routine.id)
    );
    const hides = heldElsewhere ? 0 : wouldHide(routine);
    if (hides > 0) setPendingAttach({ routine, hides });
    else attach(routine);
  };

  const candidates = routines.filter((r) => !program.routineIds.includes(r.id));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[10.5px] font-medium tracking-wider uppercase">
          {members.length} {members.length === 1 ? 'routine' : 'routines'}
        </span>

        <div className="max-h-32 space-y-px overflow-y-auto">
          {members.map((routine) => (
            <div
              key={routine.id}
              data-testid="program-routine-member"
              data-routine-id={routine.id}
              className="hover:bg-secondary group flex h-9 items-center gap-2.5 rounded-lg px-2.5"
            >
              <CategoryIcon glyph={routine.icon} name={routine.name} />
              <span
                className={cn(
                  'flex-1 truncate text-sm',
                  live ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {routine.name}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {countLive(routine.itemIds, liveIds)}
              </span>
              <button
                type="button"
                onClick={() =>
                  updateProgram(program.id, {
                    routineIds: program.routineIds.filter((id) => id !== routine.id),
                  })
                }
                className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove ${routine.name} from ${program.name}`}
                data-testid="program-routine-remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {adding && candidates.length > 0 ? (
          <div className="flex flex-col gap-1">
            {candidates.map((routine) => (
              <button
                key={routine.id}
                type="button"
                onClick={() => requestAttach(routine)}
                data-testid="program-routine-candidate"
                data-routine-id={routine.id}
                className="hover:bg-secondary flex h-8 items-center gap-2 rounded-lg px-2.5 text-left text-sm"
              >
                <CategoryIcon glyph={routine.icon} name={routine.name} />
                <span className="truncate">{routine.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={candidates.length === 0}
            className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm disabled:opacity-50"
            data-testid="program-routine-add"
          >
            <Plus className="h-3.5 w-3.5" />
            {candidates.length === 0 ? 'Every routine is already here' : 'Add a routine'}
          </button>
        )}
      </div>

      <AttachRoutineConfirm
        pending={pendingAttach}
        program={program}
        todayStr={todayStr}
        onCancel={() => setPendingAttach(null)}
        onConfirm={() => {
          if (pendingAttach) attach(pendingAttach.routine);
          setPendingAttach(null);
        }}
      />
    </>
  );
}

/**
 * The attach discontinuity, said out loud (plan decision 3).
 *
 * A routine that belongs to NO program answers for itself. Put it in its first
 * program and the program answers too — so attaching a live routine to a program
 * that is off makes its items vanish from today as a side effect of a join
 * write. That is the algebra working as designed (scoping a routine IS the
 * point), but an unannounced "5 items disappeared" reads as a bug, so the one
 * membership write with a non-obvious consequence states it before committing.
 */
function AttachRoutineConfirm({
  pending,
  program,
  todayStr,
  onCancel,
  onConfirm,
}: {
  pending: { routine: Routine; hides: number } | null;
  program: Program;
  todayStr: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const routine = pending?.routine ?? null;
  const n = pending?.hides ?? 0;
  const returns =
    program.state === 'auto' && program.startsOn && todayStr < program.startsOn
      ? formatShort(program.startsOn)
      : null;

  return (
    <AlertDialog open={!!routine} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            This will hide {n} {n === 1 ? 'item' : 'items'} for now
          </AlertDialogTitle>
          <AlertDialogDescription>
            {routine && (
              <>
                &ldquo;{routine.name}&rdquo; looks after itself today. Putting it in{' '}
                {program.name} hands that over — and {program.name} is off, so its {n}{' '}
                {n === 1 ? 'item' : 'items'}{' '}
                {returns ? `come back on ${returns}` : 'stay hidden until you switch it on'}.
                Nothing is deleted, and taking it back out restores them.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction data-testid="program-routine-attach-confirm" onClick={onConfirm}>
            Add it anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Swap two members by id, leaving every other position — including any id that
 * names a trashed item — exactly where it was. Returns the same array when
 * either id is absent, so a stale click writes nothing.
 */
export function swapMembers(ids: string[], a: string, b: string): string[] {
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0 || i === j) return ids;
  const next = [...ids];
  next[i] = b;
  next[j] = a;
  return next;
}

function ItemMemberList({
  ownerName,
  memberIds,
  members,
  dimmed,
  testPrefix,
  orderable = false,
  onChange,
}: {
  ownerName: string;
  memberIds: string[];
  members: Item[];
  dimmed: boolean;
  testPrefix: string;
  /**
   * Routines only, and not as a taste call: `routine_items` carries a
   * `sort_order` column (written from the array index by reconcileMembership)
   * and `program_items` does not. Offering the controls on a program would let
   * the user arrange an order that survives until the next fetch and then
   * silently reshuffles.
   */
  orderable?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const items = usePlannerStore((s) => s.items);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const add = (id: string) => {
    onChange([...memberIds, id]);
    setQuery('');
    setAdding(false);
  };

  const q = query.trim().toLowerCase();
  const candidates = q
    ? items
        .filter((i) => isCollectible(i) && !memberIds.includes(i.id) && i.title.toLowerCase().includes(q))
        .slice(0, 6)
    : [];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[10.5px] font-medium tracking-wider uppercase">
        {members.length} {members.length === 1 ? 'item' : 'items'}
      </span>

      {/* Plain overflow-y-auto: <ScrollArea> silently drops max-h. */}
      <div className="max-h-44 space-y-px overflow-y-auto">
        {members.map((item, i) => (
          <div
            key={item.id}
            data-testid={`${testPrefix}-member`}
            data-item-id={item.id}
            data-member-index={i}
            className="hover:bg-secondary group flex h-9 items-center gap-2.5 rounded-lg px-2.5"
          >
            {/* Greyed while the container is off, NOT struck through — struck
                through means done, and this isn't done, it's set aside. */}
            <span
              className={cn('flex-1 truncate text-sm', dimmed ? 'text-muted-foreground' : 'text-foreground')}
            >
              {item.title}
            </span>
            {/* Buttons, not drag. The whole dialog renders inside the shell's
                DndContext, so a sortable list here would need a nested one and
                would compete with the item-drag sensors for the same pointer.
                Two buttons are also the only version of this a keyboard can
                reach. They are hidden until hover or focus, like Remove beside
                them, so a settled list stays a list.

                Swaps by ID, never by index. `members` drops ids that name a
                TRASHED item (the join rows survive an item's soft delete by
                design), so the visible position and the array position diverge
                the moment one member is in the bin — and an index swap would
                then reorder a row the user cannot see instead of the two they
                are looking at. */}
            {/* Visible unconditionally below md and hover-revealed above it.
                This dialog is a bottom SHEET on mobile, where there is no hover
                and no prior focus — reordering was the one thing group-by
                routine shipped to make observable, and on a phone it was two
                invisible targets you had to guess at.

                24px boxes with a gap, not bare 14px glyphs touching each other:
                two adjacent sub-24px targets are a mis-tap away from swapping in
                the wrong direction, and the write goes straight to the DB.

                aria-disabled, NOT disabled. A real `disabled` at the end of the
                list drops focus to the body the moment the last press lands it
                there, and `focus-within` then fades the pair out — so a
                keyboard user walking a member down loses their place and has to
                tab from the top of the dialog. The handler guards instead. */}
            {orderable && (
              <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                <button
                  type="button"
                  aria-disabled={i === 0}
                  onClick={() =>
                    i > 0 && onChange(swapMembers(memberIds, item.id, members[i - 1].id))
                  }
                  className="text-muted-foreground hover:text-foreground flex h-6 w-6 items-center justify-center rounded aria-disabled:pointer-events-none aria-disabled:opacity-30"
                  aria-label={`Move ${item.title} up in ${ownerName}`}
                  data-testid={`${testPrefix}-member-up`}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-disabled={i === members.length - 1}
                  onClick={() =>
                    i < members.length - 1 &&
                    onChange(swapMembers(memberIds, item.id, members[i + 1].id))
                  }
                  className="text-muted-foreground hover:text-foreground flex h-6 w-6 items-center justify-center rounded aria-disabled:pointer-events-none aria-disabled:opacity-30"
                  aria-label={`Move ${item.title} down in ${ownerName}`}
                  data-testid={`${testPrefix}-member-down`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => onChange(memberIds.filter((m) => m !== item.id))}
              className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove ${item.title} from ${ownerName}`}
              data-testid={`${testPrefix}-member-remove`}
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
            data-testid={`${testPrefix}-member-search`}
          />
          {candidates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => add(item.id)}
              data-testid={`${testPrefix}-member-candidate`}
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
          data-testid={`${testPrefix}-member-add`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add an item
        </button>
      )}
    </div>
  );
}
