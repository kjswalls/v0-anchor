'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/lib/planner-store';
// The shell's shared AlertDialog, rendered once in AppShell. Using it rather
// than a local <AlertDialog> keeps the console's confirms on the same surface
// as every other destructive prompt in the app — and keeps the plate free of a
// second dismissable layer competing for Escape.
import { useUIStore } from '@/lib/ui-store';
import { isPausedOn } from '@/lib/active';
import {
  byName,
  countLive,
  formatShort,
  matching,
  parseDay,
  routinePillLabel,
  useLiveItemIds,
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
import { ItemMemberList } from '../member-list';
import type { Item, Routine } from '@/lib/planner-types';

/**
 * ROUTINES — the section that goes first, because it is the object people
 * garden most and the one the ScopeRail's `+` lands on.
 *
 * Moved from ManageCollectionsDialog with every data-testid intact
 * (memory/plans/organize-console.md, Phase 2). One thing is genuinely new and
 * it is a correctness fix rather than a feature: the "Comes back" resume date,
 * which wires `setRoutinePaused`'s THIRD ARGUMENT — a parameter the store has
 * always taken and which no call site in the app has ever passed, while
 * `pausedUntil` is *read* in three places.
 */
export function RoutinesSection({
  selectedId,
  onSelect,
  focusNew,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusNew: boolean;
}) {
  const routines = usePlannerStore((s) => s.routines);
  const collectionsAvailable = usePlannerStore((s) => s.collectionsAvailable);
  const userId = usePlannerStore((s) => s.userId);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const addRoutine = usePlannerStore((s) => s.addRoutine);
  const liveIds = useLiveItemIds();
  const { todayStr, tz } = useToday();

  const [query, setQuery] = useState('');

  const selected = routines.find((r) => r.id === selectedId) ?? null;
  const visible = matching(routines, query, byName);

  // The three-part signal, not the flag alone: a container created inside the
  // load window is silently erased when initializeStore's set() replaces
  // `routines`, and the user then owns two.
  const canCreate = collectionsAvailable && !!userId && !isLoading;

  return (
    <>
      <ListColumn
        eyebrow="ROUTINES"
        count={visible.length}
        hasSelection={!!selected}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: 'Filter routines…',
          testId: 'routine-filter',
        }}
        footer={
          <DraftRow
            placeholder="New routine…"
            addLabel="Add routine"
            testPrefix="routine"
            disabled={!canCreate}
            autoFocus={focusNew}
            onAdd={(name, icon) => onSelect(addRoutine({ name, icon, itemIds: [] }))}
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
        ) : routines.length === 0 ? (
          <p className="text-muted-foreground px-[7px] pt-2 text-xs">No routines yet.</p>
        ) : (
          visible.map((routine) => (
            <ObjectRow
              key={routine.id}
              testId="routine-row"
              idAttr={{ 'data-routine-id': routine.id }}
              icon={routine.icon}
              color={routine.color}
              name={routine.name}
              selected={selectedId === routine.id}
              pill={routinePillLabel(routine, todayStr, tz)}
              pillTestId="routine-paused-pill"
              count={countLive(routine.itemIds, liveIds)}
              onSelect={() => onSelect(routine.id)}
            />
          ))
        )}
      </ListColumn>

      <DetailColumn hasSelection={!!selected}>
        {selected ? (
          <RoutineDetail routine={selected} onBack={() => onSelect(null)} />
        ) : (
          <TeachingLine>A routine groups items you want to pause together.</TeachingLine>
        )}
      </DetailColumn>
    </>
  );
}

