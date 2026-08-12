'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { inactiveItemIdsOn, isProgramActiveOn } from '@/lib/active';
import {
  byName,
  countLive,
  formatShort,
  matching,
  parseDay,
  programPillLabel,
  useLiveItemIds,
  useLiveRoutineIds,
  useToday,
} from '@/lib/collections';
import { ObjectRow, Segmented, SegmentedOption, SettingRow } from '../primitives';
import {
  BackRow,
  DangerZone,
  DayField,
  DetailColumn,
  DraftRow,
  IdentityRow,
  ListColumn,
  TeachingLine,
} from '../detail-parts';
import { ItemMemberList, RoutineMemberList } from '../member-list';
import type { Item, Program, Routine } from '@/lib/planner-types';

/**
 * PROGRAMS — a stretch of life that switches whole routines on and off.
 *
 * Moved from ManageCollectionsDialog with every data-testid intact
 * (memory/plans/organize-console.md, Phase 2). The three things worth knowing
 * before changing anything here are all about the tri-state:
 *
 *   On / Off are MANUAL OVERRIDES and always win — a person who flips a program
 *   by hand ("we came back early") must never be second-guessed by a date they
 *   set weeks ago. Only Dates is date-resolved, which is why the range renders
 *   under Dates alone: pickers beside On or Off would be controls with no
 *   effect. The dates stay on the row meanwhile, waiting.
 */
export function ProgramsSection({
  selectedId,
  onSelect,
  focusNew,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusNew: boolean;
}) {
  const programs = usePlannerStore((s) => s.programs);
  const collectionsAvailable = usePlannerStore((s) => s.collectionsAvailable);
  const userId = usePlannerStore((s) => s.userId);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const addProgram = usePlannerStore((s) => s.addProgram);
  const liveIds = useLiveItemIds();
  const liveRoutineIds = useLiveRoutineIds();
  const { todayStr } = useToday();

  const [query, setQuery] = useState('');

  const selected = programs.find((p) => p.id === selectedId) ?? null;
  const visible = matching(programs, query, byName);
  const canCreate = collectionsAvailable && !!userId && !isLoading;

  return (
    <>
      <ListColumn
        eyebrow="PROGRAMS"
        count={visible.length}
        hasSelection={!!selected}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: 'Filter programs…',
          testId: 'program-filter',
        }}
        footer={
          <DraftRow
            placeholder="New program…"
            addLabel="Add program"
            testPrefix="program"
            disabled={!canCreate}
            autoFocus={focusNew}
            onAdd={(name, icon) =>
              onSelect(
                // `auto` with no dates, never 'active': a program you just made
                // must not hide anything, and an always-on default is the one
                // state that cannot.
                addProgram({ name, icon, state: 'auto', itemIds: [], routineIds: [] })
              )
            }
          />
        }
      >
        {!collectionsAvailable ? (
          <p
            className="text-muted-foreground px-[7px] pt-2 text-xs"
            data-testid="collections-unavailable"
          >
            Routines and programs aren&apos;t available on this account yet.
          </p>
        ) : programs.length === 0 ? (
          <p className="text-muted-foreground px-[7px] pt-2 text-xs">No programs yet.</p>
        ) : (
          visible.map((program) => (
            <ObjectRow
              key={program.id}
              testId="program-row"
              idAttr={{ 'data-program-id': program.id }}
              icon={program.icon}
              color={program.color}
              name={program.name}
              selected={selectedId === program.id}
              pill={programPillLabel(program, todayStr)}
              pillTestId="program-state-pill"
              // Both member arrays. Routines are the members a program is
              // usually built out of, and one holding only routines would
              // otherwise read as empty.
              count={
                countLive(program.itemIds, liveIds) +
                countLive(program.routineIds, liveRoutineIds)
              }
              onSelect={() => onSelect(program.id)}
            />
          ))
        )}
      </ListColumn>

      <DetailColumn hasSelection={!!selected}>
        {selected ? (
          <ProgramDetail program={selected} onBack={() => onSelect(null)} />
        ) : (
          <TeachingLine>
            A program is a stretch of life — a summer, a term — that switches whole routines on
            and off.
          </TeachingLine>
        )}
      </DetailColumn>
    </>
  );
}

