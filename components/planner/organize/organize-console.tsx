'use client';

import { useCallback, useState } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { X } from 'lucide-react';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
} from '@/components/ui/responsive-modal';
import {
  CONSOLE_SECTIONS,
  ConsoleRail,
  isConsoleSection,
  sectionMeta,
  type ConsoleSection,
} from './console-rail';
import { KeyCap } from './primitives';
import { useEscapeLadder } from './escape-ladder';
import { RoutinesSection } from './sections/routines';
import { ProgramsSection } from './sections/programs';
import { GoalsSection } from './sections/goals';
import { GroupsSection, ProjectsSection, TypesSection } from './sections/labels';
import { TrashSection } from './sections/trash';
import { cn } from '@/lib/utils';

/**
 * ORGANIZE — one console for every container and label.
 *
 * Replaces ManageCollectionsDialog (680px) and ManageCategoriesDialog (400px).
 * The full rationale, the three rejected container directions and the adversarial
 * verdicts are in memory/plans/organize-console.md; only the load-bearing
 * mechanics are repeated here.
 *
 * WHY A MODAL, given Settings became a route. Frequency. Every journey reviewer
 * independently found the same thing: this is a PERIODIC surface — under thirty
 * objects, one person, opened monthly. The modal keeps four things a route
 * forfeits: the vaul bottom sheet for free (which ManageCategoriesDialog never
 * had — it is a 400px centred box on a phone today), both e2e `closeManager`
 * helpers unchanged, focus trap and focus-return, and AppShell's services —
 * DndContext, the undo toast, and ⌘Z, which every delete confirm's copy now
 * explicitly promises.
 *
 * The console body is deliberately a COMPONENT rather than a dialog body, so
 * adding `/organize` later is an additive PR that renders this same tree rather
 * than a rebuild. Buy the URL when the URL is wanted.
 *
 * GEOMETRY — 938 × 640, fixed aspect, sized from the columns up:
 *   rail 180 | 1px | list 300 | 1px | detail 456   = 938
 *   header 48 + body 560 + footer 32               = 640
 * It needs a 1002×720 viewport, so it fits 1280×800 with 278×80 to spare. Fixed
 * is the point: the frame never resizes on a section change, which is the
 * loudest un-premium tell in both dialogs it replaces.
 *
 * GROUND — every pane sits on `bg-modal`. There is NO background step anywhere
 * inside the plate; depth is the hairline, full stop. A rail on `--surface-1`
 * over `--modal` is a 0.6% step in light (invisible) and a 3.2-point step in
 * dark, and the obvious fix inverts because `--surface-3` is LIGHTER than
 * `--modal` in dark. Removing the step removes the per-theme problem entirely.
 */

export interface OrganizeConsoleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Section to land on. Unknown values fall back to routines. */
  section?: string;
  /** Select this object on arrival and scroll its row into view. */
  focusId?: string;
  /** Focus the create row's name input on arrival (the "New routine or program" entry). */
  focusNew?: boolean;
}

