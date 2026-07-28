'use client';

import { useMemo, useState } from 'react';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import {
  CalendarIcon,
  Check,
  CheckCircle2,
  Clock,
  Flag,
  Flame,
  Folder,
  MoreHorizontal,
  Plus,
  Repeat,
  Repeat2,
  RotateCcw,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
} from '@/components/ui/responsive-modal';
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
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconPicker } from '@/components/primitives/icon-picker';
import { AddIconButton } from '@/components/primitives/add-icon-button';
import {
  ChipOption,
  ChipSectionLabel,
  PropertyChip,
} from '@/components/primitives/property-chip';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import type {
  HabitItem,
  Item,
  Priority,
  RepeatFrequency,
  TimeBucket,
} from '@/lib/planner-types';
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/planner-types';
import { ALL_ITEM_TYPES, getItemTypeConfig, itemTypeName } from '@/lib/item-registry';
import { CategoryIcon, makeIconToken, resolveCategoryIcon } from '@/lib/category-icons';
import { cn } from '@/lib/utils';

/**
 * The one add/edit dialog for every item type, replacing AddTaskDialog /
 * EditTaskDialog / EditHabitDialog. Which fields render is driven by the
 * type-capability registry (lib/item-registry.ts); the per-type save adapters
 * at the bottom keep the store contract (schedule* second pass, explicit
 * `undefined` clears) byte-compatible with the pre-unification dialogs.
 */

const PRIORITY_ORDER = ['none', 'low', 'medium', 'high'] as const;
const PRIORITY_LABELS: Record<Priority | 'none', string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const BUCKET_ORDER: TimeBucket[] = ['anytime', 'morning', 'afternoon', 'evening'];
const BUCKET_LABELS: Record<TimeBucket, string> = {
  anytime: 'Anytime',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

const DURATION_ORDER = ['15', '30', '45', '60', '90', '120'];
const DURATION_LABELS: Record<string, string> = {
  '15': '15 min',
  '30': '30 min',
  '45': '45 min',
  '60': '1 hour',
  '90': '1.5 hours',
  '120': '2 hours',
};

const DATE_SHORTCUTS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
];

/** Last 14 days of a habit's completion history, oldest first. */
function recentStreakDays(habit: HabitItem): boolean[] {
  const today = startOfDay(new Date());
  return Array.from({ length: 14 }, (_, i) =>
    habit.completedDates.includes(format(subDays(today, 13 - i), 'yyyy-MM-dd'))
  );
}

/** `type` is the registry name ('task', 'habit', or a custom slug like 'goal'). */
export type ItemDialogState =
  | { mode: 'add'; type: string; bucket?: TimeBucket; date?: Date }
  | { mode: 'edit'; item: Item };

interface ItemDialogProps {
  /** null = closed. Must be referentially stable per open (memoize upstream). */
  state: ItemDialogState | null;
  onOpenChange: (open: boolean) => void;
}

/** Local form state. 'none' / '' are UI sentinels, translated to `undefined`
 *  at save time — they must never reach the store. */
interface ItemDraft {
  title: string;
  priority: Priority | 'none';
  /** Project or group NAME (containers are name-referenced pre-Phase-6). */
  container: string;
  startDate: Date | undefined;
  timeBucket: TimeBucket | 'none';
  startTime: string;
  duration: string;
  repeatFrequency: RepeatFrequency;
  repeatDays: number[];
  repeatMonthDay: number;
  timesPerDay: string;
  newContainer: { show: boolean; name: string; icon: string };
}

interface AddSeed {
  bucket?: TimeBucket;
  date?: Date;
  defaultTimeBucket: TimeBucket;
  habitGroups: { name: string }[];
}

function makeAddDraft(type: string, seed: AddSeed): ItemDraft {
  const config = getItemTypeConfig(type);
  return {
    title: '',
    priority: 'none',
    // Required containers fall back like the old add dialog: first group, else
    // legacy lowercase 'personal' (NOT orphanContainerFallback — changing this
    // changes which group a fresh account's habits land in).
    container: config.containerRequired
      ? seed.habitGroups[0]?.name || 'personal'
      : 'none',
    startDate: config.dateAnchored ? seed.date : undefined,
    timeBucket: seed.bucket ?? seed.defaultTimeBucket ?? 'anytime',
    startTime: '',
    duration: '30',
    repeatFrequency: config.defaultFrequency,
    repeatDays: [],
    repeatMonthDay: 1,
    timesPerDay: '1',
    newContainer: {
      show: false,
      name: '',
      icon: makeIconToken(config.form.newContainerIcon),
    },
  };
}

function buildAddDrafts(seed: AddSeed): Record<string, ItemDraft> {
  return Object.fromEntries(ALL_ITEM_TYPES.map((t) => [t, makeAddDraft(t, seed)]));
}