function ProgramDetail({ program, onBack }: { program: Program; onBack: () => void }) {
  const items = usePlannerStore((s) => s.items);
  const routines = usePlannerStore((s) => s.routines);
  const programs = usePlannerStore((s) => s.programs);
  const updateProgram = usePlannerStore((s) => s.updateProgram);
  const setProgramState = usePlannerStore((s) => s.setProgramState);
  const swapToProgram = usePlannerStore((s) => s.swapToProgram);
  const removeProgram = usePlannerStore((s) => s.removeProgram);
  const confirm = useUIStore((s) => s.confirm);
  const liveIds = useLiveItemIds();
  const liveRoutineIds = useLiveRoutineIds();
  const { todayStr, tz } = useToday();

  const live = isProgramActiveOn(program, todayStr);
  const members = program.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => !!i);
  const routineMembers = program.routineIds
    .map((id) => routines.find((r) => r.id === id))
    .filter((r): r is Routine => !!r);

  const itemCount = countLive(program.itemIds, liveIds);
  const routineCount = countLive(program.routineIds, liveRoutineIds);

  // The swap verb only earns its place when there is something to swap AWAY
  // from. With no other program on, "Switch to this" and "On" would be the same
  // button wearing two labels.
  const displaced = programs.filter((p) => p.id !== program.id && isProgramActiveOn(p, todayStr));

  /**
   * How many items an attach would ACTUALLY hide, asked of the resolver by
   * simulating the join rather than counting members.
   *
   * A raw member count is wrong three ways at once: members already hidden by
   * the routine's own pause, members the user paused by hand, and members held
   * by a second live program all count toward it while none of them would move.
   * At worst that produces a confirm saying "this will hide 5 items" for a write
   * that hides nothing — which teaches the user to dismiss the prompt unread,
   * and this is the one prompt in the app that has something to say.
   */
  const wouldHide = (routine: Routine): number => {
    const ctx = { userTimezone: tz, routines, programs };
    const before = inactiveItemIdsOn(items, todayStr, ctx);
    const after = inactiveItemIdsOn(items, todayStr, {
      ...ctx,
      programs: programs.map((p) =>
        p.id === program.id ? { ...p, routineIds: [...p.routineIds, routine.id] } : p
      ),
    });
    let n = 0;
    for (const id of after) if (!before.has(id)) n += 1;
    return n;
  };

  const attach = (routine: Routine) =>
    updateProgram(program.id, { routineIds: [...program.routineIds, routine.id] });

  /**
   * The attach discontinuity, said out loud (programs-routines decision 3).
   *
   * A routine that belongs to NO program answers for itself. Put it in its first
   * program and the program answers too — so attaching a live routine to a
   * program that is off makes its items vanish from today as a side effect of a
   * join write. That is the algebra working as designed (scoping a routine IS
   * the point), but an unannounced "5 items disappeared" reads as a bug.
   */
  const requestAttach = (routine: Routine) => {
    // Only the FIRST program a routine joins rescopes it. A second is purely
    // additive — the path algebra is disjunctive — so warning there would train
    // the user to dismiss the prompt that matters.
    const heldElsewhere = programs.some(
      (p) => p.id !== program.id && p.routineIds.includes(routine.id)
    );
    const hides = heldElsewhere ? 0 : wouldHide(routine);
    if (hides === 0) {
      attach(routine);
      return;
    }
    const returns =
      program.state === 'auto' && program.startsOn && todayStr < program.startsOn
        ? formatShort(program.startsOn)
        : null;
    confirm({
      title: `This will hide ${hides} ${hides === 1 ? 'item' : 'items'} for now`,
      description:
        `“${routine.name}” looks after itself today. Putting it in ${program.name} hands that ` +
        `over — and ${program.name} is off, so its ${hides} ${hides === 1 ? 'item' : 'items'} ` +
        `${returns ? `come back on ${returns}` : 'stay hidden until you switch it on'}. ` +
        `Nothing is deleted, and taking it back out restores them.`,
      confirmLabel: 'Add it anyway',
      testId: 'program-routine-attach-confirm',
      onConfirm: () => attach(routine),
    });
  };

  return (
    <div className="flex flex-col" data-testid="program-detail" data-program-id={program.id}>
      <BackRow label="Programs" testId="program-detail-back" onBack={onBack} />

      <IdentityRow
        id={program.id}
        name={program.name}
        icon={program.icon}
        color={program.color}
        label="Program"
        testPrefix="program"
        editable
        meta={
          <>
            Program · <span className="font-num">{itemCount}</span>{' '}
            {itemCount === 1 ? 'item' : 'items'} · <span className="font-num">{routineCount}</span>{' '}
            {routineCount === 1 ? 'routine' : 'routines'}
          </>
        }
        onPatch={(patch) => updateProgram(program.id, patch)}
      />

      <div className="bg-border my-4 h-px" />

      <SettingRow label="Status">
        <Segmented>
          {/* setProgramState DIRECTLY, never through updateProgram: it stamps
              its own history label and its own optimistic `updatedAt`, and
              routing through the generic update stamps "Edit program" and lands
              the intended label on the user's NEXT action. */}
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
      </SettingRow>

      {program.state === 'auto' && (
        <SettingRow label="Runs" description="Both ends included.">
          <RunsRange
            startsOn={program.startsOn}
            endsOn={program.endsOn}
            onChange={(patch) => updateProgram(program.id, patch)}
          />
        </SettingRow>
      )}

      <p
        className="text-muted-foreground mt-3 max-w-[62ch] text-xs"
        data-testid="program-state-note"
      >
        <ProgramStateNote program={program} live={live} />
      </p>

      {!live && displaced.length > 0 && (
        <button
          type="button"
          onClick={() => swapToProgram(program.id)}
          data-testid="program-swap"
          className="border-border hover:bg-accent mt-4 flex flex-col items-start gap-0.5 rounded-[5px] border px-3 py-2 text-left"
        >
          <span className="text-foreground text-sm font-medium">Switch to this program</span>
          <span className="text-muted-foreground text-xs">
            Turns off {displaced.map((p) => p.name).join(', ')}. One undo puts it all back.
          </span>
        </button>
      )}

      <div className="mt-5">
        <RoutineMemberList
          program={program}
          live={live}
          members={routineMembers}
          candidates={routines.filter((r) => !program.routineIds.includes(r.id))}
          onRequestAttach={requestAttach}
          onRemove={(routineId) =>
            updateProgram(program.id, {
              routineIds: program.routineIds.filter((id) => id !== routineId),
            })
          }
        />
      </div>

      <div className="mt-5">
        {/* NOT orderable, and not a taste call: `routine_items` carries a
            `sort_order` column and `program_items` does not, so an order
            arranged here would survive until the next fetch and then silently
            reshuffle. */}
        <ItemMemberList
          ownerId={program.id}
          ownerName={program.name}
          memberIds={program.itemIds}
          members={members}
          dimmed={!live}
          testPrefix="program"
          onChange={(itemIds) => updateProgram(program.id, { itemIds })}
        />
      </div>

      <DangerZone
        label="Delete this program"
        testId="program-delete"
        consequence={deleteConsequence(program, itemCount, routineCount, live)}
        onDelete={() =>
          confirm({
            title: 'Delete this program?',
            description: deleteConsequence(program, itemCount, routineCount, live),
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () => {
              removeProgram(program.id);
              onBack();
            },
          })
        }
      />
    </div>
  );
}