export function OrganizeConsole({
  open,
  onOpenChange,
  section,
  focusId,
  focusNew,
}: OrganizeConsoleProps) {
  const initial: ConsoleSection = isConsoleSection(section) ? section : 'routines';
  const [active, setActive] = useState<ConsoleSection>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);

  /**
   * `focusNew` is an ARRIVAL, and has to be latched to behave like one.
   *
   * Radix unmounts an inactive tabpanel's children, so leaving the opening
   * section and coming back remounts the create row — and React's `autoFocus`
   * is a mount effect, so a prop-derived flag would fire again and rip focus out
   * of the rail the user was arrowing through. Spent on the first section
   * change, re-armed by a fresh open.
   */
  const [pendingNew, setPendingNew] = useState(!!focusNew);

  /**
   * Reopening lands on what the CALLER asked for, not on wherever the last visit
   * ended — the console stays mounted between opens, so neither piece of state
   * resets on its own. Deliberately NOT a last-used-section memory: at monthly
   * frequency a remembered destination is a coin flip rather than a convenience,
   * and it makes the braindump door unlearnable.
   *
   * Adjusted during render rather than in an effect. This is React's documented
   * "adjusting state when a prop changes" pattern, and it is the correct one
   * here: an effect would paint one frame of the PREVIOUS section before
   * correcting itself, which on a deep link is a visible flash of the wrong
   * list. React re-runs this component immediately, before touching the DOM or
   * any child.
   */
  const request = `${open ? 'open' : 'shut'}:${initial}:${focusId ?? ''}`;
  const [lastRequest, setLastRequest] = useState(request);
  if (request !== lastRequest) {
    setLastRequest(request);
    if (open) {
      setActive(initial);
      setSelectedId(focusId ?? null);
      setPendingNew(!!focusNew);
    }
  }

  const { register, consume, Ladder } = useEscapeLadder();

  const onSectionChange = useCallback((next: string) => {
    if (!isConsoleSection(next)) return;
    setActive(next);
    // Selection is per-section and does not survive a switch: one shared id
    // would open whatever row happened to share an index, which reads as the
    // console losing its place.
    setSelectedId(null);
    // The only route back into the opening section is another section change,
    // so spending the latch here is enough.
    setPendingNew(false);
  }, []);

  /**
   * A section change that KEEPS a selection, which `onSectionChange` deliberately
   * does not.
   *
   * Clearing the selection is right for the rail, where a section change means
   * "show me the projects" and carrying an id across would open whatever row
   * shared an index. Here the id is the entire point of the move: the routine
   * detail's reverse view is naming a specific program, and landing on the
   * Programs list with nothing selected would make the user find it again.
   *
   * Not routed through `onValueChange` — that would clear the id on the way past.
   */
  const onNavigate = useCallback((next: ConsoleSection, id: string) => {
    setActive(next);
    setSelectedId(id);
    setPendingNew(false);
  }, []);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent
        showCloseButton={false}
        data-testid="organize-console"
        // Claims the bare-key space. Console list rows are <button>s, so without
        // this every single-letter global still fires from a focused row — `n`
        // would open the add dialog and replace this console in the single
        // ActiveDialog slot. See hooks/use-command-shortcuts.ts.
        data-keys-local="true"
        onKeyDown={focusFilterOnSlash}
        // Radix decides on Escape from a CAPTURE listener on the document, so
        // this prop is the only place a rung can get in front of it. See
        // escape-ladder.tsx.
        onEscapeKeyDown={(event) => {
          if (consume()) event.preventDefault();
        }}
        className={cn(
          // The stock DialogContent base is `grid gap-4 rounded-lg border p-6
          // shadow-lg duration-200 zoom-95 max-w-[calc(100%-2rem)] sm:max-w-lg`
          // and every one of those fights a number below. zoom-95 on a 938px
          // plate is a 47px lurch.
          'flex flex-col gap-0 overflow-hidden p-0',
          'w-[min(938px,calc(100vw-64px))] max-w-none sm:max-w-none',
          'h-[min(640px,calc(100vh-80px))]',
          'bg-modal border-border rounded-[20px] border',
          'shadow-[var(--shadow-elev-plate)]',
          'duration-150 data-[state=open]:zoom-in-[0.98] data-[state=closed]:zoom-out-[0.98]'
        )}
      >
        <ResponsiveModalHeader className="border-border h-12 shrink-0 flex-row items-center gap-0 space-y-0 border-b px-4">
          <ResponsiveModalTitle className="text-foreground flex-1 text-base leading-5 font-semibold">
            Organize
          </ResponsiveModalTitle>
          <ResponsiveModalDescription className="sr-only">
            Your routines, programs, projects, item types and habit groups — and anything
            you&apos;ve deleted in the last 30 days.
          </ResponsiveModalDescription>
          {/* Ours, on the header band's baseline, rather than the stock close
              floating over the rail. */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            data-testid="organize-close"
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-ring flex h-6 w-6 items-center justify-center rounded-[5px] focus-visible:outline-1 focus-visible:outline-solid"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </ResponsiveModalHeader>

        {/* Keyed on the incoming section so a second open with a different one
            actually lands there — Radix `defaultValue` only applies once, and
            this console stays mounted. The manage-categories precedent. */}
        <Ladder value={register}>
        <TabsPrimitive.Root
          key={initial}
          value={active}
          onValueChange={onSectionChange}
          orientation="vertical"
          className="flex min-h-0 flex-1"
        >
          <ConsoleRail />

          {CONSOLE_SECTIONS.map((s) => (
            <TabsPrimitive.Content
              key={s.id}
              value={s.id}
              // A tabpanel that is the flex row itself, so the list and detail
              // columns are its children rather than nested one level deeper.
              className="flex min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <SectionBody
                section={s.id}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onNavigate={onNavigate}
                focusNew={pendingNew && s.id === initial}
              />
            </TabsPrimitive.Content>
          ))}
        </TabsPrimitive.Root>
        </Ladder>

        <FooterBar section={active} selectedId={selectedId} />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

/**
 * `/` and ⌘F put the cursor in the current section's filter.
 *
 * Scoped to `[data-state="active"]`. Radix does not mount an inactive panel's
 * children, so there is only ever one filter field in the document today — but
 * the scope costs nothing and is what keeps this correct if a later change adds
 * `forceMount` to preserve section scroll. See escape-ladder.tsx.
 *
 * `/` is claimed only when the press is NOT already in a text field. Without
 * that guard, typing a slash into the filter — or into any name input on the
 * plate — would silently jump the cursor somewhere else instead of typing.
 * ⌘F takes the browser's find bar, which is the right trade inside a console
 * whose whole job is finding one of thirty objects.
 */
function focusFilterOnSlash(event: React.KeyboardEvent<HTMLDivElement>) {
  const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
  const find = event.key.toLowerCase() === 'f' && (event.metaKey || event.ctrlKey);
  if (!slash && !find) return;

  const target = event.target as HTMLElement | null;
  const typing =
    !!target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable);
  if (slash && typing) return;

  const field = event.currentTarget.querySelector<HTMLInputElement>(
    '[data-state="active"] [data-organize-filter]'
  );
  if (!field) return;
  event.preventDefault();
  field.focus();
  field.select();
}

