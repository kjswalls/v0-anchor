'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Eyebrow } from './primitives';
import { EXT_GOALS, EXT_ORGANIZE } from '@/lib/extension-registry';
import { cn } from '@/lib/utils';

/**
 * The Organize console's navigation: a grouped VERTICAL rail, never a tab strip.
 *
 * Built on `TabsPrimitive.Root orientation="vertical"` and that choice is load
 * bearing rather than convenient — it is what keeps
 * `getByRole('tab', { name: 'Routines' })` resolving, which
 * `tests/e2e/programs.spec.ts` drives the manager with. Phase 2's
 * acceptance criterion is that that spec runs
 * UNCHANGED. It also gives roving tabindex and ↑/↓ traversal for free, and
 * `key={section}` remains the remount trick that makes a second open on a
 * different section actually land there.
 *
 * Proven before it was built: `tests/unit/organize-rail.test.tsx`.
 *
 * IMPORTED FROM THE PRIMITIVE, NOT `components/ui/tabs.tsx`. The wrapper's
 * TabsList is `bg-muted inline-flex h-9 w-fit rounded-lg p-[3px]` with `flex-1`
 * triggers — precisely the full-width segmented strip this design exists to get
 * away from, and every one of those classes would have to be nulled anyway.
 */

export type ConsoleSection =
  | 'routines'
  | 'programs'
  | 'goals'
  | 'projects'
  | 'types'
  | 'groups'
  | 'trash';

/**
 * EVERY SECTION NAMES THE EXTENSION IT RIDES — or names none, which is a third
 * answer rather than a missing one.
 *
 * Five of the seven ride the console itself. The other two are the whole reason
 * this is a field instead of a branch in the rail:
 *
 *   GOALS rides EXT_GOALS. This is where a goal is CREATED, so if it rode the
 *     console then switching Goals on with the console off would buy a filter,
 *     a grouping and a page for goals you have no way to make.
 *
 *   TRASH rides NOTHING — `extension: null`, ungatable by construction. It is
 *     the only way back out of a delete (see sections/trash.tsx), and DELETION
 *     IS NOT GATED: items, projects, routines, programs, habit groups and goals
 *     all still delete freely with the console off. Gating only the recovery
 *     half means the app's DEFAULT configuration — both extensions off, which
 *     is what every new account gets — can destroy work with no cross-session
 *     route back. ⌘Z is session-scoped and fifty deep; it is not the answer.
 *     Gating the bin because of the room it happens to stand in is gating by
 *     HOUSING rather than by MEANING, which is the exact mistake "The Weight of
 *     Anchor" exists to correct — and the rail already says so, pinning trash
 *     below a rule as a lifecycle surface rather than a peer of either group.
 *
 * So with both extensions off the console still opens, holding one row: Trash.
 * That is the same shape as the Goals-only case, and both are pinned in
 * tests/unit/extension-gates-organize.test.tsx.
 *
 * Declaring it per-section is the registry bargain the rest of the app makes
 * (lib/item-registry.ts, lib/container-registry.ts): the next gated section is
 * a field, not a code path.
 */
export const CONSOLE_SECTIONS = [
  { id: 'routines', label: 'Routines', group: 'CONTAINERS', eyebrow: 'ROUTINES', extension: EXT_ORGANIZE },
  { id: 'programs', label: 'Programs', group: null, eyebrow: 'PROGRAMS', extension: EXT_ORGANIZE },
  // Third in CONTAINERS, and last of the three on purpose: routines and
  // programs answer "is this on today", goals answer "why is any of it here".
  // The daily questions sit above the long one.
  { id: 'goals', label: 'Goals', group: null, eyebrow: 'GOALS', extension: EXT_GOALS },
  { id: 'projects', label: 'Projects', group: 'LABELS', eyebrow: 'PROJECTS', extension: EXT_ORGANIZE },
  // Item types sits ABOVE Habit groups (Kirby, 2026-08-11 decision 7). Folding
  // habit groups into routines is a recorded deferral; putting types between
  // them now is free and makes that fold cheap later.
  { id: 'types', label: 'Item types', group: null, eyebrow: 'ITEM TYPES', extension: EXT_ORGANIZE },
  { id: 'groups', label: 'Habit groups', group: null, eyebrow: 'HABIT GROUPS', extension: EXT_ORGANIZE },
  // Behind a rule, pinned to the foot, the way a bin is pinned to the foot of a
  // dock. Trash is a lifecycle surface, not a peer of either group — and
  // `extension: null` is that same sentence said to the gate. See the header.
  { id: 'trash', label: 'Trash', group: 'RULE', eyebrow: 'TRASH', extension: null },
] as const satisfies readonly {
  id: ConsoleSection;
  label: string;
  group: string | null;
  eyebrow: string;
  /** The slug this section rides, or `null` for one that may never be gated. */
  extension: string | null;
}[];

