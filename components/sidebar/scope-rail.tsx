'use client';

import { useEffect, useMemo, useState } from 'react';
import { Moon, Plus } from 'lucide-react';
import { CategoryIcon } from '@/lib/category-icons';
import { toDateStr } from '@/lib/recurrence';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { buildScopeRows, programStateForSwitch, scopeCountLine, type ScopeRow } from '@/lib/scope-rail';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The Scope Rail — the switchboard at the foot of the sidebar.
 *
 * It exists because the manager had no unconditional entry point: from a
 * standing start the command palette was the only door, and the item chips that
 * would have revealed that door only appear once you have already been through
 * it. This puts the containers where the eye already goes, permanently, and
 * spends no new column to do it.
 *
 * It is a lens, not a database view. The row's job is the daily question — what
 * is on right now, and what happens if I switch this — and it answers with a
 * switch, a sentence and a number. The console (Routines & Programs) keeps the
 * periodic question: what have I got, and what is dead weight. Two questions,
 * two surfaces; the rail links to the console rather than replacing it.
 *
 * Everything computed lives in lib/scope-rail.ts. Read its header first — the
 * local-vs-effective split and the resolver-delta counting are both load-bearing
 * and neither is obvious from the markup.
 */
export function ScopeRail() {
  const items = usePlannerStore((s) => s.items);
  const routines = usePlannerStore((s) => s.routines);
  const programs = usePlannerStore((s) => s.programs);
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const collectionsAvailable = usePlannerStore((s) => s.collectionsAvailable);
  const userId = usePlannerStore((s) => s.userId);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const setRoutinePaused = usePlannerStore((s) => s.setRoutinePaused);
  const setProgramState = usePlannerStore((s) => s.setProgramState);
  const openDialog = useUIStore((s) => s.openDialog);

  const [hovered, setHovered] = useState<string | null>(null);

  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Recomputed every render rather than memoized, and then used as a memo KEY.
  // Pausing is dateless (locked decision 3), so every answer here is resolved at
  // today — and a today captured once is the bug the palette shipped in Phase 1:
  // an app left open overnight went on offering a resume for a pause that had
  // already expired. A render is cheap; being a day wrong is not.
  const todayStr = toDateStr(new Date(), tz);

  const rows = useMemo(
    () => buildScopeRows(items, routines, programs, todayStr, tz),
    [items, routines, programs, todayStr, tz]
  );

  const ghost = hovered ? rows.find((r) => r.id === hovered) : undefined;
  // Only an ON container can be previewed. Ghosting shows a disappearance, and
  // there is nothing on the canvas to dim for work that would ARRIVE — so the
  // off rows carry their number instead of faking a preview they cannot give.
  const ghostIds = ghost?.effectiveOn ? ghost.flips : undefined;

  useEffect(() => {
    if (!ghostIds?.length) return;
    const wanted = new Set(ghostIds);
    const marked: Element[] = [];
    // Scoped by DATE as well as by id. The flip-delta is resolved at today —
    // the rail is a dateless surface and deliberately does not re-run the
    // resolver per column — so an unscoped selector dimmed the same item in all
    // seven week columns. Most of those cannot move: a pause's lower bound never
    // reaches backwards, so every past column survives the flip, and a marked or
    // skipped occupancy is not an open loop on any date. Rows carry the date
    // their own suppression was resolved at; only the matching ones can change.
    for (const el of document.querySelectorAll('[data-item-id][data-scope-date]')) {
      if (el.getAttribute('data-scope-date') !== todayStr) continue;
      if (!wanted.has(el.getAttribute('data-item-id') ?? '')) continue;
      el.setAttribute('data-scope-ghost', '');
      marked.push(el);
    }
    return () => {
      for (const el of marked) el.removeAttribute('data-scope-ghost');
    };
    // The flip set is the dependency, not the hovered id: flipping a switch
    // while the pointer sits on it recomputes the set, and the effect re-runs to
    // show the NEW consequence rather than leaving a stale ghost on screen.
  }, [ghostIds, todayStr]);

  // Nothing until the containers have actually arrived. `collectionsAvailable`
  // starts optimistically true, so without this the rail is a ONE-CLICK door
  // into the manager during the load window — and a container created in that
  // window is erased without trace when initializeStore's set() replaces
  // `routines`/`programs` with what came back. The user then creates it again
  // and owns two. Same signal app-shell already uses for "loaded".
  if (!collectionsAvailable || !userId || isLoading) return null;

  return (
    <section
      data-testid="scope-rail"
      className="shrink-0 rounded-[10px] bg-surface-3 px-[10px] py-[7px] shadow-[var(--shadow-elev-bar)]"
    >
      {/* One rule, mounted by the thing that owns the behaviour rather than
          added to globals.css, so the preview is self-contained: the attribute
          and the style that reads it live in the same file. Written straight to
          the DOM (see the effect) instead of through React — every rendered item
          would otherwise re-render on a hover, which is the same trade the
          sidebar's resize makes when it writes --sidebar-w to <html>. */}
      <style>{'[data-scope-ghost]{opacity:.28}'}</style>

      <div className="flex h-[22px] items-center gap-2 px-[5px]">
        <h2 className="text-muted-foreground flex-1 text-[10.5px] font-medium tracking-wider uppercase">
          Scopes
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="scope-rail-add"
              aria-label="New routine or program"
              onClick={() => openDialog({ type: 'manage-collections', tab: 'routines' })}
              className="text-muted-foreground hover:text-foreground -mr-1 flex h-5 w-5 items-center justify-center rounded transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">New routine or program</TooltipContent>
        </Tooltip>
      </div>

      {rows.length === 0 ? (
        // The rail earns its space most when it is empty — this line is the only
        // place in the app that says the feature exists before you own one.
        <p className="text-muted-foreground px-[5px] pt-0.5 pb-1 text-[11px] leading-snug">
          Group things you want to switch off together — a morning routine, a summer.
        </p>
      ) : (
        // Plain overflow-y-auto, never <ScrollArea>: the Radix wrapper silently
        // drops max-h and the strip would grow until it ate the braindump.
        <div className="max-h-[168px] overflow-y-auto overflow-x-hidden py-0.5">
          {rows.map((row) => (
            <ScopeRow
              key={`${row.kind}:${row.id}`}
              row={row}
              onHover={(on) => setHovered(on ? row.id : (h) => (h === row.id ? null : h))}
              onToggle={() => {
                if (row.kind === 'routine') {
                  setRoutinePaused(row.id, row.localOn);
                  return;
                }
                const program = programs.find((p) => p.id === row.id);
                if (program) {
                  setProgramState(row.id, programStateForSwitch(program, !row.localOn, todayStr));
                }
              }}
              onOpen={() =>
                openDialog({
                  type: 'manage-collections',
                  tab: row.kind === 'program' ? 'programs' : 'routines',
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ScopeRow({
  row,
  onHover,
  onToggle,
  onOpen,
}: {
  row: ScopeRow;
  onHover: (on: boolean) => void;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const verb = row.localOn ? 'Turn off' : 'Turn on';
  return (
    <div
      data-testid="scope-row"
      data-scope-kind={row.kind}
      data-scope-id={row.id}
      data-scope-local={row.localOn ? 'on' : 'off'}
      data-scope-effective={row.effectiveOn ? 'on' : 'off'}
      className="hover-wash flex h-[26px] items-center gap-2 rounded px-[5px]"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The switch carries the LOCAL state and nothing else. A routine
              held off by its program still shows its own switch as on, because
              that is what resuming the program will hand back — merging the two
              is how a surface starts lying about state the user set. */}
          <button
            type="button"
            data-testid="scope-switch"
            aria-pressed={row.localOn}
            // The NAME is the object, not the verb. With aria-pressed the state
            // is already announced, so "Turn off Morning … pressed" reads as its
            // own negation — the turning-off is on. The verb lives in the
            // tooltip, where sighted users get it and the reading is unambiguous.
            aria-label={row.name}
            onClick={onToggle}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            onFocus={() => onHover(true)}
            onBlur={() => onHover(false)}
            className={cn(
              'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] transition-colors',
              row.localOn
                // Lime at full strength in both themes, on its own element, so
                // no parent's dimming can reach it (CLAUDE.md's accent law).
                ? 'bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground border'
            )}
          >
            <CategoryIcon
              glyph={row.icon}
              name={row.name}
              className="h-3 w-3 text-current"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <div className="text-foreground text-xs">
            {verb} {row.name}
          </div>
          <div className="text-muted-foreground mt-0.5 text-2xs tabular-nums">
            {scopeCountLine(row)}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* The luminance is the EFFECTIVE state — the other half of the split. */}
      <button
        type="button"
        onClick={onOpen}
        data-testid="scope-name"
        className={cn(
          'min-w-0 flex-1 truncate text-left text-[12.5px] transition-colors',
          row.effectiveOn ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {row.name}
      </button>

      {/* The STANDING half of "N items are away with Summer": how much this
          switch is holding back, on every date, stated on the switch that is
          doing the holding.

          Its date-bound twin — how much is missing from the day you happen to
          be looking at — is the header-row line in
          components/views/program-notice.tsx. Neither belongs in the dock: a
          fact that is true all the time and asks nothing of the reader is the
          exact thing lib/dock-notices.ts refuses, because a notice surface that
          accumulates permanent lines stops being read.

          Same moon as the header line, on purpose. One glyph for "away", so the
          two readings of the same fact are visibly the same fact — and the same
          guilt-free treatment: muted, no badge, no count chip, no warning tint.

          `flips` on an off row is what would come BACK if you flipped it, which
          is precisely what is away. Rendered for routines too, not just
          programs: it is the same sentence about the same kind of object, and
          gating it on kind would be an arbitrary distinction the rail does not
          otherwise draw. */}
      {!row.effectiveOn && row.flips.length > 0 && (
        <span
          data-testid="scope-away-count"
          data-away-count={row.flips.length}
          className="text-muted-foreground flex shrink-0 items-center gap-0.5 font-num text-[10.5px] tabular-nums"
        >
          <Moon className="h-2.5 w-2.5 shrink-0" aria-hidden />
          {row.flips.length}
        </span>
      )}

      <span className="text-muted-foreground max-w-[54%] shrink-0 truncate text-[10.5px]">
        {row.state}
      </span>
    </div>
  );
}