/**
 * One section's list + detail pair.
 *
 * Each section owns both columns rather than being handed slots, because what
 * goes in the detail is entirely section-specific and a slot API would just be
 * two props threading the same state back out again. The shared geometry lives
 * in ListColumn / DetailColumn so no section can drift.
 */
function SectionBody({
  section,
  selectedId,
  onSelect,
  onNavigate,
  focusNew,
}: {
  section: ConsoleSection;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Jump to another section AND select something in it. See ProgramHolders. */
  onNavigate: (section: ConsoleSection, id: string) => void;
  focusNew: boolean;
}) {
  if (section === 'routines') {
    return (
      <RoutinesSection
        selectedId={selectedId}
        onSelect={onSelect}
        onOpenProgram={(id) => onNavigate('programs', id)}
        focusNew={focusNew}
      />
    );
  }
  if (section === 'programs') {
    return <ProgramsSection selectedId={selectedId} onSelect={onSelect} focusNew={focusNew} />;
  }
  if (section === 'goals') {
    return <GoalsSection selectedId={selectedId} onSelect={onSelect} focusNew={focusNew} />;
  }
  if (section === 'projects') {
    return <ProjectsSection selectedId={selectedId} onSelect={onSelect} focusNew={focusNew} />;
  }
  if (section === 'types') {
    return <TypesSection selectedId={selectedId} onSelect={onSelect} focusNew={focusNew} />;
  }
  if (section === 'groups') {
    return <GroupsSection selectedId={selectedId} onSelect={onSelect} focusNew={focusNew} />;
  }

  // Trash takes no selection props: it is the one section with nothing to
  // select into, so its rows carry their single verb inline. See trash.tsx.
  return <TrashSection />;
}

/**
 * The teaching surface that makes the second visit feel like the tenth.
 *
 * Desktop only, three entries, not five: at monthly frequency this is not a
 * power-user ledger. It is present in the empty state too, so the keyboard flow
 * never dead-ends.
 */
function FooterBar({
  section,
  selectedId,
}: {
  section: ConsoleSection;
  selectedId: string | null;
}) {
  const meta = sectionMeta(section);
  return (
    <div className="border-border text-muted-foreground font-num hidden h-8 shrink-0 items-center gap-4 border-t px-4 text-2xs md:flex">
      <span data-testid="organize-footer-subject">
        {selectedId ? meta.label : `${meta.label} · nothing selected`}
      </span>
      <span className="ml-auto flex items-center">
        Filter
        <KeyCap>/</KeyCap>
      </span>
      <span className="flex items-center">
        Close
        <KeyCap>Esc</KeyCap>
      </span>
    </div>
  );
}
