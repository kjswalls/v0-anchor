'use client';

import { useMemo, useState } from 'react';
import { CategoryIcon } from '@/lib/category-icons';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { isCheckinEligible, isMilestoneEligible } from '@/lib/item-registry';
import {
  goalProgress,
  isGoalActive,
  nextMilestone,
  sortGoalsForDisplay,
  timeElapsed,
} from '@/lib/goals';
import { byName, formatShort, matching, useLiveItemIds, useToday } from '@/lib/collections';
import { Eyebrow, ObjectRow, Segmented, SegmentedOption, StatePill } from '../primitives';
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
import { cn } from '@/lib/utils';
import type { Goal, Item } from '@/lib/planner-types';

/**
 * GOALS — the console's aspire section.
 *
 * The one container whose list row has something to SAY beyond its name: a
 * goal's whole point is that it is going somewhere, so the row carries the
 * milestone fraction and the detail carries the two readings side by side.
 *
 * See memory/plans/long-term-goals.md.
 */

/* ── progress ─────────────────────────────────────────────────────────────── */

/**
 * The fraction, in words, with the three states the plan's display rules pin.
 *
 * "2/2 so far" rather than "2/2" while the goal is running: the plan's own
 * example is a three-year business with two near-term milestones, and a bare
 * full fraction there reads as finished. The suffix disappears once the goal is
 * actually achieved, when 2/2 means what it says.
 */
function progressLabel(goal: Goal, achieved: number, total: number): string {
  if (total === 0) return 'No milestones yet';
  const bare = `${achieved}/${total}`;
  if (!isGoalActive(goal)) return bare;
  return achieved === total ? `${bare} so far` : bare;
}

/**
 * The bar, or nothing.
 *
 * Suppressed entirely at zero milestones — every goal is born there and a
 * habit-only goal stays there legitimately, so an empty track reads as a
 * feature that is broken rather than one that has not been used. The time
 * marker rides the SAME track as a hairline rather than a second bar, because
 * the question it answers ("how much of the window is gone") is only ever
 * interesting next to the fill.
 */
function ProgressTrack({ goal, achieved, total }: { goal: Goal; achieved: number; total: number }) {
  const { todayStr } = useToday();
  if (total === 0) return null;
  const pct = Math.round((achieved / total) * 100);
  const elapsed = timeElapsed(goal, todayStr);
  return (
    <div className="flex flex-col gap-1.5" data-testid="goal-progress">
      <div className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
        {elapsed !== null && (
          // Deliberately NOT merged into the fill. They answer different
          // questions and a single blended number would hide exactly the case
          // the pair exists to show: all the milestones done, three months into
          // three years.
          <span
            className="bg-foreground/35 absolute inset-y-0 w-px"
            style={{ left: `${Math.round(elapsed * 100)}%` }}
            data-testid="goal-time-marker"
            aria-hidden
          />
        )}
      </div>
      {elapsed !== null && (
        <span className="text-muted-foreground text-[11px]">
          {Math.round(elapsed * 100)}% of the way to {formatShort(goal.targetOn!)}
        </span>
      )}
    </div>
  );
}

/* ── the section ──────────────────────────────────────────────────────────── */

