'use client';

import { useMemo } from 'react';
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  Eye,
  Flag,
  Folder,
  Hash,
  Moon,
  RotateCcw,
  Rows3,
  SlidersHorizontal,
  Target,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import {
  EMPTY_VIEW_FILTERS,
  NO_PRIORITY,
  activeFilterCount,
  type PriorityFilterValue,
  type ViewFilters,
} from '@/lib/filters';
import { NO_CONTAINER, containerRef, namesOfKind } from '@/lib/container-registry';
import { displayGoals } from '@/lib/goals';
import { accentColorForName } from '@/lib/accent-colors';
import { buildScopeRows } from '@/lib/scope-rail';
import { setGateOn } from '@/lib/gate-toggle';
import { toDateStr } from '@/lib/recurrence';
import { CategoryIcon } from '@/lib/category-icons';
import {
  BRAINDUMP_GROUP_BY_OPTIONS,
  CANVAS_GROUP_BY_OPTIONS,
  TYPE_OPTIONS,
  groupBySupport,
  sortByBlockedBy,
  SORT_BY_OPTIONS,
} from '@/lib/view-options';
import type { Goal, GroupBy, Priority } from '@/lib/planner-types';
import type { BraindumpGroupBy, ViewScope } from '@/lib/view-store';
import { cn } from '@/lib/utils';

/**
 * Display — one menu for grouping and filtering, per surface.
 *
 * Replaces `primitives/filter-popover.tsx` and the braindump's character-for-
 * character copy of it. Both were bare `<button>`s inside a Radix `Popover`: no
 * roving focus, no typeahead, no menu semantics, sitting 8px from three real
 * DropdownMenus on the same pill. This is a real menu, so all of that is free.
 *
 * **Structure above the separator, Filter and Show below it.** Above the line
 * nothing can make an item disappear; below it everything can. One separator
 * buys a safety affordance that costs nothing to teach.
 *
 * Both Structure rows follow one rule: they always render, and individual VALUES
 * disable themselves with the reason on the rail where the current view cannot
 * honour them. Hiding the row instead strands the clause — nothing clears
 * `canvasGroupBy` or `canvasSortBy` on a scope or layout change, so the trigger
 * would keep counting something with no row to account for it.
 */

export type DisplaySurface = 'canvas' | 'braindump';

/* ── the row idiom ──────────────────────────────────────────────────────────
 *
 * 32px rows at 12px. Today's filter rows are 11px at 23px — the smallest type
 * and tightest rows anywhere in Anchor, in the panel holding the most control
 * types. shadcn's own item is `py-1.5 text-sm`, hence the overrides.
 */
const ROW = 'h-8 gap-2 rounded-[5px] px-2 text-xs';
const CAP = 'px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground';
/** 240px. Today's popover is 208px, the narrowest menu in the app. */
const PANEL = 'w-60 rounded-[10px] p-1 shadow-[var(--shadow-elev-md)]';

function Cap({ children }: { children: React.ReactNode }) {
  return <div className={CAP}>{children}</div>;
}

/**
 * Selection is a TRAILING check at inherited colour, matching ChipOption and
 * CollectRow. Radix's own DropdownMenuCheckboxItem/RadioItem put their indicator
 * on the left (`pl-8`, `absolute left-2`) against that house grammar, which is
 * why this uses plain items with an explicit role and aria-checked instead.
 *
 * Not `text-primary-foreground`: that is --lime-ink, dark-green ink meant to sit
 * ON a lime fill, and it is very nearly invisible on the popover ground. See the
 * same bug at header-capsule.tsx:75.
 */
function Tick({ on }: { on: boolean }) {
  return on ? <Check className="size-3.5" /> : null;
}

/** 8px dot in the real priority token, or a hollow ring for "no priority". */
function PriorityDot({ value }: { value: PriorityFilterValue }) {
  if (value === NO_PRIORITY) {
    return (
      <span className="size-2 shrink-0 rounded-full border border-muted-foreground/55" aria-hidden="true" />
    );
  }
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ background: `var(--priority-${value})` }}
      aria-hidden="true"
    />
  );
}

