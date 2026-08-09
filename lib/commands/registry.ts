import {
  CalendarCheck,
  CalendarDays,
  CalendarMinus,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Columns3,
  Contrast,
  Filter,
  FilterX,
  FolderOpen,
  FolderPlus,
  Inbox,
  Keyboard,
  Layers,
  MessageSquare,
  Moon,
  PanelLeft,
  Palette,
  Plus,
  Redo2,
  Rows3,
  Search,
  Settings,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Bug,
  AlarmClock,
  CheckCircle2,
  Clock,
  Flag,
  Flame,
  SkipForward,
  Trash2,
  Type,
  Undo2,
  Unlink,
  Wand2,
  Zap,
  Pause as PauseIcon,
  Play as PlayIcon,
} from 'lucide-react';
import { addDays, subDays } from 'date-fns';

import { usePlannerStore } from '../planner-store';
import { useViewStore } from '../view-store';
import { useUIStore, openAddDialog } from '../ui-store';
import { useSidebarStore } from '../sidebar-store';
import { useSelectionStore, selectableIdsInDom } from '../selection-store';
import { useMobileNavStore } from '../mobile-nav-store';
import { useMorningStore } from '../morning-store';
import { useEODStore } from '../eod-store';
import { useChatStore } from '../chat-store';
import { goToDate, stepScope } from '../nav-commands';
import { resolveCategoryIcon } from '../category-icons';
import { getItemTypeConfig, isSkippable, isPausable, itemTypeName } from '../item-registry';
import { selectOverdue } from '../overdue';
import { inactiveItemIdsOn } from '../active';
import { toDateStr } from '../recurrence';
import { PRIORITY_LABELS, TIME_BUCKET_RANGES } from '../planner-types';
import { isScalableLayout } from '../week-columns';
import {
  CANVAS_GROUP_BY_OPTIONS,
  LAYOUT_OPTIONS,
  TYPE_OPTIONS,
  type CanvasGroupBy,
} from '../view-options';
import {
  assignBucket,
  isCancelled,
  isDoneOn,
  isHabit,
  isPausedNow,
  isSkippedOn,
  isTaskLike,
  itemCommand,
  nextDayStr,
} from './entities';
import type { Command, CommandArgOption, CommandContext, CommandProvider } from './types';
import type { TypeFilter, ViewLayout } from '../view-store';
import type { Priority, TimeBucket } from '../planner-types';

/**
 * The command registry.
 *
 * Round 1 shipped one rule: a command was in here only if it was GLOBAL (it
 * needed no target item, because there was no selection model — see
 * lib/hovered-item.ts for why hover is not one) and VERIFIED (its hook has a
 * live consumer). The second half still holds; the first is now lifted.
 *
 * Round 2 added the missing primitive — the `entity` argument
 * (lib/commands/entities.ts), which resolves "which item did you mean" against
 * the planner store. That is what the Items group below is built on, and it is
 * why this file is no longer a flat array: `resolveCommands(ctx)` is the
 * registry as the palette sees it, and it is the static list PLUS whatever the
 * providers derive from live data (today, one "Add ‹type›" per hydrated custom
 * item type). STATIC_COMMANDS remains the only thing that may own a keyboard
 * shortcut, because bindings are persisted by id and a command that can vanish
 * cannot own one.
 *
 * Still parked, and not for want of machinery: renaming a project or group.
 * Items reference their container BY NAME, so a rename orphans every child —
 * that is a data-model fix (stable container ids) before it is a command.
 *
 * Several app settings are deliberately absent rather than dead: compact mode,
 * chill mode, the current-time indicator, default view, morning-check time,
 * assistant name and the custom system prompt all persist correctly but are
 * read by nothing on screen today. Their setters are untouched — adding a
 * command is one entry here the day a view consumes them again.
 *
 * Declaration order is the palette's within-group order, and the matcher's
 * final tie-break. Put the thing you reach for most first.
 */

/* ── helpers ───────────────────────────────────────────────────────────── */

const planner = () => usePlannerStore.getState();
const view = () => useViewStore.getState();

/**
 * "Set priority" and "Move to bucket" want TWO values — an item and a level.
 * The argument model holds one, and rather than grow a multi-chip flow for two
 * commands, each value gets its own command: "Set priority: High" then pick the
 * item. Same trade the flattened enums make (types.ts, `flatten`) — a known
 * value costs one keystroke instead of a second browse — and the same reason
 * these are generated rather than typed out seven times: the levels are data
 * the app already owns.
 */
function priorityCommands(): Command[] {
  return (Object.keys(PRIORITY_LABELS) as Priority[]).map((priority) =>
    itemCommand({
      id: `items.priority.${priority}`,
      label: `Set priority: ${PRIORITY_LABELS[priority]}`,
      icon: Flag,
      keywords: `priority ${priority} importance urgent level set`,
      aliases: [priority],
      placeholder: 'Which task?',
      emptyLabel: `Nothing left to set to ${PRIORITY_LABELS[priority].toLowerCase()}`,
      // Habits carry no priority field.
      eligible: (item) => isTaskLike(item) && item.priority !== priority && !isCancelled(item),
      detail: (item) =>
        isTaskLike(item) && item.priority ? PRIORITY_LABELS[item.priority] : undefined,
      run: (item) => planner().updateTask(item.id, { priority }),
    })
  );
}