function draftFromItem(item: Item): ItemDraft {
  const config = getItemTypeConfig(itemTypeName(item));
  // Parse date string as local date, not UTC
  // "2026-03-22" should be March 22 local time, not UTC midnight which shows as March 21
  let startDate: Date | undefined;
  if (item.type !== 'habit' && item.startDate) {
    // startDate is always a string; handle legacy ISO format just in case
    const dateStr = item.startDate.includes('T')
      ? item.startDate.split('T')[0]
      : item.startDate;
    const [year, month, day] = dateStr.split('-').map(Number);
    startDate = new Date(year, month - 1, day); // month is 0-indexed
  }
  return {
    title: item.title,
    priority: item.type !== 'habit' ? item.priority || 'none' : 'none',
    container: item.type === 'habit' ? item.group : item.project || 'none',
    startDate,
    timeBucket: item.timeBucket || 'none',
    startTime: item.startTime || '',
    duration: item.type !== 'habit' ? item.duration?.toString() || '30' : '30',
    repeatFrequency: item.repeatFrequency ?? config.defaultFrequency,
    repeatDays: item.repeatDays || [],
    repeatMonthDay: item.repeatMonthDay || 1,
    timesPerDay: item.type === 'habit' ? item.timesPerDay?.toString() || '1' : '1',
    newContainer: {
      show: false,
      name: '',
      icon: makeIconToken(config.form.newContainerIcon),
    },
  };
}