export function GoalsSection({
  selectedId,
  onSelect,
  focusNew,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The console's "opened straight into a new row" signal — see its callers. */
  focusNew: boolean;
}) {
  const goals = usePlannerStore((s) => s.goals);
  const items = usePlannerStore((s) => s.items);
  const addGoal = usePlannerStore((s) => s.addGoal);
  const updateGoal = usePlannerStore((s) => s.updateGoal);
  const removeGoal = usePlannerStore((s) => s.removeGoal);
  const setGoalState = usePlannerStore((s) => s.setGoalState);
  const goalsAvailable = usePlannerStore((s) => s.goalsAvailable);
  const userId = usePlannerStore((s) => s.userId);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const confirm = useUIStore((s) => s.confirm);

  // Same three-part gate the other container sections use, and the third part
  // is the one that is easy to miss: creating before the fetch has landed lets
  // initializeStore's set() overwrite `goals` with what came back, erasing the
  // row the user just made while its INSERT usually succeeds — so they make it
  // again and own two. That is the trap the scope rail shipped once.
  const canCreate = goalsAvailable && !!userId && !isLoading;

  const [query, setQuery] = useState('');
  const liveItemIds = useLiveItemIds();

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Ended goals sink below the live ones rather than interleaving by
  // sort_order. Over the horizon a goal actually spans, a mixed list reads as
  // clutter by year two — and this list is the only place they are browsable.
  const ordered = useMemo(() => sortGoalsForDisplay(goals), [goals]);
  const shown = matching(ordered, query, byName);
  const selected = goals.find((g) => g.id === selectedId) ?? null;

  const firstEndedIndex = shown.findIndex((g) => !isGoalActive(g));

  const create = (name: string) => {
    const id = addGoal({
      name,
      state: 'active',
      memberIds: [],
      milestoneIds: [],
      checkinIds: [],
    });
    onSelect(id);
  };

  if (selected) {
    return (
      <GoalDetail
        goal={selected}
        itemsById={itemsById}
        liveItemIds={liveItemIds}
        onBack={() => onSelect(null)}
        onChange={(updates) => updateGoal(selected.id, updates)}
        onState={(state) => setGoalState(selected.id, state)}
        onDelete={() =>
          confirm({
            title: `Delete ${selected.name}?`,
            // The sentence that has to be here. "Delete Learn Chinese" sounds
            // like it takes a year of work with it, and it does not: the
            // members are ordinary items that exist for their own sake.
            description:
              `The goal moves to the trash for 30 days. Its habits, tasks and milestones ` +
              `are ordinary items and stay exactly where they are — only the goal and its ` +
              `links go.`,
            confirmLabel: 'Delete goal',
            destructive: true,
            onConfirm: () => {
              removeGoal(selected.id);
              onSelect(null);
            },
          })
        }
      />
    );
  }

  return (
    <ListColumn
      eyebrow="GOALS"
      count={shown.length}
      hasSelection={false}
      filter={{
        value: query,
        onChange: setQuery,
        placeholder: 'Filter goals…',
        testId: 'goals-filter',
      }}
      footer={
        <DraftRow
          placeholder="Name a goal…"
          addLabel="New goal"
          testPrefix="goal"
          autoFocus={focusNew}
          disabled={!canCreate}
          onAdd={(name) => create(name)}
        />
      }
    >
      {!goalsAvailable ? (
        <p className="text-muted-foreground px-[7px] pt-2 text-xs" data-testid="goals-unavailable">
          Goals aren&apos;t available on this account yet.
        </p>
      ) : shown.length === 0 && !query ? (
        <TeachingLine>
          A goal is the reason a stretch of work exists — learning a language, building
          something over years. It holds the habits and tasks that serve it, the
          checkpoints along the way, and a recurring check-in. It never hides anything.
        </TeachingLine>
      ) : (
        shown.map((goal, i) => {
          const { achieved, total } = goalProgress(goal, itemsById);
          return (
            <div key={goal.id}>
              {i === firstEndedIndex && i > 0 && (
                <div className="my-1.5 flex items-center gap-2 px-1" data-testid="goals-ended-divider">
                  <span className="bg-border h-px flex-1" />
                  <Eyebrow>ENDED</Eyebrow>
                  <span className="bg-border h-px flex-1" />
                </div>
              )}
              <ObjectRow
                testId={`goal-row-${goal.id}`}
                idAttr={{ 'data-goal-id': goal.id }}
                icon={goal.icon}
                color={goal.color}
                name={goal.name}
                selected={false}
                pill={
                  goal.state === 'achieved'
                    ? 'Achieved'
                    : goal.state === 'abandoned'
                      ? 'Set aside'
                      : null
                }
                pillTestId={`goal-pill-${goal.id}`}
                count={total}
                onSelect={() => onSelect(goal.id)}
              />
              <span className="sr-only">{progressLabel(goal, achieved, total)}</span>
            </div>
          );
        })
      )}
    </ListColumn>
  );
}