function bucketCommands(): Command[] {
  return (Object.keys(TIME_BUCKET_RANGES) as TimeBucket[]).map((bucket) =>
    itemCommand({
      id: `items.bucket.${bucket}`,
      label: `Move to ${TIME_BUCKET_RANGES[bucket].label}`,
      icon: BUCKET_ICONS[bucket],
      keywords: `move bucket ${bucket} time when reschedule`,
      aliases: [bucket],
      emptyLabel: `Nothing left to move to ${TIME_BUCKET_RANGES[bucket].label.toLowerCase()}`,
      eligible: (item, dateStr) =>
        item.timeBucket !== bucket && !isDoneOn(item, dateStr) && !isCancelled(item),
      detail: (item) =>
        item.timeBucket ? TIME_BUCKET_RANGES[item.timeBucket].label : undefined,
      run: (item) => assignBucket(item, bucket),
    })
  );
}

const BUCKET_ICONS: Record<TimeBucket, Command['icon']> = {
  anytime: Clock,
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
};

function optionsFrom<T extends string>(
  list: { value: T; label: string; icon: CommandArgOption['icon'] }[],
  current: T
): CommandArgOption[] {
  return list.map((o) => ({
    value: o.value,
    label: o.label,
    icon: o.icon,
    active: o.value === current,
  }));
}

/* ── the static registry ───────────────────────────────────────────────── */