export type ConsoleSectionSpec = (typeof CONSOLE_SECTIONS)[number];

/**
 * The sections an account may actually see, given a per-slug predicate.
 *
 * Pure and store-free so the four on/off combinations are one table in a unit
 * test rather than four renders. Order is CONSOLE_SECTIONS' order, so a gated
 * console reads as the full one with rows removed — the rail never reshuffles.
 *
 * A `null` extension is kept unconditionally and is never passed to `isOn` —
 * the predicate is never asked a question about a section that has no switch.
 */
export function consoleSectionsFor(
  isOn: (slug: string) => boolean
): readonly ConsoleSectionSpec[] {
  return CONSOLE_SECTIONS.filter(
    (section) => section.extension === null || isOn(section.extension)
  );
}

/**
 * Which extension one section rides — for the callers that hold a section id
 * and need the SLUG rather than the row (the settings destinations, which
 * redirect to an extension's own pane rather than opening a console that will
 * immediately close).
 *
 * THREE ANSWERS, and the caller has to tell two of them apart:
 *   a slug   — this section rides that extension.
 *   `null`   — a KNOWN section that may never be gated (trash). The caller
 *              proceeds; there is no switch to send anyone to.
 *   fallback — an id the rail does not have (a stale bookmark, a typo'd deep
 *              link) answers EXT_ORGANIZE, the console's own switch, which is
 *              the safe default for anything that claims to be a console
 *              section and is not.
 */
export function consoleSectionExtension(id: string | undefined): string | null {
  const section = CONSOLE_SECTIONS.find((s) => s.id === id);
  return section ? section.extension : EXT_ORGANIZE;
}

export function sectionMeta(id: ConsoleSection) {
  return CONSOLE_SECTIONS.find((s) => s.id === id) ?? CONSOLE_SECTIONS[0];
}

export function isConsoleSection(value: string | undefined): value is ConsoleSection {
  return !!value && CONSOLE_SECTIONS.some((s) => s.id === value);
}

/**
 * The rail itself. Rendered as the TabsList so Radix owns the roving focus;
 * group eyebrows and the Trash rule are wrapped in `role="presentation"` so the
 * tablist's children are all tabs and RovingFocusGroup steps over them.
 */
export function ConsoleRail({ sections }: { sections: readonly ConsoleSectionSpec[] }) {
  return (
    <TabsPrimitive.List
      aria-label="Sections"
      data-testid="console-rail"
      className="border-border flex w-[180px] shrink-0 flex-col overflow-y-auto border-r p-2"
    >
      {sections.map((section) => (
        <RailEntry key={section.id} section={section} />
      ))}
    </TabsPrimitive.List>
  );
}

function RailEntry({ section }: { section: ConsoleSectionSpec }) {
  return (
    <>
      {section.group === 'RULE' ? (
        // mt-auto pins everything from here down to the foot. The margin
        // longhand wins over the rule's own shorthand because it is declared
        // after it in the class list and tailwind-merge keeps both.
        <div role="presentation" className="bg-border mx-[7px] my-2 mt-auto h-px" />
      ) : section.group ? (
        <div role="presentation" className="mt-3 flex h-[22px] items-center px-[7px] first:mt-0">
          <Eyebrow>{section.group}</Eyebrow>
        </div>
      ) : null}

      <TabsPrimitive.Trigger
        value={section.id}
        data-testid="console-rail-row"
        data-section={section.id}
        className={cn(
          'h-[30px] w-full rounded-[5px] px-[7px] text-left text-sm font-medium',
          'text-muted-foreground hover:bg-accent hover:text-foreground',
          // No icon and no count, deliberately. Five near-identical grey glyphs
          // is the clone tell; counts reflow as data loads, put two numeric
          // columns 300px apart in a fight, and — load-bearingly — JOIN THE
          // TAB'S ACCESSIBLE NAME, which would make the e2e role queries depend
          // silently on Playwright's substring matching. Counts live on the list
          // head and the detail meta line.
          'data-[state=active]:bg-[var(--row-selected)] data-[state=active]:text-foreground',
          'focus-visible:outline-ring focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-solid'
        )}
      >
        {section.label}
      </TabsPrimitive.Trigger>
    </>
  );
}