/* ── the detail pane ──────────────────────────────────────────────────────── */

function GoalDetail({
  goal,
  itemsById,
  liveItemIds,
  onBack,
  onChange,
  onState,
  onDelete,
}: {
  goal: Goal;
  itemsById: Map<string, Item>;
  liveItemIds: Set<string>;
  onBack: () => void;
  onChange: (updates: Partial<Goal>) => void;
  onState: (state: Goal['state']) => void;
  onDelete: () => void;
}) {
  const { achieved, total } = goalProgress(goal, itemsById);
  const next = nextMilestone(goal, itemsById);

  // Membership patches always carry all three arrays. The reconcile would
  // accept one, but sending the whole set makes the write independent of which
  // list the user touched — and identical to what create sends.
  const members = (patch: Partial<Record<'memberIds' | 'milestoneIds' | 'checkinIds', string[]>>) =>
    onChange({
      memberIds: goal.memberIds,
      milestoneIds: goal.milestoneIds,
      checkinIds: goal.checkinIds,
      ...patch,
    });

  return (
    <DetailColumn hasSelection>
      <BackRow label="Goals" testId="goal-back" onBack={onBack} />

      <IdentityRow
        id={goal.id}
        name={goal.name}
        icon={goal.icon}
        color={goal.color}
        label="Goal"
        testPrefix="goal"
        meta={
          <>
            Goal
            {total > 0 && <> · {progressLabel(goal, achieved, total)}</>}
            {goal.targetOn && <> · by {formatShort(goal.targetOn)}</>}
          </>
        }
        onPatch={onChange}
      />

      {/*
        The WHY, and it is a first-class field rather than a note: a goal that
        survives three years survives on the reason, and this is the line Beacon
        is handed when it is asked what the user is working towards.
      */}
      <label className="flex flex-col gap-1.5">
        <Eyebrow>WHY THIS MATTERS</Eyebrow>
        <textarea
          value={goal.why ?? ''}
          onChange={(e) => onChange({ why: e.target.value || undefined })}
          placeholder="So I can talk to my in-laws without an interpreter."
          rows={2}
          data-testid="goal-why"
          className={cn(
            'placeholder:text-muted-foreground/60 w-full resize-none rounded-md border bg-transparent',
            'px-2.5 py-2 text-[13px] leading-relaxed outline-none',
            'focus-visible:ring-ring/40 focus-visible:ring-2',
          )}
        />
      </label>

      <ProgressTrack goal={goal} achieved={achieved} total={total} />

      <div className="flex flex-col gap-1.5">
        <Eyebrow>PROGRESS</Eyebrow>
        <span className="text-[13px]" data-testid="goal-progress-label">
          {progressLabel(goal, achieved, total)}
          {next && (
            <span className="text-muted-foreground">
              {' · next: '}
              {next.title}
              {'startDate' in next && next.startDate ? ` (${formatShort(next.startDate)})` : ''}
            </span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DayField
          label="Started"
          placeholder="No start date"
          value={goal.startsOn}
          clearLabel="Clear start date"
          onChange={(next) => onChange({ startsOn: next })}
          testId="goal-starts-on"
        />
        <DayField
          label="Target"
          placeholder="No target date"
          value={goal.targetOn}
          clearLabel="Clear target date"
          onChange={(next) => onChange({ targetOn: next })}
          testId="goal-target-on"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Eyebrow>STATE</Eyebrow>
        <Segmented>
          <SegmentedOption
            active={goal.state === 'active'}
            onClick={() => onState('active')}
            testId="goal-state-active"
          >
            Active
          </SegmentedOption>
          <SegmentedOption
            active={goal.state === 'achieved'}
            onClick={() => onState('achieved')}
            testId="goal-state-achieved"
          >
            Achieved
          </SegmentedOption>
          <SegmentedOption
            active={goal.state === 'abandoned'}
            onClick={() => onState('abandoned')}
            testId="goal-state-abandoned"
          >
            Set aside
          </SegmentedOption>
        </Segmented>
        {goal.state !== 'active' && <EndedNotice goal={goal} itemsById={itemsById} />}
      </div>

      {/*
        Three lists, one per role. Each picker is filtered by the registry
        predicate for its role rather than by plain collectibility — a milestone
        must be one-shot and a check-in must recur, and offering an ineligible
        item would produce a role the demotion rule immediately takes back.
      */}
      <ItemMemberList
        ownerId={goal.id}
        ownerName={goal.name}
        memberIds={goal.milestoneIds}
        members={goal.milestoneIds.map((id) => itemsById.get(id)).filter((i): i is Item => !!i)}
        hiddenIds={new Set()}
        testPrefix="goal-milestone"
        orderable
        eligible={isMilestoneEligible}
        onChange={(ids) => members({ milestoneIds: ids })}
      />

      <ItemMemberList
        ownerId={goal.id}
        ownerName={goal.name}
        memberIds={goal.checkinIds}
        members={goal.checkinIds.map((id) => itemsById.get(id)).filter((i): i is Item => !!i)}
        hiddenIds={new Set()}
        testPrefix="goal-checkin"
        eligible={isCheckinEligible}
        onChange={(ids) => members({ checkinIds: ids })}
      />

      <ItemMemberList
        ownerId={goal.id}
        ownerName={goal.name}
        memberIds={goal.memberIds}
        members={goal.memberIds.map((id) => itemsById.get(id)).filter((i): i is Item => !!i)}
        hiddenIds={new Set()}
        testPrefix="goal-member"
        onChange={(ids) => members({ memberIds: ids })}
      />

      <DangerZone
        label="Delete goal"
        testId="delete-goal"
        destructive
        consequence="Its members stay where they are — only the goal and its links go to the trash."
        onDelete={onDelete}
      />

      <span className="sr-only" data-testid="goal-live-members">
        {[...goal.memberIds, ...goal.milestoneIds, ...goal.checkinIds].filter((id) =>
          liveItemIds.has(id),
        ).length}
      </span>
    </DetailColumn>
  );
}

/**
 * The wind-down prompt.
 *
 * An ended goal stops appearing in chips and lists, but its RECURRING members
 * do not stop: the weekly check-in it created keeps arriving in every Sunday
 * EOD with the reason stripped away, and nothing else in the app will ever
 * mention the goal again. Naming them here — where the state was just changed —
 * is the one moment the connection is still obvious.
 *
 * It only names them. The goal writes nothing to its members, ever; acting on
 * this is the user's own edit, through the ordinary surfaces.
 */
function EndedNotice({ goal, itemsById }: { goal: Goal; itemsById: Map<string, Item> }) {
  const recurring = [...goal.checkinIds, ...goal.memberIds, ...goal.milestoneIds]
    .map((id) => itemsById.get(id))
    .filter((i): i is Item => !!i && !!i.repeatFrequency && i.repeatFrequency !== 'none');

  if (recurring.length === 0) return null;

  return (
    <TeachingLine>
      {recurring.length === 1
        ? `“${recurring[0].title}” still repeats on its own schedule. `
        : `${recurring.length} of its items still repeat on their own schedules. `}
      Nothing was changed for you — {goal.state === 'achieved' ? 'an achieved' : 'a set-aside'} goal
      never edits its members. Keep them, or retire them where they live.
    </TeachingLine>
  );
}