export const STATIC_COMMANDS: Command[] = [
  /* ── Create ─────────────────────────────────────────────────────────── */
  {
    id: 'create.task',
    label: 'Add task',
    group: 'create',
    icon: Plus,
    keywords: 'new create todo',
    aliases: ['task'],
    shortcut: { id: 'new_task', keys: ['n'] },
    run: () => openAddDialog('task'),
  },
  {
    id: 'create.habit',
    label: 'Add habit',
    group: 'create',
    icon: Plus,
    keywords: 'new create routine streak',
    aliases: ['habit'],
    run: () => openAddDialog('habit'),
  },
  {
    id: 'create.project',
    label: 'Add project',
    description: 'Create a project you can file tasks under',
    group: 'create',
    icon: FolderPlus,
    keywords: 'new folder category group',
    aliases: ['project'],
    argument: {
      kind: 'text',
      placeholder: 'Project name',
      validate: (value) => {
        const name = value.trim();
        if (!name) return 'Enter a project name';
        // addProject no-ops silently on an exact duplicate, so without this the
        // palette would report success and do nothing.
        const clash = planner().projects.find(
          (p) => p.name.toLowerCase() === name.toLowerCase()
        );
        return clash ? `“${clash.name}” already exists` : null;
      },
    },
    // Empty glyph on purpose: resolveCategoryIcon then derives the icon from
    // the name ("Gym" → dumbbell). Passing a hardcoded token would give every
    // palette-created project the same wrong icon.
    run: (_ctx, arg) => planner().addProject((arg ?? '').trim(), ''),
  },

  /* ── Items ──────────────────────────────────────────────────────────────
     Everything here takes an entity argument: you pick the command, then the
     item. Eligibility is declared once per command and drives both the picker
     and the greyed-out state — see lib/commands/entities.ts. */
  itemCommand({
    id: 'items.complete',
    label: 'Complete',
    description: 'Tick off a task or habit on the day you are looking at',
    icon: CheckCircle2,
    keywords: 'complete done finish tick check off mark',
    aliases: ['complete', 'done'],
    emptyLabel: 'Nothing left to complete',
    eligible: (item, dateStr) => !isDoneOn(item, dateStr) && !isCancelled(item),
    run: (item) =>
      isHabit(item)
        ? planner().toggleHabitStatus(item.id, 'done')
        : planner().toggleTaskStatus(item.id, 'completed'),
  }),
  itemCommand({
    id: 'items.delete',
    label: 'Delete',
    icon: Trash2,
    keywords: 'delete remove destroy trash',
    aliases: ['delete'],
    emptyLabel: 'Nothing to delete',
    // The one command here with no eligibility rule beyond existing: you can
    // always delete anything, including something already completed.
    eligible: () => true,
    run: (item) => {
      const config = getItemTypeConfig(itemTypeName(item));
      // Confirmed, not immediate. Every other item command is a single undo
      // away; this one destroys a habit's whole history with it, so it goes
      // through the same prompt the item dialog uses, with that type's copy.
      useUIStore.getState().confirm({
        title: `Delete ${config.label.toLowerCase()}?`,
        description: config.form.deleteDescription(item.title),
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: () =>
          isHabit(item) ? planner().deleteHabit(item.id) : planner().deleteTask(item.id),
      });
    },
  }),
  itemCommand({
    id: 'items.snooze',
    label: 'Snooze to tomorrow',
    description: 'Push an item forward one day',
    icon: AlarmClock,
    keywords: 'snooze postpone defer later push tomorrow delay',
    aliases: ['snooze'],
    emptyLabel: 'Nothing to snooze',
    // Habits are date-blind by construction (dateAnchored: false) — there is
    // no date on them to move.
    eligible: (item, dateStr) => isTaskLike(item) && !isDoneOn(item, dateStr) && !isCancelled(item),
    run: (item, dateStr) => planner().updateTask(item.id, { startDate: nextDayStr(item, dateStr) }),
  }),
  itemCommand({
    id: 'items.skip',
    label: 'Skip today',
    description: "Marks the day skipped — for a habit, without breaking the streak",
    icon: SkipForward,
    keywords: 'skip habit rest day pass miss recurring',
    aliases: ['skip'],
    placeholder: 'Which item?',
    emptyLabel: 'Nothing left to skip today',
    // Registry capability, not "is it a habit": any recurring occurrence of a
    // skippable type can be skipped (#194). One-shot items are excluded by
    // isSkippable — they get completed or cancelled, never skipped.
    eligible: (item, dateStr) =>
      isSkippable(item) && !isDoneOn(item, dateStr) && !isSkippedOn(item, dateStr),
    // No date argument, exactly as before: the store resolves the selected day,
    // which is the same day `dateStr` was derived from.
    run: (item) => planner().setItemSkipped(item.id, true),
  }),
  itemCommand({
    id: 'items.resetStreak',
    label: 'Reset streak',
    description: 'Zeroes the counter; completion history is kept',
    icon: Flame,
    keywords: 'reset streak counter zero habit start over',
    aliases: ['streak'],
    placeholder: 'Which habit?',
    emptyLabel: 'No habit has a streak to reset',
    eligible: (item) => isHabit(item) && item.streak > 0,
    detail: (item) => (isHabit(item) ? `🔥 ${item.streak}` : undefined),
    run: (item) => planner().resetHabitStreak(item.id),
  }),
  itemCommand({
    id: 'items.leaveProjectBlock',
    label: 'Move out of project block',
    description: 'Returns the task to the time it had before the block claimed it',
    icon: Unlink,
    keywords: 'project block remove out release detach unblock',
    aliases: ['unblock'],
    placeholder: 'Which task?',
    emptyLabel: 'No task is in a project block',
    // moveTaskOutOfProjectBlock resolves against type 'task' specifically, so
    // custom types are out even though they are otherwise task-shaped.
    eligible: (item) => item.type === 'task' && !!item.inProjectBlock,
    run: (item) => planner().moveTaskOutOfProjectBlock(item.id),
  }),
  // Pause / Resume deliberately ignore the dateStr these predicates are handed:
  // that is the SELECTED day, and pausing is dateless (plan decision 3). Keying
  // on it would make the two commands trade places as the user walks the week
  // past a resume boundary, and the picker's contents change with them.
  //
  // "Pause until…" is absent on purpose — itemCommand supports exactly one
  // argument and it is the entity, so a date belongs to the dialog's overflow
  // menu and the mobile sheet, which can host a picker.
  itemCommand({
    id: 'items.pause',
    label: 'Pause',
    description: 'Sets it aside — hidden until you resume, streak untouched',
    icon: PauseIcon,
    keywords: 'pause hold suspend set aside break vacation hide later',
    aliases: ['pause'],
    emptyLabel: 'Nothing to pause',
    eligible: (item) => isPausable(item) && !isPausedNow(item),
    run: (item) => planner().setItemPaused(item.id, true),
  }),
  itemCommand({
    id: 'items.resume',
    label: 'Resume',
    description: 'Brings it back where you left it',
    icon: PlayIcon,
    keywords: 'resume unpause restart continue bring back restore',
    aliases: ['resume'],
    placeholder: 'Which paused item?',
    emptyLabel: 'Nothing is paused',
    eligible: (item) => isPausedNow(item),
    run: (item) => planner().setItemPaused(item.id, false),
  }),
  ...priorityCommands(),
  ...bucketCommands(),

  /* ── Go to ──────────────────────────────────────────────────────────── */
  {
    id: 'goto.today',
    label: 'Go to today',
    group: 'goto',
    icon: CalendarCheck,
    keywords: 'now jump date current',
    aliases: ['today'],
    run: () => goToDate(new Date()),
  },
  {
    id: 'goto.tomorrow',
    label: 'Go to tomorrow',
    group: 'goto',
    icon: CalendarPlus,
    keywords: 'next jump date',
    aliases: ['tomorrow'],
    run: () => goToDate(addDays(new Date(), 1), 'left'),
  },
  {
    id: 'goto.yesterday',
    label: 'Go to yesterday',
    description: 'Check off anything you missed',
    group: 'goto',
    icon: CalendarMinus,
    keywords: 'back previous jump date missed',
    aliases: ['yesterday'],
    run: () => goToDate(subDays(new Date(), 1), 'right'),
  },
  {
    id: 'goto.next',
    label: 'Next day or week',
    dynamicLabel: () => (view().scope === 'week' ? 'Next week' : 'Next day'),
    group: 'goto',
    icon: ChevronRight,
    keywords: 'forward advance',
    aliases: ['next'],
    run: () => stepScope(1),
  },
  {
    id: 'goto.previous',
    label: 'Previous day or week',
    dynamicLabel: () => (view().scope === 'week' ? 'Previous week' : 'Previous day'),
    group: 'goto',
    icon: ChevronLeft,
    keywords: 'back last',
    aliases: ['prev', 'previous'],
    run: () => stepScope(-1),
  },
  {
    id: 'goto.braindump',
    label: 'Open braindump',
    description: 'Your unscheduled backlog',
    group: 'goto',
    icon: Inbox,
    keywords: 'inbox backlog unscheduled capture notes',
    aliases: ['braindump', 'inbox'],
    run: (ctx) => {
      if (ctx.isMobile) useMobileNavStore.getState().setActiveTab('braindump');
      else useSidebarStore.getState().setLeftSidebarOpen(true);
    },
  },
  {
    id: 'goto.todayTab',
    label: 'Go to Today tab',
    group: 'goto',
    icon: Rows3,
    keywords: 'plan canvas schedule',
    // Mobile's primary navigation; on desktop the canvas is always on screen.
    hidden: (ctx) => !ctx.isMobile,
    run: () => useMobileNavStore.getState().setActiveTab('today'),
  },
  {
    id: 'goto.overdue',
    label: 'Show items waiting',
    description: 'Opens the tray listing anything still waiting from an earlier day',
    group: 'goto',
    // Sunrise, not AlertTriangle. The surface this opens is deliberately not an
    // alert (see the copy contract on BarCopy in components/ai/morning-check.tsx)
    // and a warning triangle in the palette undoes that before the tray even
    // opens. Same glyph as settings.morningCheck below, so the two rows that
    // touch this feature look related. Every old search term is kept in
    // `keywords` — the vocabulary changed, the ways in didn't.
    icon: Sunrise,
    keywords: 'overdue past due late missed behind morning check waiting carried',
    aliases: ['overdue'],
    // The past-due surface ships on BOTH platforms now, so there is no platform
    // gate. It starts collapsed and can be dismissed for the day, neither of
    // which reverses on its own — which is what makes this worth a row.
    //
    // Greyed rather than a no-op: the surface also self-hides when nothing is
    // overdue, so without this the command would silently do nothing on a day
    // you happen to be caught up. Dismissal state deliberately does NOT gate
    // availability — run() resets the dismissal AND opens the tray, so the
    // command does something real in both states (before, when nothing was
    // dismissed, resetDismissal() alone was the very no-op this guard exists to
    // prevent). Predicate is the shared one (lib/overdue.ts): this copy had no
    // recurrence guard, so it lit up for daily chores that are `pending`
    // forever by design.
    availableWhen: () => {
      if (!useMorningStore.getState().morningCheckEnabled) return false;
      // items, not the `tasks` projection: the selector resolves each item's
      // registry config, and custom types are carry-forward eligible too.
      //
      // "Today" comes from the user's SAVED timezone (the app-wide `toDateStr`
      // convention), matching the bar in components/ai/morning-check.tsx and
      // the sweep in hooks/use-overdue-sweep.ts. Bare `format(new Date(), …)`
      // would read the machine tz and could grey this row out on a day the bar
      // is visibly showing overdue items.
      const { items, userTimezone } = planner();
      const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const todayStr = toDateStr(new Date(), tz);
      // Dateless surface: resolve suppression at TODAY, never at the store's
      // navigable selectedDate (plan decision 3).
      const inactive = inactiveItemIdsOn(items, todayStr, { userTimezone: tz });
      return selectOverdue(items, todayStr, inactive).length > 0;
    },
    // Reveal the surface BEFORE poking its state — the same guard openChat,
    // Open braindump and focusOmnibar already use. The past-due pill is
    // Today-only on mobile (components/shell/mobile-shell.tsx:60) while the
    // omnibar is mounted on Braindump too, so without the tab switch this
    // command flips isOpen on a tab that renders nothing: it looks broken, and
    // the drawer would then ambush the user the moment they swiped to Today.
    run: (ctx) => {
      if (ctx.isMobile) useMobileNavStore.getState().setActiveTab('today');
      const store = useMorningStore.getState();
      store.resetDismissal();
      store.open();
    },
  },

  /* ── View ───────────────────────────────────────────────────────────── */
  {
    id: 'view.layout',
    label: 'Change layout',
    group: 'view',
    icon: Rows3,
    keywords: 'buckets schedule list timeline view',
    aliases: ['layout'],
    argument: {
      kind: 'enum',
      placeholder: 'Layout',
      flatten: true,
      options: () => optionsFrom(LAYOUT_OPTIONS, view().layout),
    },
    run: (_ctx, arg) => view().setLayout(arg as ViewLayout),
  },
  {
    id: 'view.typeFilter',
    label: 'Show',
    description: 'Tasks, habits, or both',
    group: 'view',
    icon: Filter,
    keywords: 'tasks habits both type filter only',
    aliases: ['show'],
    argument: {
      kind: 'enum',
      placeholder: 'Show',
      flatten: true,
      options: () => optionsFrom(TYPE_OPTIONS, view().typeFilter),
    },
    run: (_ctx, arg) => view().setTypeFilter(arg as TypeFilter),
  },
  {
    id: 'view.groupBy',
    label: 'Group by',
    description: 'Priority and Time bucket reshape the List layout; Buckets honours Project',
    group: 'view',
    icon: Layers,
    keywords: 'group sort organise organize project priority bucket',
    aliases: ['group'],
    argument: {
      kind: 'enum',
      placeholder: 'Group by',
      flatten: true,
      options: () => optionsFrom(CANVAS_GROUP_BY_OPTIONS, view().canvasGroupBy as CanvasGroupBy),
    },
    run: (_ctx, arg) => view().setCanvasGroupBy(arg as CanvasGroupBy),
  },
  {
    id: 'view.filterProject',
    label: 'Filter by project',
    description: 'Filtering by project hides habits from the canvas',
    group: 'view',
    icon: Filter,
    keywords: 'filter project only narrow',
    aliases: ['filter'],
    availableWhen: () => planner().projects.length > 0,
    argument: {
      kind: 'enum',
      placeholder: 'Project',
      // Never flattened: names are free text, so flattening lets a project
      // called "Today" or "List" outrank the built-in command of that name.
      options: () => {
        const active = view().canvasFilters.projects;
        return planner().projects.map((p) => ({
          value: p.name,
          label: p.name,
          icon: resolveCategoryIcon(p.emoji, p.name),
          active: active.includes(p.name),
        }));
      },
    },
    run: (_ctx, arg) => {
      if (!arg) return;
      const store = view();
      const current = store.canvasFilters;
      store.setCanvasFilters({
        ...current,
        projects: current.projects.includes(arg)
          ? current.projects.filter((p) => p !== arg)
          : [...current.projects, arg],
      });
    },
  },
  {
    id: 'view.clearFilters',
    label: 'Clear canvas filters',
    group: 'view',
    icon: FilterX,
    keywords: 'clear reset filters show all',
    aliases: ['clear'],
    availableWhen: () => {
      const f = view().canvasFilters;
      return f.projects.length > 0 || f.priorities.length > 0 || f.hideCompleted;
    },
    run: () => view().setCanvasFilters({ projects: [], priorities: [], hideCompleted: false }),
  },
  {
    id: 'view.scopeDay',
    label: 'Switch to Day view',
    description: 'Also becomes the view Anchor opens on',
    group: 'view',
    icon: Sun,
    keywords: 'day scope today single',
    aliases: ['day'],
    // Mobile is day-only by construction — MobileViewRouter never reads scope —
    // so on a phone this row would do nothing visible while still writing
    // default_view to the server.
    hidden: (ctx) => ctx.isMobile,
    run: () => view().setScope('day'),
  },
  {
    id: 'view.scopeWeek',
    label: 'Switch to Week view',
    description: 'Also becomes the view Anchor opens on',
    group: 'view',
    icon: CalendarDays,
    keywords: 'week scope seven days',
    aliases: ['week'],
    hidden: (ctx) => ctx.isMobile,
    run: () => view().setScope('week'),
  },
  {
    id: 'view.toggleScope',
    label: 'Toggle Day/Week view',
    dynamicLabel: () => (view().scope === 'week' ? 'Switch to Day view' : 'Switch to Week view'),
    description: 'Flips between the two, same as picking one directly',
    group: 'view',
    icon: CalendarRange,
    keywords: 'day week scope toggle switch flip view',
    aliases: ['toggle'],
    shortcut: { id: 'toggle_view_scope', keys: ['v'] },
    // Same reason as the two commands above: mobile is day-only by
    // construction, so this would silently write default_view with no
    // visible effect.
    hidden: (ctx) => ctx.isMobile,
    run: () => view().setScope(view().scope === 'week' ? 'day' : 'week'),
  },
  /*
   * Week column scale. ⌘+ / ⌘− / ⌘0 are the browser's page-zoom keys, and the
   * dispatcher only preventDefaults a command it is actually going to RUN — so
   * `availableWhen` is what hands them back to the browser everywhere except the
   * two week views that have day columns to scale. Repeatable, because holding
   * the key to sweep the ladder is the whole gesture.
   */
  {
    id: 'view.weekColumnsWider',
    label: 'Widen day columns',
    description: 'Fewer, wider day columns in the week views',
    group: 'view',
    icon: ChevronsLeftRight,
    keywords: 'week column width wider zoom in bigger scale days',
    shortcut: { id: 'week_columns_wider', keys: ['meta', '='], repeatable: true },
    availableWhen: () => view().scope === 'week' && isScalableLayout(view().layout),
    hidden: (ctx) => ctx.isMobile,
    run: () => view().stepWeekDaysVisible(1),
  },
  {
    id: 'view.weekColumnsNarrower',
    label: 'Narrow day columns',
    description: 'More, narrower day columns in the week views',
    group: 'view',
    icon: ChevronsRightLeft,
    keywords: 'week column width narrower zoom out smaller scale days',
    shortcut: { id: 'week_columns_narrower', keys: ['meta', '-'], repeatable: true },
    availableWhen: () => view().scope === 'week' && isScalableLayout(view().layout),
    hidden: (ctx) => ctx.isMobile,
    run: () => view().stepWeekDaysVisible(-1),
  },
  {
    id: 'view.weekColumnsReset',
    label: 'Reset day column width',
    description: 'Back to whatever fits the canvas best',
    group: 'view',
    icon: Columns3,
    keywords: 'week column width reset default automatic fit canvas',
    shortcut: { id: 'week_columns_reset', keys: ['meta', '0'] },
    // Clears the choice rather than writing a fixed count, so the view goes back
    // to picking the stop nearest TARGET_COL_PX — and keeps re-picking it as the
    // canvas changes, exactly as it did before the control was ever touched.
    availableWhen: () =>
      view().scope === 'week' && isScalableLayout(view().layout) && view().weekDaysVisible !== null,
    hidden: (ctx) => ctx.isMobile,
    run: () => view().setWeekDaysVisible(null),
  },

  /* ── Rituals & Beacon ───────────────────────────────────────────────── */
  {
    id: 'rituals.chat',
    label: 'Ask Beacon',
    group: 'rituals',
    icon: Sparkles,
    keywords: 'chat ai assistant beacon ask question',
    aliases: ['chat', 'beacon'],
    run: (ctx) => ctx.openChat(),
  },
  {
    id: 'rituals.planDay',
    label: 'Plan my day',
    description: 'Asks Beacon to build a plan from today’s tasks',
    group: 'rituals',
    icon: Wand2,
    keywords: 'plan day schedule ai beacon organise organize',
    aliases: ['plan'],
    // send() no-ops while a response is streaming.
    availableWhen: () => !useChatStore.getState().isLoading,
    run: (ctx) => {
      ctx.openChat();
      const chat = useChatStore.getState();
      // ChatConversation is what normally hydrates the store, and it has not
      // mounted yet at this point. Sending first would append to an empty
      // message list and immediately persist it over the saved transcript.
      chat.hydrate();
      void chat.send('Plan my day');
    },
  },
  {
    id: 'rituals.eod',
    label: 'Start end-of-day review',
    group: 'rituals',
    icon: Moon,
    keywords: 'eod evening review reflect wrap up night',
    aliases: ['eod', 'review'],
    run: () => useEODStore.getState().open(),
  },

  /* ── Workspace ──────────────────────────────────────────────────────── */
  {
    id: 'workspace.toggleChat',
    label: 'Toggle chat panel',
    group: 'workspace',
    icon: MessageSquare,
    keywords: 'chat panel sidebar beacon hide show',
    shortcut: { id: 'toggle_right_sidebar', keys: ['meta', ']'], allowInInput: true },
    // Nothing in the mobile tree consumes sidebar-store.
    hidden: (ctx) => ctx.isMobile,
    run: () => {
      const sidebar = useSidebarStore.getState();
      // Opening chat while the sidebar is collapsed would expand a panel
      // inside a w-0 overflow-hidden column: nothing appears, and the state
      // silently desyncs from what the user last saw.
      if (!sidebar.chatExpanded) sidebar.setLeftSidebarOpen(true);
      sidebar.toggleChat();
    },
  },
  {
    id: 'workspace.toggleSidebar',
    label: 'Toggle sidebar',
    group: 'workspace',
    icon: PanelLeft,
    keywords: 'sidebar collapse expand hide show braindump',
    shortcut: { id: 'toggle_left_sidebar', keys: ['meta', '['], allowInInput: true },
    // Deliberately never a palette row: the omnibar lives INSIDE the sidebar,
    // so running this from the palette makes the palette disappear — and
    // ⌘K then focuses a zero-width, clipped input that looks broken. The
    // binding is the point; the row would be a trapdoor.
    hidden: true,
    run: () => useSidebarStore.getState().toggleLeftSidebar(),
  },
  {
    id: 'workspace.focusItemPanel',
    label: 'Focus item panel',
    description: 'Move focus into the open item panel',
    group: 'workspace',
    icon: PanelLeft,
    keywords: 'item panel inspector focus edit details',
    shortcut: { id: 'focus_item_panel', keys: ['meta', '\\'], allowInInput: true },
    // Hidden for the same reason toggleSidebar is: with no panel open the row
    // would be a trapdoor that appears to do nothing. The binding is the point,
    // and it still shows up in the shortcuts modal.
    hidden: true,
    run: () => useUIStore.getState().focusItemPanel(),
  },
  {
    id: 'workspace.focusOmnibar',
    label: 'Search',
    description: 'Focus the omnibar',
    group: 'workspace',
    icon: Search,
    keywords: 'search find omnibar command palette',
    shortcut: { id: 'system_search', keys: ['meta', 'k'], allowInInput: true },
    // Running it from inside the omnibar is a no-op; it exists so the binding
    // is rebindable and shows up in the shortcuts modal.
    hidden: true,
    // Reveal the omnibar BEFORE focusing it. Focusing while the sidebar is
    // collapsed puts the caret in a zero-width clipped input: nothing appears,
    // and because isFocusedOnInput() then suppresses every binding without
    // allowInInput, it takes n / e / Backspace / ⌘Z down with it until you
    // blur. Same guard openChat and Open braindump already use.
    run: (ctx) => {
      if (ctx.isMobile) {
        // The mobile dock unmounts the omnibar on the Chat tab.
        const nav = useMobileNavStore.getState();
        if (nav.activeTab === 'chat') nav.setActiveTab('today');
      } else {
        useSidebarStore.getState().setLeftSidebarOpen(true);
      }
      useUIStore.getState().focusOmnibar();
    },
  },
  {
    id: 'workspace.selectAll',
    label: 'Select all items',
    description: 'Select every item currently on screen',
    group: 'workspace',
    icon: Rows3,
    keywords: 'select all everything highlight multi',
    // No palette row: "select all" from a palette that then closes reads as a
    // no-op, and the binding is the point. It still lists in the shortcuts modal.
    // No allowInInput, so ⌘A inside a text field stays the browser's select-all.
    shortcut: { id: 'select_all', keys: ['meta', 'a'] },
    hidden: true,
    // DOM order == visual order (no virtualization); dedupes ids across surfaces.
    run: () => useSelectionStore.getState().replace(selectableIdsInDom()),
  },

  /* ── Settings ───────────────────────────────────────────────────────── */
  {
    id: 'settings.darkMode',
    label: 'Toggle dark mode',
    group: 'settings',
    icon: Contrast,
    keywords: 'dark light theme appearance night mode',
    // resolved, not value: inverting 'system' needs to know what is on screen.
    run: (ctx) => ctx.theme.set(ctx.theme.resolved === 'dark' ? 'light' : 'dark'),
  },
  {
    id: 'settings.theme',
    label: 'Set theme',
    group: 'settings',
    icon: Palette,
    keywords: 'theme appearance light dark system auto',
    aliases: ['theme'],
    argument: {
      kind: 'enum',
      placeholder: 'Theme',
      // Flattened so "/dark" is one keystroke and one Enter, not a two-step
      // browse. Flattened options only surface once you have typed, so the
      // resting list is unaffected by the extra three rows.
      flatten: true,
      options: (ctx) =>
        [
          { value: 'light', label: 'Light', icon: Sun, aliases: ['light'] },
          { value: 'dark', label: 'Dark', icon: Moon, aliases: ['dark'] },
          { value: 'system', label: 'System', icon: Contrast, aliases: ['system', 'auto'] },
        ].map((o) => ({ ...o, active: o.value === (ctx.theme.value ?? 'system') })),
    },
    run: (ctx, arg) => ctx.theme.set((arg as 'light' | 'dark' | 'system') ?? 'system'),
  },
  {
    id: 'settings.showCompleted',
    label: 'Toggle completed tasks',
    dynamicLabel: () =>
      planner().showCompletedTasks ? 'Hide completed tasks' : 'Show completed tasks',
    group: 'settings',
    icon: CheckCircle2,
    keywords: 'completed done hide show finished',
    aliases: ['completed'],
    run: () => planner().setShowCompletedTasks(!planner().showCompletedTasks),
  },
  {
    id: 'settings.timeFormat',
    label: 'Toggle 12/24-hour time',
    dynamicLabel: () =>
      planner().timeFormat === '24h' ? 'Use 12-hour time' : 'Use 24-hour time',
    group: 'settings',
    icon: Clock,
    keywords: 'time format 12 24 hour clock am pm military',
    // Neutral token, not '12h'/'24h': this is a toggle, so an alias naming a
    // specific format would flip you to the other one half the time.
    aliases: ['time'],
    run: () => planner().setTimeFormat(planner().timeFormat === '24h' ? '12h' : '24h'),
  },
  {
    id: 'settings.typeface',
    label: 'Toggle typeface',
    dynamicLabel: () => (view().typeMode === 'serif' ? 'Use sans typeface' : 'Use serif typeface'),
    group: 'settings',
    icon: Type,
    keywords: 'font typeface serif sans type appearance',
    aliases: ['font'],
    run: () => view().setTypeMode(view().typeMode === 'serif' ? 'sans' : 'serif'),
  },
  {
    id: 'settings.animations',
    label: 'Toggle animations',
    dynamicLabel: () => (planner().animationsEnabled ? 'Reduce motion' : 'Enable animations'),
    group: 'settings',
    icon: Zap,
    keywords: 'animation motion reduce accessibility transitions',
    aliases: ['motion'],
    run: () => planner().setAnimationsEnabled(!planner().animationsEnabled),
  },
  {
    id: 'settings.morningCheck',
    label: 'Toggle morning task check',
    dynamicLabel: () =>
      useMorningStore.getState().morningCheckEnabled
        ? 'Turn off morning task check'
        : 'Turn on morning task check',
    group: 'settings',
    icon: Sunrise,
    keywords: 'morning check overdue banner ritual',
    run: () => {
      const store = useMorningStore.getState();
      store.setMorningCheckEnabled(!store.morningCheckEnabled);
    },
  },
  {
    id: 'settings.eodReview',
    label: 'Toggle end-of-day review',
    dynamicLabel: () =>
      useEODStore.getState().eodReviewEnabled
        ? 'Turn off end-of-day review'
        : 'Turn on end-of-day review',
    group: 'settings',
    icon: Sunset,
    keywords: 'eod evening review nightly ritual reminder',
    run: () => {
      const store = useEODStore.getState();
      store.setEodReviewEnabled(!store.eodReviewEnabled);
    },
  },

  /* ── History ────────────────────────────────────────────────────────── */
  {
    id: 'history.undo',
    label: 'Undo',
    group: 'history',
    icon: Undo2,
    keywords: 'undo revert back mistake',
    shortcut: { id: 'undo', keys: ['ctrl', 'z'], repeatable: true },
    availableWhen: () => planner().canUndo,
    run: () => planner().undo(),
  },
  {
    id: 'history.redo',
    label: 'Redo',
    group: 'history',
    icon: Redo2,
    keywords: 'redo forward again',
    shortcut: { id: 'redo', keys: ['ctrl', 'shift', 'z'], repeatable: true },
    availableWhen: () => planner().canRedo,
    run: () => planner().redo(),
  },

  /* ── App ────────────────────────────────────────────────────────────── */
  {
    id: 'app.settings',
    label: 'Settings',
    group: 'app',
    icon: Settings,
    keywords: 'settings preferences options account api key',
    shortcut: { id: 'system_settings', keys: ['meta', ','], allowInInput: true },
    run: () => useUIStore.getState().openDialog({ type: 'settings' }),
  },
  {
    id: 'app.categories',
    label: 'Manage projects & groups',
    group: 'app',
    icon: FolderOpen,
    keywords: 'projects groups categories manage folders edit',
    aliases: ['projects', 'groups'],
    run: () => useUIStore.getState().openDialog({ type: 'manage-categories' }),
  },
  {
    id: 'app.shortcuts',
    label: 'Keyboard shortcuts',
    group: 'app',
    icon: Keyboard,
    keywords: 'keyboard shortcuts keys bindings help',
    aliases: ['keys'],
    shortcut: { id: 'system_shortcuts', keys: ['meta', '/'], allowInInput: true },
    run: () => useUIStore.getState().openDialog({ type: 'keyboard-shortcuts' }),
  },
  {
    id: 'app.feedback',
    label: 'Share feedback',
    group: 'app',
    icon: Bug,
    keywords: 'bug report feedback issue feature request',
    aliases: ['bug', 'feedback'],
    shortcut: { id: 'report_bug', keys: ['?'] },
    run: () => useUIStore.getState().openDialog({ type: 'bug-report' }),
  },
];