function RoutineDetail({ routine, onBack }: { routine: Routine; onBack: () => void }) {
  const items = usePlannerStore((s) => s.items);
  const programs = usePlannerStore((s) => s.programs);
  const updateRoutine = usePlannerStore((s) => s.updateRoutine);
  const setRoutinePaused = usePlannerStore((s) => s.setRoutinePaused);
  const removeRoutine = usePlannerStore((s) => s.removeRoutine);
  const confirm = useUIStore((s) => s.confirm);
  const liveIds = useLiveItemIds();
  const { todayStr, tz } = useToday();

  const paused = isPausedOn(routine, todayStr, tz);
  // Local noon, so the picker's bound is a calendar day rather than an instant
  // — and derived from the USER's today, not the browser's.
  const today = parseDay(todayStr)!;
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  const members = routine.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => !!i);

  // Which programs hold this routine — a reverse view that does not exist
  // anywhere in the app today. From a routine you currently cannot see what is
  // answering for it.
  const heldBy = programs.filter((p) => p.routineIds.includes(routine.id));
  const liveCount = countLive(routine.itemIds, liveIds);

  return (
    <div className="flex flex-col" data-testid="routine-detail" data-routine-id={routine.id}>
      <BackRow label="Routines" testId="routine-detail-back" onBack={onBack} />

      <IdentityRow
        id={routine.id}
        name={routine.name}
        icon={routine.icon}
        color={routine.color}
        label="Routine"
        testPrefix="routine"
        meta={
          <>
            Routine · <span className="font-num">{liveCount}</span>{' '}
            {liveCount === 1 ? 'item' : 'items'}
            {heldBy.length > 0 && (
              <>
                {' · in '}
                <span className="font-num">{heldBy.length}</span>{' '}
                {heldBy.length === 1 ? 'program' : 'programs'}
              </>
            )}
          </>
        }
        onPatch={(patch) => updateRoutine(routine.id, patch)}
      />

      <div className="bg-border my-4 h-px" />

      <SettingRow label="Status">
        <Segmented>
          {/* setRoutinePaused DIRECTLY, never through updateRoutine: it stamps
              its own history label, and routing through the generic update
              stamps "Edit routine" and lands the intended label on the user's
              NEXT action. */}
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
      </SettingRow>

      {paused && (
        <SettingRow label="Comes back" description="Its items return on their own.">
          {/* The store has always taken this third argument and no call site in
              the app has ever passed it, while `pausedUntil` is READ in three
              places — so a routine could be "paused until" a date only the agent
              API could set.

              Today is disabled along with the past, and that matches the rule
              the store already enforces on the API side: the pause interval's
              upper bound is EXCLUSIVE, so `pausedUntil = today` is live today.
              resolvePauseWrite rejects it out loud ("the pause would end
              immediately"); offering it here would be a control that silently
              undoes the pause you are configuring. */}
          <DayField
            value={routine.pausedUntil}
            placeholder="pick a day"
            testId="routine-resume"
            clearLabel="Clear resume date"
            disabledDays={{ before: tomorrow }}
            align="end"
            // `?? null` and not `?? undefined`: clearing the date is a request,
            // and undefined means "I did not say", which the store correctly
            // treats as a no-op. Without this the ✕ would be a dead button.
            onChange={(next) => setRoutinePaused(routine.id, true, next ?? null)}
          />
        </SettingRow>
      )}

      {paused && (
        <p className="text-muted-foreground mt-3 max-w-[62ch] text-xs" data-testid="routine-paused-note">
          {routine.pausedUntil
            ? `Its items come back on ${formatShort(routine.pausedUntil)}, on their own.`
            : 'Its items are hidden until you resume.'}{' '}
          Streaks and history stay exactly as they are.
        </p>
      )}

      <div className="mt-5">
        <ItemMemberList
          ownerId={routine.id}
          ownerName={routine.name}
          memberIds={routine.itemIds}
          members={members}
          dimmed={paused}
          testPrefix="routine"
          orderable
          onChange={(itemIds) => updateRoutine(routine.id, { itemIds })}
        />
      </div>

      <DangerZone
        label="Delete this routine"
        testId="routine-delete"
        consequence={
          <>
            &ldquo;{routine.name}&rdquo; is removed, but its {liveCount}{' '}
            {liveCount === 1 ? 'item stays' : 'items stay'} exactly as{' '}
            {liveCount === 1 ? 'it is' : 'they are'} — {liveCount === 1 ? 'it' : 'they'} just stop
            being grouped{paused ? ', and they come back into view' : ''}.
          </>
        }
        onDelete={() =>
          confirm({
            title: 'Delete this routine?',
            description: `“${routine.name}” is removed, but its ${liveCount} ${
              liveCount === 1 ? 'item stays' : 'items stay'
            } exactly as ${liveCount === 1 ? 'it is' : 'they are'} — ${
              liveCount === 1 ? 'it' : 'they'
            } just stop being grouped${paused ? ', and they come back into view' : ''}.`,
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () => {
              removeRoutine(routine.id);
              onBack();
            },
          })
        }
      />
    </div>
  );
}
