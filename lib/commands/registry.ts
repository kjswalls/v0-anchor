import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  CalendarMinus,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
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
  CheckCircle2,
  Clock,
  Type,
  Undo2,
  Wand2,
  Zap,
} from 'lucide-react';
import { addDays, isAfter, parseISO, startOfDay, subDays } from 'date-fns';

import { usePlannerStore } from '../planner-store';
import { useViewStore } from '../view-store';
import { useUIStore, openAddDialog } from '../ui-store';
import { useSidebarStore } from '../sidebar-store';
import { useMobileNavStore } from '../mobile-nav-store';
import { useMorningStore } from '../morning-store';
import { useEODStore } from '../eod-store';
import { useChatStore } from '../chat-store';
import { goToDate, stepScope } from '../nav-commands';
import { resolveCategoryIcon } from '../category-icons';
import {
  CANVAS_GROUP_BY_OPTIONS,
  LAYOUT_OPTIONS,
  TYPE_OPTIONS,
  type CanvasGroupBy,
} from '../view-options';
import type { Command, CommandArgOption } from './types';
import type { TypeFilter, ViewLayout } from '../view-store';

/**
 * Round 1 of the command palette.
 *
 * The organising rule: a command is in here only if it is GLOBAL (needs no
 * target item — there is no selection model yet, see lib/hovered-item.ts for
 * why hover is not one) and VERIFIED (its hook has a live consumer). Anything
 * that needs "this task" waits for the entity-picker argument kind.
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

/* ── the registry ──────────────────────────────────────────────────────── */

export const COMMANDS: Command[] = [
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
    label: 'Show overdue tasks',
    description: 'Reopens the morning check listing anything past its date',
    group: 'goto',
    icon: AlertTriangle,
    keywords: 'overdue late missed morning check behind',
    aliases: ['overdue'],
    // The morning check IS the overdue surface, and it only mounts on desktop
    // (components/shell/desktop-shell.tsx). It also self-destructs on dismissal
    // and never comes back on its own, which is what makes this worth a row.
    hidden: (ctx) => ctx.isMobile,
    // Greyed rather than a no-op: the banner also self-hides when nothing is
    // overdue, so without this the command would silently do nothing on a day
    // you happen to be caught up. Mirrors the visibility test in
    // components/ai/morning-check.tsx.
    availableWhen: () => {
      if (!useMorningStore.getState().morningCheckEnabled) return false;
      const todayStart = startOfDay(new Date());
      return planner().tasks.some(
        (task) =>
          task.status === 'pending' &&
          !!task.startDate &&
          isAfter(todayStart, parseISO(task.startDate))
      );
    },
    run: () => useMorningStore.getState().resetDismissal(),
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

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

export function findCommand(id: string): Command | undefined {
  return BY_ID.get(id);
}

/** Declaration order, used as the matcher's final tie-break. */
export const COMMAND_ORDER = new Map(COMMANDS.map((c, i) => [c.id, i]));
