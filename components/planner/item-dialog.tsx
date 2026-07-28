'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Flame, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IconPicker } from '@/components/primitives/icon-picker';
import { AddIconButton } from '@/components/primitives/add-icon-button';
import { usePlannerStore } from '@/lib/planner-store';
import type {
  HabitItem,
  Item,
  Priority,
  RepeatFrequency,
  TimeBucket,
} from '@/lib/planner-types';
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/planner-types';
import { ALL_ITEM_TYPES, getItemTypeConfig, itemTypeName } from '@/lib/item-registry';
import { CategoryIcon, makeIconToken } from '@/lib/category-icons';
import { cn } from '@/lib/utils';

/**
 * The one add/edit dialog for every item type, replacing AddTaskDialog /
 * EditTaskDialog / EditHabitDialog. Which fields render is driven by the
 * type-capability registry (lib/item-registry.ts); the per-type save adapters
 * at the bottom keep the store contract (schedule* second pass, explicit
 * `undefined` clears) byte-compatible with the pre-unification dialogs.
 */

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
    defaultTimeBucket,
  } = usePlannerStore();

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

  // Add mode: each open re-seeds only the tab, buckets, and the anchored date.
  // A cancelled dialog deliberately keeps its other draft fields (full reset
  // happens on successful save) — pre-unification behavior.
  useEffect(() => {
    if (!open || !addPayload) return;
    setActiveType(addPayload.type);
    const bucket = addPayload.bucket ?? defaultTimeBucket ?? 'anytime';
    setAddDrafts((drafts) => {
      const next = { ...drafts };
      for (const t of ALL_ITEM_TYPES) {
        next[t] = {
          ...drafts[t],
          timeBucket: bucket,
          ...(getItemTypeConfig(t).dateAnchored ? { startDate: addPayload.date } : null),
        };
      }
      return next;
    });
  }, [open, addPayload, defaultTimeBucket]);

  const patchDraft = (type: string, updates: Partial<ItemDraft>) => {
    if (last?.mode === 'edit') {
      setEditDraft((d) => (d ? { ...d, ...updates } : d));
    } else {
      setAddDrafts((d) => ({ ...d, [type]: { ...d[type], ...updates } }));
    }
  };

  const resetAddDrafts = () => {
    setAddDrafts(
      buildAddDrafts({ bucket: addPayload?.bucket, defaultTimeBucket, habitGroups })
    );
  };

  // ── Save adapters — faithful ports of the per-type dialogs' handlers ──────

  const handleAddSave = (type: string) => {
    // Guard on the LIVE state, not the latch — the latch stays populated
    // through the close animation and must never re-arm a save (the old
    // dialogs disarmed instantly when their item prop went null).
    if (!state || state.mode !== 'add') return;
    const d = addDrafts[type];
    if (!d.title.trim()) return;

    if (type === 'task') {
      const effectiveTimeBucket = d.startDate
        ? d.timeBucket === 'none'
          ? 'anytime'
          : d.timeBucket
        : undefined;
      addTask({
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

    // Habit first; task and custom items share the task-shaped save path.
    // (Custom edits aren't reachable until 6b wires rows + a generic update —
    // updateTask type-guards to a no-op for non-task ids.)
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

  // ── Registry-driven form body ─────────────────────────────────────────────

  const renderForm = (type: string, d: ItemDraft) => {
    const config = getItemTypeConfig(type);
    const patch = (updates: Partial<ItemDraft>) => patchDraft(type, updates);
    const containers = config.containerKind === 'projects' ? projects : habitGroups;
    const titleId = mode === 'add' ? `${type}-title` : `edit-${type}-title`;

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

    return (
      <>
        {/* Title */}
        <div className="space-y-1.5 mb-5">
          <Label htmlFor={titleId} className="text-xs text-muted-foreground">Title</Label>
          <Input
            id={titleId}
            placeholder={config.form.titlePlaceholder}
            value={d.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="bg-background border-border text-base h-11"
            autoFocus={mode === 'edit' || type === 'task'}
          />
        </div>

        {/* Organization Section */}
        <div className="space-y-3 pb-4 mb-4 border-b border-border/50">
          <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Organization</p>
          <div className="flex gap-3">
            {config.fields.includes('priority') && (
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={d.priority} onValueChange={(v) => patch({ priority: v as Priority | 'none' })}>
                  <SelectTrigger className="w-full bg-background border-border h-9 text-sm truncate">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {config.containerKind && (
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">{config.form.containerLabel}</Label>
                {d.newContainer.show ? (
                  <div className="flex gap-1">
                    <IconPicker
                      value={d.newContainer.icon}
                      name={d.newContainer.name}
                      onSelect={(icon) => patch({ newContainer: { ...d.newContainer, icon } })}
                    />
                    <Input
                      placeholder="Name"
                      value={d.newContainer.name}
                      onChange={(e) => patch({ newContainer: { ...d.newContainer, name: e.target.value } })}
                      className="bg-background border-border flex-1 h-9 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && createContainer()}
                      data-sub-input
                    />
                    <AddIconButton
                      size="input"
                      onClick={createContainer}
                      aria-label={`Add ${config.form.containerLabel.toLowerCase()}`}
                    />
                  </div>
                ) : (
                  <Select value={d.container} onValueChange={(v) => {
                    if (v === '__new__') {
                      patch({ newContainer: { ...d.newContainer, show: true } });
                    } else {
                      patch({ container: v });
                    }
                  }}>
                    <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {!config.containerRequired && <SelectItem value="none">None</SelectItem>}
                      {containers.map((c) => (
                        <SelectItem key={c.name} value={c.name}>
                          <span className="flex items-center gap-1.5">
                            <CategoryIcon glyph={c.emoji} name={c.name} />
                            <span className={config.containerKind === 'habitGroups' ? 'capitalize' : undefined}>
                              {c.name}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__" className="text-primary">
                        <Plus className="h-3 w-3 inline mr-1" />
                        {config.form.newContainerLabel}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {config.counters.dailyCounts && (
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Times per day</Label>
                <Select value={d.timesPerDay} onValueChange={(v) => patch({ timesPerDay: v })}>
                  <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Scheduling Section */}
        <div className="space-y-3 pb-4 mb-4 border-b border-border/50">
          <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Scheduling</p>
          {config.dateAnchored ? (
            <>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <div className="relative">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal bg-background border-border h-9 text-sm px-2 pr-7',
                            !d.startDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{d.startDate ? format(d.startDate, 'MMM d') : 'None'}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={d.startDate}
                          onSelect={(date) => patch({ startDate: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {d.startDate && (
                      <button
                        type="button"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent"
                        onClick={(e) => { e.stopPropagation(); patch({ startDate: undefined }); }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Time</Label>
                  <Select
                    value={d.startDate ? (d.timeBucket === 'none' ? 'anytime' : d.timeBucket) : ''}
                    onValueChange={(v) => patch({ timeBucket: v as TimeBucket })}
                    disabled={!d.startDate}
                  >
                    <SelectTrigger className={cn(
                      'w-full bg-background border-border h-9 text-sm truncate',
                      !d.startDate && 'opacity-50'
                    )}>
                      <SelectValue placeholder="--" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anytime">Anytime</SelectItem>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="afternoon">Afternoon</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {config.fields.includes('duration') && (
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Duration</Label>
                    <Select value={d.duration} onValueChange={(v) => patch({ duration: v })}>
                      <SelectTrigger className="w-full bg-background border-border h-9 text-sm truncate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="45">45 min</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {d.startDate && d.timeBucket !== 'anytime' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Specific Time (optional)</Label>
                  <Input
                    type="time"
                    value={d.startTime}
                    onChange={(e) => patch({ startTime: e.target.value })}
                    className="bg-background border-border h-9 text-sm w-32"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex gap-3">
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Select value={d.timeBucket} onValueChange={(v) => patch({ timeBucket: v as TimeBucket | 'none' })}>
                  <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
                    <SelectValue placeholder="Anytime" />
                  </SelectTrigger>
                  <SelectContent>
                    {mode === 'edit' && <SelectItem value="none">No specific bucket</SelectItem>}
                    <SelectItem value="anytime">Anytime</SelectItem>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="afternoon">Afternoon</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {d.timeBucket !== 'none' && d.timeBucket !== 'anytime' && (
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Specific Time</Label>
                  <Input
                    type="time"
                    value={d.startTime}
                    onChange={(e) => patch({ startTime: e.target.value })}
                    className="w-full bg-background border-border h-9 text-sm"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Repeat Section */}
        <div className="space-y-3">
          <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Repeat</p>
          <Select value={d.repeatFrequency} onValueChange={(v) => patch({ repeatFrequency: v as RepeatFrequency })}>
            <SelectTrigger className="bg-background border-border h-9 text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(REPEAT_FREQUENCY_LABELS)
                .filter(([value]) =>
                  (config.allowedFrequencies as readonly string[]).includes(value)
                )
                .map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {d.repeatFrequency === 'custom' && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(index)}
                    className={cn(
                      'w-8 h-8 rounded-md text-xs font-medium transition-colors',
                      d.repeatDays.includes(index)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/50 text-muted-foreground hover-wash'
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
              {d.repeatDays.length === 0 && (
                <p className="text-xs text-destructive">Select at least one day</p>
              )}
            </div>
          )}

          {d.repeatFrequency === 'monthly' && (
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => patch({ repeatMonthDay: day })}
                    className={cn(
                      'w-7 h-7 rounded text-xs font-medium transition-colors',
                      d.repeatMonthDay === day
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/50 text-muted-foreground hover-wash'
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                For months with fewer days, it will occur on the last day.
              </p>
            </div>
          )}
        </div>
      </>
    );
  };

  const invalidCustomDays = (d: ItemDraft | null) =>
    !!d && d.repeatFrequency === 'custom' && d.repeatDays.length === 0;

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange}>
        <ResponsiveModalContent
          className="w-[calc(100vw-2rem)] max-w-[425px] bg-card max-h-[85vh] overflow-y-auto overflow-x-hidden"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !(e.target as HTMLElement).closest('[data-sub-input]')) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        >
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="text-foreground">
              {mode === 'add' ? 'Add New' : `Edit ${editConfig?.label ?? 'Item'}`}
            </ResponsiveModalTitle>
            <ResponsiveModalDescription className="sr-only">
              {mode === 'add'
                ? 'Add a new task or habit to your daily planner.'
                : editConfig?.form.editDescription}
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>

          {mode === 'add' ? (
            <Tabs value={activeType} onValueChange={setActiveType}>
              <TabsList className="grid w-full grid-cols-2 bg-secondary">
                {ALL_ITEM_TYPES.map((t) => (
                  <TabsTrigger key={t} value={t} className="data-[state=active]:bg-card">
                    {getItemTypeConfig(t).label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {ALL_ITEM_TYPES.map((t) => (
                <TabsContent key={t} value={t} className="mt-4">
                  {renderForm(t, addDrafts[t])}
                  <Button
                    onClick={() => handleAddSave(t)}
                    className="w-full h-10 mt-6"
                    disabled={invalidCustomDays(addDrafts[t])}
                  >
                    Add {getItemTypeConfig(t).label}
                  </Button>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            editItem && editDraft && editConfig && (
              <>
                <div className="py-4 w-full overflow-hidden">
                  {/* Streak display — reads the open-time snapshot, so it stays
                      stale after a reset until reopen (pre-unification behavior). */}
                  {editConfig.counters.streak && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-warning/10 to-warning/10 border border-warning/20 mb-5">
                      <div className="flex items-center gap-2">
                        <Flame className="h-5 w-5 text-warning" />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Current Streak</p>
                          <p className="text-xl font-bold text-warning-text">
                            {(editItem as HabitItem).streak} days
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive h-8 text-xs"
                        onClick={() => setShowResetConfirm(true)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Reset
                      </Button>
                    </div>
                  )}

                  {renderForm(editItem.type, editDraft)}
                </div>

                <ResponsiveModalFooter className="flex flex-row justify-between items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete {editConfig.label.toLowerCase()}</span>
                  </Button>
                  <Button
                    onClick={handleEditSave}
                    className="flex-1 min-w-0"
                    disabled={invalidCustomDays(editDraft)}
                  >
                    Save Changes
                  </Button>
                </ResponsiveModalFooter>
              </>
            )
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