export function ItemDialog({ state, onOpenChange }: ItemDialogProps) {
  const {
    addItem,
    addTask,
    addHabit,
    updateTask,
    updateHabit,
    deleteTask,
    deleteHabit,
    scheduleTask,
    unscheduleTask,
    scheduleHabit,
    resetHabitStreak,
    projects,
    habitGroups,
    addProject,
    addHabitGroup,
    itemTypesAvailable,
    defaultTimeBucket,
    itemTypes,
  } = usePlannerStore();

  // Tab order: built-ins first (pinned), then user-defined types.
  const typeNames = useMemo(
    () => [...ALL_ITEM_TYPES, ...itemTypes.map((t) => t.name)],
    [itemTypes]
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Latch the last payload so content doesn't flicker to defaults while the
  // close animation plays (same render-phase pattern app-shell used for add).
  // A new payload also disarms any confirm left open for the previous one —
  // the streak-reset AlertDialog unmounts with its flag stuck true otherwise.
  const [last, setLast] = useState<ItemDialogState | null>(state);
  if (state && state !== last) {
    setLast(state);
    setShowDeleteConfirm(false);
    setShowResetConfirm(false);
  }
  const open = !!state;
  const mode = last?.mode ?? 'add';
  const addPayload = last?.mode === 'add' ? last : null;
  const editItem = last?.mode === 'edit' ? last.item : null;
  const editConfig = editItem ? getItemTypeConfig(itemTypeName(editItem)) : null;

  const [activeType, setActiveType] = useState<string>('task');
  const [addDrafts, setAddDrafts] = useState<Record<string, ItemDraft>>(() =>
    buildAddDrafts({ defaultTimeBucket, habitGroups })
  );
  const [editDraft, setEditDraft] = useState<ItemDraft | null>(null);

  // Edit mode: re-init the whole draft from the item snapshot. Render-phase
  // rather than an effect so switching edit targets (habit → task) never
  // paints one frame of the previous item's draft in the new type's form.
  const [seededItem, setSeededItem] = useState<Item | null>(null);
  if (editItem && editItem !== seededItem) {
    setSeededItem(editItem);
    setEditDraft(draftFromItem(editItem));
  }

  // Add mode: each open re-seeds only the type, buckets, and the anchored date.
  // A cancelled dialog deliberately keeps its other draft fields (full reset
  // happens on successful save) — pre-unification behavior.
  //
  // Render-phase, like the edit seeding above, and for a sharper reason than
  // flicker: with one form instead of a tab per type, the title input mounts
  // ONCE. `autoFocus` only fires on mount, so seeding the type in an effect
  // committed the first frame with the previous open's type — and if that type
  // wasn't 'task', the input mounted unfocused and React ignored the prop flip.
  // Opening Add Task right after Add Habit left focus parked on the type chip.
  const [seededAdd, setSeededAdd] = useState<ItemDialogState | null>(null);
  if (addPayload && addPayload !== seededAdd) {
    setSeededAdd(addPayload);
    setActiveType(addPayload.type);
    const bucket = addPayload.bucket ?? defaultTimeBucket ?? 'anytime';
    setAddDrafts((drafts) => {
      const next = { ...drafts };
      // typeNames/habitGroups are read fresh here, which is safe now that this
      // runs on a new payload identity rather than on an effect's dep list.
      for (const t of typeNames) {
        // Custom types hydrate after mount — seed a fresh draft on first sight.
        const base = drafts[t] ?? makeAddDraft(t, { defaultTimeBucket, habitGroups });
        next[t] = {
          ...base,
          timeBucket: bucket,
          ...(getItemTypeConfig(t).dateAnchored ? { startDate: addPayload.date } : null),
        };
      }
      return next;
    });
  }

  /**
   * Switching type carries the draft across rather than swapping in whatever
   * was last typed under the target type. With tabs, per-type drafts read as
   * two parallel forms; with one form and a type switcher, losing the title you
   * just typed reads as a bug.
   *
   * Container is deliberately NOT carried — projects and habit groups are
   * different namespaces — and the target's own default (first group, for a
   * type that requires one) is kept. Fields the target type has no use for ride
   * along harmlessly: its save adapter never reads them.
   */
  const switchType = (next: string) => {
    if (next === activeType) return;
    const from = draftFor(activeType);
    const fromConfig = getItemTypeConfig(activeType);
    const config = getItemTypeConfig(next);

    // Carry a field only if the SOURCE type actually exposed it. Copying a
    // field the source never rendered means copying its default, which
    // silently overwrites whatever the target draft already held — that is how
    // a hop through Habit erased a task's seeded date and turned a one-shot
    // task into a daily one.
    const exposed = (field: string) => fromConfig.fields.includes(field);
    // Likewise a frequency: only a value the user actually chose travels. A
    // habit sitting at its 'daily' default must not make the next task daily.
    const chosenFrequency =
      from.repeatFrequency !== fromConfig.defaultFrequency &&
      (config.allowedFrequencies as readonly string[]).includes(from.repeatFrequency);

    setAddDrafts((drafts) => {
      const base = drafts[next] ?? makeAddDraft(next, { defaultTimeBucket, habitGroups });
      return {
        ...drafts,
        [next]: {
          ...base,
          title: from.title,
          priority: exposed('priority') ? from.priority : base.priority,
          startDate:
            config.dateAnchored && fromConfig.dateAnchored ? from.startDate : base.startDate,
          timeBucket: from.timeBucket,
          startTime: from.startTime,
          duration: exposed('duration') ? from.duration : base.duration,
          timesPerDay: fromConfig.counters.dailyCounts ? from.timesPerDay : base.timesPerDay,
          repeatFrequency: chosenFrequency ? from.repeatFrequency : base.repeatFrequency,
          repeatDays: chosenFrequency ? from.repeatDays : base.repeatDays,
          repeatMonthDay: chosenFrequency ? from.repeatMonthDay : base.repeatMonthDay,
        },
      };
    });
    setActiveType(next);
  };

  /** Row/header glyph for a type — custom types use the icon set at creation. */
  const typeIcon = (name: string): LucideIcon => {
    if (name === 'habit') return Flame;
    if (name === 'task') return CheckCircle2;
    const def = itemTypes.find((t) => t.name === name);
    return resolveCategoryIcon(def?.icon, def?.label ?? name);
  };

  /** Draft for a type, with a default for custom types not yet seeded. */
  const draftFor = (type: string): ItemDraft =>
    addDrafts[type] ?? makeAddDraft(type, { defaultTimeBucket, habitGroups });

  const patchDraft = (type: string, updates: Partial<ItemDraft>) => {
    if (last?.mode === 'edit') {
      setEditDraft((d) => (d ? { ...d, ...updates } : d));
    } else {
      setAddDrafts((d) => ({
        ...d,
        [type]: { ...(d[type] ?? makeAddDraft(type, { defaultTimeBucket, habitGroups })), ...updates },
      }));
    }
  };

  const resetAddDrafts = () => {
    const seed = { bucket: addPayload?.bucket, defaultTimeBucket, habitGroups };
    setAddDrafts(
      Object.fromEntries(typeNames.map((t) => [t, makeAddDraft(t, seed)]))
    );
  };

  // ── Save adapters — faithful ports of the per-type dialogs' handlers ──────

  const handleAddSave = (type: string) => {
    // Guard on the LIVE state, not the latch — the latch stays populated
    // through the close animation and must never re-arm a save (the old
    // dialogs disarmed instantly when their item prop went null).
    if (!state || state.mode !== 'add') return;
    const d = draftFor(type);
    if (!d.title.trim()) return;

    if (type !== 'habit') {
      const effectiveTimeBucket = d.startDate
        ? d.timeBucket === 'none'
          ? 'anytime'
          : d.timeBucket
        : undefined;
      // Task-shaped payload; custom types dispatch to the generic addItem.
      const create = type === 'task' ? addTask : addItem.bind(null, type);
      create({
        title: d.title.trim(),
        priority: d.priority === 'none' ? undefined : d.priority,
        project: d.container === 'none' ? undefined : d.container,
        startDate: d.startDate ? format(d.startDate, 'yyyy-MM-dd') : undefined,
        duration: d.duration ? parseInt(d.duration) : undefined,
        timeBucket: effectiveTimeBucket,
        startTime: d.startTime || undefined,
        repeatFrequency: d.repeatFrequency !== 'none' ? d.repeatFrequency : undefined,
        repeatDays: d.repeatFrequency === 'custom' ? d.repeatDays : undefined,
        repeatMonthDay: d.repeatFrequency === 'monthly' ? d.repeatMonthDay : undefined,
      });
    } else {
      addHabit({
        title: d.title.trim(),
        group: d.container,
        timeBucket: d.timeBucket === 'none' ? 'anytime' : d.timeBucket,
        startTime: d.startTime || undefined,
        repeatFrequency: d.repeatFrequency,
        repeatDays: d.repeatFrequency === 'custom' ? d.repeatDays : undefined,
        repeatMonthDay: d.repeatFrequency === 'monthly' ? d.repeatMonthDay : undefined,
        timesPerDay: parseInt(d.timesPerDay) || 1,
      });
    }

    resetAddDrafts();
    onOpenChange(false);
  };

  const handleEditSave = () => {
    if (!state || state.mode !== 'edit') return;
    if (!editItem || !editDraft || !editDraft.title.trim()) return;
    const d = editDraft;

    // Habit first; task and custom items share the task-shaped save path
    // (the store's task actions operate on any task-like item).
    if (editItem.type !== 'habit') {
      // Save date as yyyy-MM-dd string to avoid timezone issues
      const startDateStr = d.startDate ? format(d.startDate, 'yyyy-MM-dd') : undefined;
      updateTask(editItem.id, {
        title: d.title.trim(),
        priority: d.priority === 'none' ? undefined : d.priority,
        project: d.container === 'none' ? undefined : d.container,
        startDate: startDateStr,
        duration: d.duration ? parseInt(d.duration) : undefined,
        startTime: d.startTime || undefined,
        repeatFrequency: d.repeatFrequency !== 'none' ? d.repeatFrequency : undefined,
        repeatDays: d.repeatFrequency === 'custom' ? d.repeatDays : undefined,
        repeatMonthDay: d.repeatFrequency === 'monthly' ? d.repeatMonthDay : undefined,
      });

      // Scheduling is a second pass through scheduleTask/unscheduleTask — they
      // own isScheduled and the project-block/previous-slot clears.
      const effectiveTimeBucket = d.startDate
        ? d.timeBucket === 'none'
          ? 'anytime'
          : d.timeBucket
        : undefined;
      if (d.startDate && effectiveTimeBucket) {
        if (effectiveTimeBucket !== editItem.timeBucket || !editItem.isScheduled) {
          scheduleTask(editItem.id, effectiveTimeBucket, d.startTime || undefined);
        } else if (d.startTime !== editItem.startTime) {
          updateTask(editItem.id, { startTime: d.startTime || undefined });
        }
      } else if (!d.startDate && editItem.isScheduled) {
        unscheduleTask(editItem.id);
      }
    } else {
      updateHabit(editItem.id, {
        title: d.title.trim(),
        group: d.container,
        repeatFrequency: d.repeatFrequency,
        repeatDays: d.repeatFrequency === 'custom' ? d.repeatDays : undefined,
        repeatMonthDay: d.repeatFrequency === 'monthly' ? d.repeatMonthDay : undefined,
        timesPerDay: parseInt(d.timesPerDay) || 1,
        startTime: d.startTime || undefined,
      });

      if (d.timeBucket !== 'none') {
        scheduleHabit(editItem.id, d.timeBucket, d.startTime || undefined);
      } else {
        updateHabit(editItem.id, { timeBucket: undefined, startTime: undefined });
      }
    }

    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (mode === 'add') handleAddSave(activeType);
    else handleEditSave();
  };

  const handleDeleteConfirm = () => {
    if (!state || state.mode !== 'edit' || !editItem) return;
    if (editItem.type === 'habit') deleteHabit(editItem.id);
    else deleteTask(editItem.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const handleResetStreak = () => {
    if (!state || state.mode !== 'edit' || !editItem) return;
    resetHabitStreak(editItem.id);
    setShowResetConfirm(false);
  };

  // ── Registry-driven chips ─────────────────────────────────────────────────

  /**
   * Every optional property of an item, as one wrapping row of chips. Which
   * chips exist is the type's capability config — a new custom type gets a
   * correct dialog with no work here.
   *
   * Unset chips carry the noun ("Priority"), set chips carry the value
   * ("High"), which is what replaced the old label-above-every-control layout
   * without hiding what a control is for.
   */
  const renderChips = (type: string, d: ItemDraft) => {
    const config = getItemTypeConfig(type);
    const patch = (updates: Partial<ItemDraft>) => patchDraft(type, updates);
    const containers = config.containerKind === 'projects' ? projects : habitGroups;
    const containerGlyph = containers.find((c) => c.name === d.container)?.emoji;

    const toggleDay = (day: number) => {
      patch({
        repeatDays: d.repeatDays.includes(day)
          ? d.repeatDays.filter((x) => x !== day)
          : [...d.repeatDays, day].sort(),
      });
    };

    const createContainer = () => {
      const name = d.newContainer.name.trim();
      if (!name) return;
      if (config.containerKind === 'projects') addProject(name, d.newContainer.icon);
      else addHabitGroup(name, d.newContainer.icon);
      patch({
        container: name,
        newContainer: {
          show: false,
          name: '',
          icon: makeIconToken(config.form.newContainerIcon),
        },
      });
    };

    // A dated item with no bucket still lands somewhere — 'anytime' — which is
    // what the save adapters write. The chip says so rather than reading unset.
    const effectiveBucket: TimeBucket | 'none' =
      config.dateAnchored && d.startDate && d.timeBucket === 'none' ? 'anytime' : d.timeBucket;
    const showTime = !config.dateAnchored || !!d.startDate;
    const hasDuration = config.dateAnchored && config.fields.includes('duration');
    const timeParts = [
      effectiveBucket === 'none' ? null : BUCKET_LABELS[effectiveBucket],
      effectiveBucket !== 'none' && effectiveBucket !== 'anytime' && d.startTime
        ? d.startTime
        : null,
      hasDuration ? DURATION_LABELS[d.duration] ?? `${d.duration} min` : null,
    ].filter(Boolean);

    const repeatValue = () => {
      if (d.repeatFrequency === 'none') return undefined;
      if (d.repeatFrequency === 'custom') {
        return d.repeatDays.length > 0
          ? d.repeatDays.map((i) => WEEKDAY_LABELS[i]).join(' ')
          : REPEAT_FREQUENCY_LABELS.custom;
      }
      if (d.repeatFrequency === 'monthly') return `Day ${d.repeatMonthDay}`;
      return REPEAT_FREQUENCY_LABELS[d.repeatFrequency];
    };

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {config.fields.includes('priority') && (
          <PropertyChip
            icon={Flag}
            label="Priority"
            value={d.priority === 'none' ? undefined : PRIORITY_LABELS[d.priority]}
            swatch={d.priority === 'none' ? undefined : `var(--priority-${d.priority})`}
            contentClassName="w-48"
          >
            {(close) =>
              PRIORITY_ORDER.map((p) => (
                <ChipOption
                  key={p}
                  selected={d.priority === p}
                  onSelect={() => {
                    patch({ priority: p });
                    close();
                  }}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background:
                        p === 'none' ? 'var(--muted-foreground)' : `var(--priority-${p})`,
                    }}
                  />
                  {PRIORITY_LABELS[p]}
                  {d.priority === p && <Check className="ml-auto size-3.5" />}
                </ChipOption>
              ))
            }
          </PropertyChip>
        )}

        {config.containerKind && (
          <PropertyChip
            icon={Folder}
            glyph={
              d.container !== 'none' ? (
                <CategoryIcon glyph={containerGlyph} name={d.container} />
              ) : undefined
            }
            label={config.form.containerLabel}
            value={d.container === 'none' ? undefined : d.container}
            className={config.containerKind === 'habitGroups' ? 'capitalize' : undefined}
            contentClassName="w-64"
          >
            {(close) =>
              d.newContainer.show ? (
                <div className="flex gap-1 p-1">
                  <IconPicker
                    value={d.newContainer.icon}
                    name={d.newContainer.name}
                    onSelect={(icon) => patch({ newContainer: { ...d.newContainer, icon } })}
                  />
                  <Input
                    autoFocus
                    placeholder="Name"
                    value={d.newContainer.name}
                    onChange={(e) =>
                      patch({ newContainer: { ...d.newContainer, name: e.target.value } })
                    }
                    className="h-9 flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      createContainer();
                      close();
                    }}
                    data-sub-input
                  />
                  <AddIconButton
                    size="input"
                    onClick={() => {
                      createContainer();
                      close();
                    }}
                    aria-label={`Add ${config.form.containerLabel.toLowerCase()}`}
                  />
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto" data-chip-scroll>
                  {!config.containerRequired && (
                    <ChipOption
                      selected={d.container === 'none'}
                      onSelect={() => {
                        patch({ container: 'none' });
                        close();
                      }}
                      tone="muted"
                    >
                      No {config.form.containerLabel.toLowerCase()}
                    </ChipOption>
                  )}
                  {containers.map((c) => (
                    <ChipOption
                      key={c.name}
                      selected={d.container === c.name}
                      onSelect={() => {
                        patch({ container: c.name });
                        close();
                      }}
                    >
                      <CategoryIcon glyph={c.emoji} name={c.name} />
                      <span
                        className={cn(
                          'truncate',
                          config.containerKind === 'habitGroups' && 'capitalize'
                        )}
                      >
                        {c.name}
                      </span>
                      {d.container === c.name && <Check className="ml-auto size-3.5 shrink-0" />}
                    </ChipOption>
                  ))}
                  <ChipOption
                    tone="primary"
                    onSelect={() => patch({ newContainer: { ...d.newContainer, show: true } })}
                  >
                    <Plus className="size-3.5" />
                    {config.form.newContainerLabel}
                  </ChipOption>
                </div>
              )
            }
          </PropertyChip>
        )}

        {config.dateAnchored && (
          <PropertyChip
            icon={CalendarIcon}
            label="Date"
            value={d.startDate ? format(d.startDate, 'MMM d') : undefined}
            contentClassName="w-auto p-0"
          >
            {(close) => (
              <div>
                <div className="p-1">
                  {DATE_SHORTCUTS.map(({ label, days }) => {
                    const date = addDays(startOfDay(new Date()), days);
                    return (
                      <ChipOption
                        key={label}
                        onSelect={() => {
                          patch({ startDate: date });
                          close();
                        }}
                      >
                        {label}
                        <span className="text-muted-foreground ml-auto text-xs">
                          {format(date, 'MMM d')}
                        </span>
                      </ChipOption>
                    );
                  })}
                </div>
                <div className="border-t">
                  <Calendar
                    mode="single"
                    selected={d.startDate}
                    onSelect={(date) => {
                      patch({ startDate: date });
                      close();
                    }}
                    initialFocus
                  />
                </div>
                {d.startDate && (
                  <div className="border-t p-1">
                    <ChipOption
                      tone="muted"
                      onSelect={() => {
                        patch({ startDate: undefined });
                        close();
                      }}
                    >
                      <X className="size-3.5" />
                      No date
                    </ChipOption>
                  </div>
                )}
              </div>
            )}
          </PropertyChip>
        )}

        {showTime && (
          <PropertyChip
            icon={Clock}
            label="Time"
            value={timeParts.length > 0 ? timeParts.join(' · ') : undefined}
            contentClassName="w-56"
          >
            {(close) => (
              <>
                {mode === 'edit' && !config.dateAnchored && (
                  <ChipOption
                    tone="muted"
                    selected={d.timeBucket === 'none'}
                    onSelect={() => {
                      patch({ timeBucket: 'none', startTime: '' });
                      close();
                    }}
                  >
                    No specific bucket
                  </ChipOption>
                )}
                {BUCKET_ORDER.map((b) => (
                  <ChipOption
                    key={b}
                    selected={effectiveBucket === b}
                    onSelect={() => patch({ timeBucket: b })}
                  >
                    {BUCKET_LABELS[b]}
                    {effectiveBucket === b && <Check className="ml-auto size-3.5" />}
                  </ChipOption>
                ))}

                {effectiveBucket !== 'none' && effectiveBucket !== 'anytime' && (
                  <>
                    <ChipSectionLabel>Specific time</ChipSectionLabel>
                    <div className="px-2 pb-2">
                      <Input
                        type="time"
                        value={d.startTime}
                        onChange={(e) => patch({ startTime: e.target.value })}
                        className="h-9 text-sm"
                        data-sub-input
                      />
                    </div>
                  </>
                )}

                {hasDuration && (
                  <>
                    <ChipSectionLabel>Duration</ChipSectionLabel>
                    <div className="pb-1">
                      {DURATION_ORDER.map((value) => (
                        <ChipOption
                          key={value}
                          selected={d.duration === value}
                          onSelect={() => {
                            patch({ duration: value });
                            close();
                          }}
                        >
                          {DURATION_LABELS[value]}
                          {d.duration === value && <Check className="ml-auto size-3.5" />}
                        </ChipOption>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </PropertyChip>
        )}

        {config.counters.dailyCounts && (
          <PropertyChip
            icon={Repeat2}
            label="Times per day"
            value={`${d.timesPerDay}×`}
            contentClassName="w-40"
          >
            {(close) =>
              ['1', '2', '3', '4', '5'].map((n) => (
                <ChipOption
                  key={n}
                  selected={d.timesPerDay === n}
                  onSelect={() => {
                    patch({ timesPerDay: n });
                    close();
                  }}
                >
                  {n}× a day
                  {d.timesPerDay === n && <Check className="ml-auto size-3.5" />}
                </ChipOption>
              ))
            }
          </PropertyChip>
        )}

        {config.allowedFrequencies.length > 1 && (
          <PropertyChip
            icon={Repeat}
            label="Repeat"
            value={repeatValue()}
            contentClassName="w-[19rem]"
          >
            {(close) => (
              <>
                {Object.entries(REPEAT_FREQUENCY_LABELS)
                  .filter(([value]) =>
                    (config.allowedFrequencies as readonly string[]).includes(value)
                  )
                  .map(([value, label]) => (
                    <div key={value}>
                      <ChipOption
                        selected={d.repeatFrequency === value}
                        onSelect={() => {
                          patch({ repeatFrequency: value as RepeatFrequency });
                          // The detail pickers live in this popover; only the
                          // frequencies that carry no detail dismiss it.
                          if (value !== 'custom' && value !== 'monthly') close();
                        }}
                      >
                        {label}
                        {d.repeatFrequency === value && <Check className="ml-auto size-3.5" />}
                      </ChipOption>

                      {value === 'custom' && d.repeatFrequency === 'custom' && (
                        <div className="px-2 pt-1 pb-2">
                          <div className="flex gap-1">
                            {WEEKDAY_LABELS.map((day, index) => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleDay(index)}
                                aria-pressed={d.repeatDays.includes(index)}
                                className={cn(
                                  'size-9 rounded-md text-xs font-medium transition-all',
                                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                                  d.repeatDays.includes(index)
                                    ? 'bg-primary text-primary-foreground translate-y-px shadow-[var(--shadow-key-pressed)]'
                                    : 'bg-secondary text-secondary-foreground shadow-[var(--shadow-key-rest)] hover-wash'
                                )}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                          {d.repeatDays.length === 0 && (
                            <p className="text-destructive mt-1.5 text-xs">
                              Select at least one day
                            </p>
                          )}
                        </div>
                      )}

                      {value === 'monthly' && d.repeatFrequency === 'monthly' && (
                        <div className="px-2 pt-1 pb-2">
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => patch({ repeatMonthDay: day })}
                                className={cn(
                                  'h-7 rounded-sm text-xs font-medium tabular-nums transition-colors',
                                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                                  d.repeatMonthDay === day
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover-wash'
                                )}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                          <p className="text-muted-foreground mt-1.5 text-[10px]">
                            For months with fewer days, it will occur on the last day.
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
              </>
            )}
          </PropertyChip>
        )}
      </div>
    );
  };


  const invalidCustomDays = (d: ItemDraft | null) =>
    !!d && d.repeatFrequency === 'custom' && d.repeatDays.length === 0;

  // One form renders at a time now: the active tab in add mode, the item's own
  // type in edit mode (the registry NAME, not the envelope discriminant).
  const activeTypeName = mode === 'add' ? activeType : editItem ? itemTypeName(editItem) : 'task';
  const activeConfig = getItemTypeConfig(activeTypeName);
  const activeDraft = mode === 'add' ? draftFor(activeTypeName) : editDraft;
  const titleId = mode === 'add' ? `${activeTypeName}-title` : `edit-${activeTypeName}-title`;
  const streakDays =
    editItem && editItem.type === 'habit' ? recentStreakDays(editItem) : [];

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange}>
        <ResponsiveModalContent
          className="w-[calc(100vw-2rem)] sm:max-w-[460px] max-h-[85vh] overflow-y-auto overflow-x-hidden"
          onKeyDown={(e) => {
            // defaultPrevented: Radix menu/select items preventDefault their own
            // Enter. Those events still bubble through the portal in React's
            // tree, so without this an Enter on "Delete" both opened the confirm
            // AND saved-and-closed the dialog underneath it — leaving the
            // confirm floating over nothing with an inert button, because
            // handleDeleteConfirm bails on the now-null `state`.
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.defaultPrevented &&
              !(e.target as HTMLElement).closest('[data-sub-input]')
            ) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        >
          {/* The visible heading is the title field itself; Radix still needs a
              real title and description in the a11y tree. */}
          <ResponsiveModalHeader className="sr-only">
            <ResponsiveModalTitle>
              {mode === 'add' ? 'Add New' : `Edit ${editConfig?.label ?? 'Item'}`}
            </ResponsiveModalTitle>
            <ResponsiveModalDescription>
              {mode === 'add'
                ? 'Add a new task or habit to your daily planner.'
                : editConfig?.form.editDescription}
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>

          {activeDraft && (
            <div className="flex flex-col gap-4">
              {/* Header: what this is, and — in add mode — what else it could be. */}
              <div className="flex items-center gap-2 pr-8">
                {mode === 'add' ? (
                  <PropertyChip
                    icon={typeIcon(activeTypeName)}
                    label={activeConfig.label}
                    value={activeConfig.label}
                    alwaysChevron
                    className="font-medium"
                    contentClassName="w-56"
                  >
                    {(close) => (
                      <>
                        {typeNames.map((t) => {
                          const TypeIcon = typeIcon(t);
                          return (
                            <ChipOption
                              key={t}
                              selected={t === activeTypeName}
                              onSelect={() => {
                                switchType(t);
                                close();
                              }}
                            >
                              <TypeIcon className="size-3.5 shrink-0" />
                              {getItemTypeConfig(t).label}
                              {t === activeTypeName && <Check className="ml-auto size-3.5" />}
                            </ChipOption>
                          );
                        })}
                        {itemTypesAvailable && (
                          <>
                            <div className="bg-border -mx-1 my-1 h-px" />
                            <ChipOption
                              tone="muted"
                              onSelect={() => {
                                close();
                                // Replaces this dialog rather than stacking on
                                // it: openDialog swaps the single active slot.
                                useUIStore
                                  .getState()
                                  .openDialog({ type: 'manage-categories', tab: 'types' });
                              }}
                            >
                              <Plus className="size-3.5" />
                              Manage types…
                            </ChipOption>
                          </>
                        )}
                      </>
                    )}
                  </PropertyChip>
                ) : (
                  // Edit mode shows the type, it does not offer to change it:
                  // converting an item is a data decision (streaks, completion
                  // history), not a control.
                  <span className="bg-secondary text-foreground inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium">
                    {(() => {
                      const TypeIcon = typeIcon(activeTypeName);
                      return <TypeIcon className="size-3" />;
                    })()}
                    {activeConfig.label}
                  </span>
                )}

                <span className="text-muted-foreground text-xs">
                  {mode === 'add' ? 'New item' : 'Edit'}
                </span>

                {mode === 'edit' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground ml-auto size-7"
                      >
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">More actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {editConfig?.counters.streak && (
                        <DropdownMenuItem onSelect={() => setShowResetConfirm(true)}>
                          <RotateCcw className="size-3.5" />
                          Reset streak
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setShowDeleteConfirm(true)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete {activeConfig.label.toLowerCase()}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Title — the only required field, so it carries the dialog. */}
              <Input
                id={titleId}
                placeholder={activeConfig.form.titlePlaceholder}
                value={activeDraft.title}
                onChange={(e) => patchDraft(activeTypeName, { title: e.target.value })}
                autoFocus={mode === 'edit' || activeTypeName === 'task'}
                // dark:bg-transparent is load-bearing: Input carries
                // dark:bg-input/30, which tailwind-merge keeps (different
                // modifier) and which outranks bg-transparent on specificity.
                className="h-auto border-0 bg-transparent px-0 py-0 text-base font-medium shadow-none placeholder:font-normal focus-visible:ring-0 md:text-base dark:bg-transparent"
              />

              {/* Streak — the habit's history in the row's own dot vocabulary,
                  reading the open-time snapshot (stale after a reset until
                  reopen, as before). */}
              {editConfig?.counters.streak && editItem && (
                <div className="bg-warning/10 flex items-center gap-2.5 rounded-md px-2.5 py-2">
                  <Flame className="text-warning size-4 shrink-0" />
                  <span className="text-warning-text text-xs font-semibold">
                    {(editItem as HabitItem).streak} day streak
                  </span>
                  {/* Same vocabulary as the row's DayDots: a done day is a
                      solid bead in the -text role (which flips bright in dark),
                      a missed day is a 1px RING — which is what --day-off's
                      per-theme alpha was tuned for. As a fill it made the
                      misses the loudest marks in the strip in light mode. */}
                  <span className="ml-auto flex items-center gap-[3px]">
                    {streakDays.map((done, i) => (
                      <span
                        key={i}
                        className={cn(
                          'box-border size-[5px] rounded-full',
                          done ? 'bg-warning-text' : 'border border-day-off'
                        )}
                      />
                    ))}
                  </span>
                </div>
              )}

              {renderChips(activeTypeName, activeDraft)}

              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex">
                  <kbd className="border-border text-muted-foreground rounded-xs border px-1 font-mono text-[10px]">
                    ↵
                  </kbd>
                  to {mode === 'add' ? 'add' : 'save'}
                </span>
                <Button
                  onClick={handleSubmit}
                  disabled={invalidCustomDays(activeDraft) || !activeDraft.title.trim()}
                  className="h-9 max-sm:w-full"
                >
                  {mode === 'add' ? `Add ${activeConfig.label}` : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </ResponsiveModalContent>
      </ResponsiveModal>

      {editConfig?.counters.streak && (
        <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Streak?</AlertDialogTitle>
              <AlertDialogDescription>
                This will reset your streak counter to 0 days. Your completion history stays — days you already checked off remain checked.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetStreak} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Reset Streak
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {editConfig?.label ?? 'Item'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {editConfig?.form.deleteDescription(editItem?.title ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
