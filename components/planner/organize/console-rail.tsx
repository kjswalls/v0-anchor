'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Eyebrow } from './primitives';
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

export const CONSOLE_SECTIONS = [
  { id: 'routines', label: 'Routines', group: 'CONTAINERS', eyebrow: 'ROUTINES' },
  { id: 'programs', label: 'Programs', group: null, eyebrow: 'PROGRAMS' },
  // Third in CONTAINERS, and last of the three on purpose: routines and
  // programs answer "is this on today", goals answer "why is any of it here".
  // The daily questions sit above the long one.
  { id: 'goals', label: 'Goals', group: null, eyebrow: 'GOALS' },
  { id: 'projects', label: 'Projects', group: 'LABELS', eyebrow: 'PROJECTS' },
  // Item types sits ABOVE Habit groups (Kirby, 2026-08-11 decision 7). Folding
  // habit groups into routines is a recorded deferral; putting types between
  // them now is free and makes that fold cheap later.
  { id: 'types', label: 'Item types', group: null, eyebrow: 'ITEM TYPES' },
  { id: 'groups', label: 'Habit groups', group: null, eyebrow: 'HABIT GROUPS' },
  // Behind a rule, pinned to the foot, the way a bin is pinned to the foot of a
  // dock. Trash is a lifecycle surface, not a peer of either group.
  { id: 'trash', label: 'Trash', group: 'RULE', eyebrow: 'TRASH' },
] as const satisfies readonly {
  id: ConsoleSection;
  label: string;
  group: string | null;
  eyebrow: string;
}[];

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
export function ConsoleRail() {
  return (
    <TabsPrimitive.List
      aria-label="Sections"
      data-testid="console-rail"
      className="border-border flex w-[180px] shrink-0 flex-col overflow-y-auto border-r p-2"
    >
      {CONSOLE_SECTIONS.map((section) => (
        <RailEntry key={section.id} section={section} />
      ))}
    </TabsPrimitive.List>
  );
}

function RailEntry({ section }: { section: (typeof CONSOLE_SECTIONS)[number] }) {
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