/**
 * What deleting actually does — and the half of it a user would never guess.
 *
 * Trashing a program REMOVES ITS PATHS, so a routine it was the only holder of
 * falls back to standalone and its members reappear. "Delete" reads as
 * subtraction; here it can add rows back to today's grid, and that has to be on
 * the button rather than discovered afterwards.
 */
function deleteConsequence(
  program: Program,
  itemCount: number,
  routineCount: number,
  live: boolean
): string {
  const held = [
    itemCount > 0 ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : null,
    routineCount > 0 ? `${routineCount} ${routineCount === 1 ? 'routine' : 'routines'}` : null,
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    `“${program.name}” is removed` +
    (held ? `, but the ${held} it holds stay exactly as they are` : '') +
    (!live && (itemCount > 0 || routineCount > 0)
      ? ' — and anything it was hiding comes back into view'
      : '') +
    '.'
  );
}

/** The four ways a program can be, in the program's own words. */
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

/**
 * The date range, where each field STRICTLY BOUNDS the other.
 *
 * Without the bounds these are two independent single-day pickers and an
 * inverted range (starts after ends) is one careless click away — a range that
 * is live on NO date, so every member vanishes permanently while the console
 * cheerfully reports "Runs Sep 1 to Aug 1, inclusive."
 *
 * The matchers are `{before}`/`{after}`, which are STRICT, and that is exactly
 * what an inclusive range wants: starts and ends may legitimately be the same
 * day (a one-day program), and only crossing is forbidden.
 */
function RunsRange({
  startsOn,
  endsOn,
  onChange,
}: {
  startsOn?: string;
  endsOn?: string;
  onChange: (patch: { startsOn?: string; endsOn?: string }) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <DayField
        label="Starts"
        placeholder="any day"
        value={startsOn}
        testId="program-starts-on"
        clearLabel="Clear starts date"
        disabledDays={endsOn ? { after: parseDay(endsOn)! } : undefined}
        onChange={(next) => onChange({ startsOn: next })}
      />
      <span className="text-muted-foreground text-xs">→</span>
      <DayField
        label="Ends"
        placeholder="any day"
        value={endsOn}
        testId="program-ends-on"
        clearLabel="Clear ends date"
        disabledDays={startsOn ? { before: parseDay(startsOn)! } : undefined}
        align="end"
        onChange={(next) => onChange({ endsOn: next })}
      />
    </div>
  );
}