/**
 * Commands whose shortcut is dispatched by the shell rather than run through
 * the registry, because they need the shell's React state (the hovered item
 * read at keypress time). They carry no palette row — acting on "the item under
 * the mouse" is meaningless once the omnibar has focus — but they own their
 * binding here so the shortcuts modal lists them and rebinding works.
 */
export const SHELL_SHORTCUTS = [
  {
    id: 'edit_hovered',
    label: 'Edit hovered item',
    description: 'Open the edit dialog for the task currently under the mouse',
    keys: ['e'],
  },
  {
    id: 'delete_hovered',
    label: 'Delete hovered item',
    description: 'Delete the task currently under the mouse (shows confirmation)',
    keys: ['backspace'],
  },
] as const;

/* ── dynamic commands ──────────────────────────────────────────────────── */

/**
 * One "Add ‹type›" per hydrated custom item type, so a type you created ten
 * seconds ago is a first-class palette row rather than a tab you have to go
 * find inside the add dialog.
 *
 * Memoised on the identity of the type list: this runs on every keystroke, and
 * a fresh Command object each time would hand the omnibar a new `activeCommand`
 * identity mid-argument.
 */
let cachedTypeDefs: unknown = null;
let cachedTypeCommands: Command[] = [];

const customTypeCommands: CommandProvider = () => {
  // The store's copy, not the item-registry module's, because this must track
  // creates and deletes; hydration into the registry happens on load and CRUD.
  const defs = planner().itemTypes;
  if (defs === cachedTypeDefs) return cachedTypeCommands;

  // Aliases already claimed by a hand-authored command, or by another type.
  const taken = new Set(STATIC_COMMANDS.flatMap((c) => c.aliases ?? []));

  cachedTypeDefs = defs;
  cachedTypeCommands = defs.map((def) => {
    const config = getItemTypeConfig(def.name);
    const noun = config.label.toLowerCase();
    // An alias is a promise that typing it lands in exactly one place, and
    // type names are user input — a type called "review" must not quietly
    // steal /review from the end-of-day ritual.
    const alias = taken.has(def.name) ? undefined : def.name;
    if (alias) taken.add(alias);

    return {
      id: `create.type.${def.name}`,
      label: `Add ${noun}`,
      group: 'create',
      icon: resolveCategoryIcon(def.icon, def.label),
      keywords: `new create ${def.name} ${config.labelPlural.toLowerCase()}`,
      aliases: alias ? [alias] : undefined,
      run: () => openAddDialog(def.name),
    } satisfies Command;
  });
  return cachedTypeCommands;
};

/**
 * Sources of commands that are not known until runtime. Order matters only for
 * ties — provider output is appended after the static list, so a generated row
 * never outranks a hand-authored one at the same score.
 */
const PROVIDERS: CommandProvider[] = [customTypeCommands];

/**
 * The registry as every palette surface sees it. Call this rather than reading
 * STATIC_COMMANDS: the static list is the subset that may own a keyboard
 * shortcut, not the set of commands that exist.
 */
export function resolveCommands(ctx: CommandContext): Command[] {
  const dynamic = PROVIDERS.flatMap((provider) => provider(ctx));
  return dynamic.length === 0 ? STATIC_COMMANDS : [...STATIC_COMMANDS, ...dynamic];
}

export function findCommand(id: string, ctx: CommandContext): Command | undefined {
  return resolveCommands(ctx).find((command) => command.id === id);
}