/**
 * Colour is quarantined to a glyph, never a fill — a 9px rounded square in the
 * container's own colour. The lime budget is exactly one mark per surface (the
 * trigger dot), so a lime-filled selected chip like today's is out.
 */
function ContainerSquare({ color }: { color: string }) {
  return (
    <span
      className="size-[9px] shrink-0 rounded-[3px]"
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

/** A value row inside a submenu. Multi-select rows keep the menu open. */
function ValueRow({
  label,
  checked,
  onToggle,
  keepOpen,
  leading,
  icon: Icon,
  rail,
  disabled,
  role,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  keepOpen: boolean;
  leading?: React.ReactNode;
  icon?: LucideIcon;
  rail?: string;
  disabled?: boolean;
  /**
   * Overrides the checkbox/radio default for rows that are ACTIONS rather than
   * values — "Switch to List" sits among the grouping options but selects
   * nothing, and deriving its role from close-behaviour announced it to a screen
   * reader as a sixth, unselected radio option in the set.
   */
  role?: 'menuitem';
}) {
  const resolvedRole = role ?? (keepOpen ? 'menuitemcheckbox' : 'menuitemradio');
  return (
    <DropdownMenuItem
      className={cn(ROW, checked && 'font-semibold')}
      role={resolvedRole}
      aria-checked={resolvedRole === 'menuitem' ? undefined : checked}
      disabled={disabled}
      onSelect={(e) => {
        // Multi-select stays open so a three-project selection is three clicks,
        // not three re-opens. Single-select closes — the choice is complete.
        if (keepOpen) e.preventDefault();
        if (!disabled) onToggle();
      }}
    >
      {leading}
      {Icon && <Icon className="size-4" />}
      <span className="flex-1 truncate">{label}</span>
      {rail && <span className="shrink-0 text-[11px] text-muted-foreground">{rail}</span>}
      <Tick on={checked} />
    </DropdownMenuItem>
  );
}

/**
 * A top-level row that opens a submenu, with the current value on its rail.
 *
 * shadcn's SubTrigger appends its own `ChevronRightIcon` with `ml-auto`, so the
 * label takes `flex-1` and the rail lands between them.
 */
function SubRow({
  icon: Icon,
  label,
  rail,
  set,
  children,
  width = PANEL,
}: {
  icon: LucideIcon;
  label: string;
  rail: string;
  set: boolean;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={cn(ROW, '[&>svg:last-child]:size-3.5')}>
        <Icon className="size-4" />
        <span className={cn('flex-1 truncate', set && 'font-semibold')}>{label}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{rail}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={cn(width, 'shadow-[var(--shadow-elev-md)]')}>
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/* ── the menu ───────────────────────────────────────────────────────────────*/

export function DisplayMenu({
  surface,
  trigger = 'label',
  align = 'end',
  scope: scopeProp,
}: {
  surface: DisplaySurface;
  /** Labelled pill for the canvas capsule; 24px icon for the braindump header. */
  trigger?: 'label' | 'icon';
  align?: 'start' | 'end';
  /**
   * The scope the MOUNTING SHELL actually renders by, when that is not the
   * store's.
   *
   * Mobile is day-only by construction: MobileViewRouter reads `layout` and
   * hardcodes `data-view-scope="day"` (mobile-view-router.tsx:34), and the
   * palette hides both scope commands there for the same reason
   * (commands/registry.ts:623-626). So the phone states its scope rather than
   * inheriting a preference it never renders by — a stale `scope: 'week'` in the
   * persisted blob would otherwise report Grouping as unavailable on a surface
   * that honours it, with nothing on that surface able to correct it.
   */
  scope?: ViewScope;
}) {
  const projects = usePlannerStore((s) => s.projects);
  const habitGroups = usePlannerStore((s) => s.habitGroups);
  const getProjectColor = usePlannerStore((s) => s.getProjectColor);
  const getHabitGroupColor = usePlannerStore((s) => s.getHabitGroupColor);
  const showPausedOnGrid = usePlannerStore((s) => s.showPausedOnGrid);
  const setShowPausedOnGrid = usePlannerStore((s) => s.setShowPausedOnGrid);
  const goals = usePlannerStore((s) => s.goals);
  const goalsAvailable = usePlannerStore((s) => s.goalsAvailable);

  const view = useViewStore();
  const isCanvas = surface === 'canvas';

  const filters = isCanvas ? view.canvasFilters : view.braindumpFilters;
  const setFilters = isCanvas ? view.setCanvasFilters : view.setBraindumpFilters;
  const groupBy: string = isCanvas ? view.canvasGroupBy : view.braindumpGroupBy;

  const patch = (next: Partial<ViewFilters>) => setFilters({ ...filters, ...next });

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  /* ── what is set ──────────────────────────────────────────────────────── */

  const selectedProjects = namesOfKind(filters.containers, 'project');
  const selectedGroups = namesOfKind(filters.containers, 'group');

  /**
   * The Goal clause's rows, described as DATA before anything draws them.
   *
   * ACTIVE goals (lib/goals.ts `displayGoals`), plus any SELECTED goal that is
   * no longer active. The second half is not tidiness: a goal marked achieved
   * while it was filtering leaves the active list, and without a row for it the
   * clause is set, counted by the trigger, and untickable from the panel that
   * set it — the "hiding the row strands the clause" rule this menu already
   * follows for Grouping. (The clause degrades to inert in that state rather
   * than emptying the surface; see `goalFilterItemIds`.)
   *
   * Ids, not names: goal names are not unique and rename shipped with the
   * feature, which is why the container ref grammar excludes goals outright.
   */
  const goalRows = [
    ...displayGoals(goals),
    ...goals.filter((g) => filters.goals.includes(g.id) && g.state !== 'active'),
  ].map((goal: Goal) => ({
    key: goal.id,
    label: goal.name,
    leading: <ContainerSquare color={goal.color ?? accentColorForName(goal.name)} />,
    checked: filters.goals.includes(goal.id),
    keepOpen: true,
    onToggle: () => patch({ goals: toggle(filters.goals, goal.id) }),
  }));

  /**
   * The count behind the trigger dot and the Reset badge.
   *
   * Grouping and the type filter are IN it. Today's braindump counts grouping
   * for the dot but its "Clear filters" resets neither — so the dot stays lit
   * after clearing, with no way to put it out from the panel that lit it.
   */
  const typeSet = isCanvas && view.typeFilter !== 'all';
  const groupSet = groupBy !== 'none';
  const sortSet = (isCanvas ? view.canvasSortBy : view.braindumpSortBy) !== 'default';
  const activeCount =
    activeFilterCount(filters) + (groupSet ? 1 : 0) + (sortSet ? 1 : 0) + (typeSet ? 1 : 0);

  /**
   * Reset clears everything this menu OWNS for this surface. `showPausedOnGrid`
   * is deliberately excluded and captioned "Everywhere" for the same reason —
   * it is an app-wide setting that happens to be reachable here, not a display
   * preference of this surface, and resetting one surface must not silently
   * change what the other five show.
   */
  const reset = () => {
    setFilters(EMPTY_VIEW_FILTERS);
    if (isCanvas) {
      view.setCanvasGroupBy('none');
      view.setCanvasSortBy('default');
      view.setTypeFilter('all');
    } else {
      view.setBraindumpGroupBy('none');
      view.setBraindumpSortBy('default');
    }
  };

  /* ── grouping ─────────────────────────────────────────────────────────── */

  const scope = scopeProp ?? view.scope;

  /**
   * The Grouping row ALWAYS renders on the canvas; individual values disable
   * themselves where the current view cannot honour them.
   *
   * It used to hide the whole section on Schedule and Week, which had two
   * failures. Neither `setScope` nor `setLayout` clears `canvasGroupBy`
   * (view-store.ts:154-167), so grouping on Day × List and then switching to
   * Schedule left the trigger counting a clause with no row to account for it —
   * "Display (1 active)" over a panel where nothing is set. And a menu whose
   * sections appear and vanish as you switch layouts is harder to learn than one
   * whose rows explain themselves, which is the grammar this menu already uses
   * for values inside Buckets.
   */
  const groupOptions = isCanvas ? CANVAS_GROUP_BY_OPTIONS : BRAINDUMP_GROUP_BY_OPTIONS;
  const groupLabel = groupOptions.find((o) => o.value === groupBy)?.label ?? 'None';
  /** How far the CURRENT value reaches on this surface — see groupBySupport. */
  const groupReach = isCanvas
    ? groupBySupport(scope, view.layout, groupBy as GroupBy)
    : { honoured: true, note: null };

  const sortBy = isCanvas ? view.canvasSortBy : view.braindumpSortBy;
  const sortLabel = SORT_BY_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Default';
  const sortBlocked = isCanvas ? sortByBlockedBy(view.layout, sortBy) : null;

  /* ── trigger ──────────────────────────────────────────────────────────── */

  const dot = activeCount > 0 && (
    // No transition. `transition-opacity` on the wrapper would fade lime, and
    // lime never fades — it is the one mark this surface is allowed.
    <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />
  );

  const ariaLabel = activeCount > 0 ? `Display (${activeCount} active)` : 'Display';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === 'label' ? (
          <button
            aria-label={ariaLabel}
            data-testid={`display-trigger-${surface}`}
            data-active={activeCount > 0 ? 'true' : 'false'}
            className={cn(
              'relative inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent',
              activeCount > 0 && 'bg-accent/60'
            )}
          >
            <SlidersHorizontal className="size-4" />
            Display
            <ChevronDown className="size-3.5 text-muted-foreground" />
            {dot}
          </button>
        ) : (
          <button
            aria-label={ariaLabel}
            data-testid={`display-trigger-${surface}`}
            data-active={activeCount > 0 ? 'true' : 'false'}
            className={cn(
              'relative inline-flex size-6 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              activeCount > 0 && 'text-foreground'
            )}
          >
            <SlidersHorizontal className="size-4" />
            {dot}
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className={PANEL} data-testid="display-menu">
        <Cap>Structure</Cap>
        <SubRow
          icon={Rows3}
          label="Grouping"
          // The rail carries the note whether the value is partly honoured or
          // not at all, so the row always accounts for the clause the trigger is
          // counting.
          rail={groupReach.note ? `${groupLabel} · ${groupReach.note}` : groupLabel}
          set={groupSet}
        >
          {groupOptions.map((o) => {
            // Three states: honoured silently, honoured with the part it reaches
            // on the rail, or inert — visible and disabled with the reason.
            const reach = isCanvas
              ? groupBySupport(scope, view.layout, o.value as GroupBy)
              : { honoured: true, note: null };
            return (
              <ValueRow
                key={o.value}
                icon={o.icon}
                label={o.label}
                rail={reach.note ?? undefined}
                disabled={!reach.honoured}
                checked={groupBy === o.value}
                keepOpen={false}
                onToggle={() =>
                  isCanvas
                    ? view.setCanvasGroupBy(o.value as GroupBy)
                    : view.setBraindumpGroupBy(o.value as BraindumpGroupBy)
                }
              />
            );
          })}
          {/* The escape hatch, offered only while the CURRENT value is inert —
              which since Phase 5a is one combination, Time bucket on Buckets.
              It used to ride every non-List layout, i.e. most of the time, where
              it resolved nothing because nothing was blocked. */}
          {isCanvas && !groupReach.honoured && view.layout !== 'list' && (
            <>
              <DropdownMenuSeparator />
              <ValueRow
                icon={ArrowRight}
                label="Switch to List"
                checked={false}
                keepOpen={false}
                role="menuitem"
                onToggle={() => view.setLayout('list')}
              />
            </>
          )}
        </SubRow>

        <SubRow
          icon={ArrowUpDown}
          label="Ordering"
          rail={sortBlocked ? `${sortLabel} · ${sortBlocked}` : sortLabel}
          set={sortSet}
        >
          {SORT_BY_OPTIONS.map((o) => {
            const blocked = isCanvas ? sortByBlockedBy(view.layout, o.value) : null;
            return (
              <ValueRow
                key={o.value}
                icon={o.icon}
                label={o.label}
                rail={blocked ?? undefined}
                disabled={!!blocked}
                checked={sortBy === o.value}
                keepOpen={false}
                onToggle={() =>
                  isCanvas ? view.setCanvasSortBy(o.value) : view.setBraindumpSortBy(o.value)
                }
              />
            );
          })}
          {isCanvas && view.layout !== 'list' && (
            <>
              <DropdownMenuSeparator />
              <ValueRow
                icon={ArrowRight}
                label="Switch to List"
                checked={false}
                keepOpen={false}
                role="menuitem"
                onToggle={() => view.setLayout('list')}
              />
            </>
          )}
        </SubRow>
        <DropdownMenuSeparator />

        <Cap>Filter</Cap>

        {/* Type is canvas-only: the braindump's corpus is single-type today, and
            grouping by Type already answers "what is in here" at that size. */}
        {isCanvas && (
          <SubRow
            icon={Hash}
            label="Type"
            rail={TYPE_OPTIONS.find((o) => o.value === view.typeFilter)?.label ?? 'All'}
            set={typeSet}
          >
            {TYPE_OPTIONS.map((o) => (
              <ValueRow
                key={o.value}
                icon={o.icon}
                label={o.label}
                checked={view.typeFilter === o.value}
                keepOpen={false}
                onToggle={() => view.setTypeFilter(o.value)}
              />
            ))}
          </SubRow>
        )}

        <SubRow
          icon={Flag}
          label="Priority"
          rail={priorityRail(filters.priorities)}
          set={filters.priorities.length > 0}
          width="w-56"
        >
          {(['high', 'medium', 'low'] as Priority[]).map((p) => (
            <ValueRow
              key={p}
              leading={<PriorityDot value={p} />}
              label={p[0].toUpperCase() + p.slice(1)}
              checked={filters.priorities.includes(p)}
              keepOpen
              onToggle={() => patch({ priorities: toggle(filters.priorities, p) })}
            />
          ))}
          <DropdownMenuSeparator />
          {/* An item carrying the field with the value UNSET belongs in an
              explicit value, not in oblivion. Most items have no priority. */}
          <ValueRow
            leading={<PriorityDot value={NO_PRIORITY} />}
            label="No priority"
            checked={filters.priorities.includes(NO_PRIORITY)}
            keepOpen
            onToggle={() => patch({ priorities: toggle(filters.priorities, NO_PRIORITY) })}
          />
          <div className="px-2 pb-1.5 pt-2 text-[11px] leading-snug text-muted-foreground">
            Habits carry no priority — they are unaffected.
          </div>
        </SubRow>

        <SubRow
          icon={Folder}
          label="Project / Group"
          rail={containerRail(filters.containers)}
          set={filters.containers.length > 0}
        >
          {/* One axis, two namespaces. A habit is not container-less: it answers
              with its GROUP. Values are stored prefixed so a project and a habit
              group sharing a name cannot collide — and the seeds do collide,
              DEFAULT_PROJECTS and DEFAULT_HABIT_GROUPS both ship Work. */}
          <div className="max-h-64 overflow-y-auto">
            {projects.length > 0 && (
              <>
                <Cap>Projects</Cap>
                {projects.map((p) => {
                  const ref = containerRef('project', p.name);
                  return (
                    <ValueRow
                      key={ref}
                      leading={<ContainerSquare color={getProjectColor(p.name)} />}
                      label={p.name}
                      checked={selectedProjects.includes(p.name)}
                      keepOpen
                      onToggle={() => patch({ containers: toggle(filters.containers, ref) })}
                    />
                  );
                })}
              </>
            )}
            {habitGroups.length > 0 && (
              <>
                {projects.length > 0 && <DropdownMenuSeparator />}
                <Cap>Habit groups</Cap>
                {habitGroups.map((g) => {
                  const ref = containerRef('group', g.name);
                  return (
                    <ValueRow
                      key={ref}
                      leading={<ContainerSquare color={getHabitGroupColor(g.name)} />}
                      label={g.name}
                      checked={selectedGroups.some(
                        (n) => n.toLowerCase() === g.name.toLowerCase()
                      )}
                      keepOpen
                      onToggle={() => patch({ containers: toggle(filters.containers, ref) })}
                    />
                  );
                })}
              </>
            )}
            <DropdownMenuSeparator />
            {/* itemFromRow maps `group: row.group ?? ''` (db.ts:108), so unset is
                a real reachable value on both sides of the axis. */}
            <ValueRow
              leading={<PriorityDot value={NO_PRIORITY} />}
              label="No project or group"
              checked={filters.containers.includes(NO_CONTAINER)}
              keepOpen
              onToggle={() => patch({ containers: toggle(filters.containers, NO_CONTAINER) })}
            />
          </div>
        </SubRow>

        {/* GOAL — the aspire axis, and the one filter here that is not a
            partition. An item can serve three goals at once, so this narrows by
            MEMBERSHIP rather than by an answer the item carries: every selected
            goal's members, milestones and check-ins, unioned.

            No "No goal" value, unlike Project / Group. The classify axis has an
            unset state (an item carries `project`, possibly empty); the aspire
            axis has none — `unsetLabel` is null in the container registry
            because an item serves a goal or it does not — and a checkbox for
            "everything that serves nothing" is a different question from the
            one this section asks. Grouping still mints a loose "No goal"
            section, because grouping may never drop a row.

            Gated on `goalsAvailable`, not on `goals.length`: the flag is the
            table-unreachable signal, and the item dialog's chip renders from
            zero for a reason this section does not share — it is a DOOR to the
            manager, and a filter is not. With zero goals the panel says so. */}
        {goalsAvailable && (
          <SubRow
            icon={Target}
            label="Goal"
            rail={goalRail(filters.goals, goals)}
            set={filters.goals.length > 0}
          >
            <div className="max-h-64 overflow-y-auto">
              {goalRows.map((row) => (
                <ValueRow
                  key={row.key}
                  leading={row.leading}
                  label={row.label}
                  checked={row.checked}
                  keepOpen={row.keepOpen}
                  onToggle={row.onToggle}
                />
              ))}
              <div className="px-2 pb-1.5 pt-2 text-[11px] leading-snug text-muted-foreground">
                {goalRows.length === 0
                  ? 'No goals yet — make one in Organize.'
                  : 'Milestones and check-ins count as members.'}
              </div>
            </div>
          </SubRow>
        )}

        <Cap>Show</Cap>
        <ValueRow
          icon={Eye}
          label="Hide finished"
          checked={filters.hideFinished}
          keepOpen
          onToggle={() => patch({ hideFinished: !filters.hideFinished })}
        />

        {/* Captioned "Everywhere" because it is exactly that: a planner-store
            setting every canvas surface reads, not a preference of this one. */}
        {isCanvas && (
          <>
            <Cap>Everywhere</Cap>
            <ValueRow
              icon={Moon}
              label="Show paused"
              checked={showPausedOnGrid}
              keepOpen
              onToggle={() => setShowPausedOnGrid(!showPausedOnGrid)}
            />
          </>
        )}

        <PausedScopesSection />

        <DropdownMenuSeparator />
        {/* Permanently mounted, disabled when nothing is set. That is what stops
            the panel jumping height, which today's conditionally-mounted "Clear
            filters" does on the first tick — and it is a view preference, so it
            loses the destructive red styling with it. */}
        <DropdownMenuItem
          className={cn(ROW, 'text-muted-foreground')}
          disabled={activeCount === 0}
          onSelect={() => reset()}
          data-testid="display-reset"
        >
          <RotateCcw className="size-4" />
          <span className="flex-1">Reset display</span>
          {activeCount > 0 && (
            <span className="shrink-0 font-mono text-[10.5px] tabular-nums">{activeCount}</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The recovery half of "group by scope, flip the header": the scopes that are
 * OFF right now, each one click from back on.
 *
 * A gate container's home when it has no visible members — a fully-paused
 * routine, or an out-of-season program, produces no group header to switch, so
 * without this list it would only be reachable from the Organize console. Shown
 * on BOTH surfaces because pausing is app-wide DB state, and hidden entirely
 * when nothing is off.
 *
 * "Off" means the container's OWN switch is off (`!localOn`): a routine a program
 * is merely holding down keeps its own switch on and is not listed here — the
 * blocking PROGRAM is, and turning it on brings the routine back. Mounted inside
 * the menu content, so buildScopeRows only runs while the menu is open.
 */
function PausedScopesSection() {
  const routines = usePlannerStore((s) => s.routines);
  const programs = usePlannerStore((s) => s.programs);
  const userTimezone = usePlannerStore((s) => s.userTimezone);

  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Resolved at today and used as a memo key — pausing is dateless, and a menu
  // opened after midnight must offer the resume that is true now.
  const todayStr = toDateStr(new Date(), tz);
  const offRows = useMemo(
    () => buildScopeRows(routines, programs, todayStr, tz).filter((row) => !row.localOn),
    [routines, programs, todayStr, tz]
  );

  if (offRows.length === 0) return null;

  return (
    <>
      <Cap>Paused scopes</Cap>
      {offRows.map((row) => (
        <ValueRow
          key={`${row.kind}:${row.id}`}
          leading={
            <CategoryIcon
              glyph={row.icon}
              name={row.name}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          }
          label={row.name}
          // The rail's own line — "back Sep 8", "you turned it off", "ended Jul 31".
          rail={row.state}
          // An ACTION, not a value: role=menuitem so a screen reader announces
          // "turn on <name>" rather than a check box that can never read checked
          // (turning it on drops the row from the !localOn list). keepOpen keeps
          // the menu up so a POINTER user can bring several back without reopening
          // — keyboard focus still resets as each row unmounts, so it is not a
          // keyboard "several in a row" affordance.
          checked={false}
          role="menuitem"
          keepOpen
          onToggle={() => setGateOn(row.kind, row.id, true)}
        />
      ))}
    </>
  );
}

/** "Any" · the single value's name · the count. */
function priorityRail(values: PriorityFilterValue[]): string {
  if (values.length === 0) return 'Any';
  if (values.length === 1) {
    const v = values[0];
    return v === NO_PRIORITY ? 'None' : v[0].toUpperCase() + v.slice(1);
  }
  return String(values.length);
}

/**
 * "Any" · the single goal's NAME · the count.
 *
 * Resolved against the store because the clause holds ids. A selected id that
 * names no goal at all (deleted out from under the filter) falls back to the
 * count, which is the honest answer — the rail cannot name what is gone, and
 * Reset display is the way out.
 */
function goalRail(ids: string[], goals: readonly Goal[]): string {
  if (ids.length === 0) return 'Any';
  if (ids.length === 1) return goals.find((g) => g.id === ids[0])?.name ?? '1';
  return String(ids.length);
}

function containerRail(values: string[]): string {
  if (values.length === 0) return 'Any';
  if (values.length === 1) {
    const v = values[0];
    return v === NO_CONTAINER ? 'None' : v.slice(v.indexOf(':') + 1);
  }
  return String(values.length);
}
