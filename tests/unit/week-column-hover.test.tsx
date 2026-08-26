import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DndContext } from '@dnd-kit/core';

/**
 * Week day-column emphasis: nothing dimmed at rest, siblings recede on hover.
 *
 * Week × Schedule used to render `!selected && 'opacity-60 hover:opacity-100'`,
 * so six days out of seven were faded whether or not the pointer was anywhere
 * near the grid; Week × Buckets did the same thing per-element on its header.
 * The recede is a hover answer now, and it lives in ONE rule in app/globals.css
 * keyed on `[data-week-cols]` / `[data-week-col]`.
 *
 * That rule cannot be executed here — jsdom applies no stylesheet and resolves
 * no `:has()` — so this suite splits the contract in two, which is also how it
 * catches the failure mode a single-sided test would miss:
 *
 *   - the MOUNTS supply the hooks the rule selects on, and carry no resting
 *     dim of their own (a stray `opacity-60` would defeat the rule by simply
 *     being there);
 *   - the STYLESHEET still contains the rule, still behind the hover-capable
 *     pointer guard, and still excluding the two columns that hold lime.
 *
 * The exclusions are the accent rule (CLAUDE.md): a column opacity composites
 * everything inside it, and the selected day's header pill, the now-marker and
 * today's current-bucket segment are lime, which never fades through a parent.
 */

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

vi.mock('@/lib/db', () => ({
  fetchItems: vi.fn(async () => []),
  fetchProjects: vi.fn(async () => []),
  fetchHabitGroups: vi.fn(async () => []),
  fetchItemTypes: vi.fn(async () => []),
  createItem: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  setItemCompletion: vi.fn(async () => {}),
  fetchRoutines: vi.fn(async () => []),
  fetchPrograms: vi.fn(async () => []),
  fetchGoals: vi.fn(async () => []),
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase', () => ({ createClient: vi.fn(() => ({})) }));

import { WeekBuckets } from '@/components/views/week-buckets';
import { WeekList } from '@/components/views/week-list';
import { WeekSchedule } from '@/components/views/week-schedule';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { EMPTY_VIEW_FILTERS } from '@/lib/filters';

const TZ = 'UTC';
/** A Thursday in a week that holds no "today", so every column is an ordinary one. */
const DATE = new Date('2026-08-13T12:00:00Z');

function seed(selectedDate: Date) {
  usePlannerStore.setState({
    userId: 'user-1',
    userTimezone: TZ,
    selectedDate,
    weekStartDay: 'sunday',
    navDirection: null,
    tasks: [],
    habits: [],
    items: [],
    projects: [],
    habitGroups: [],
    routines: [],
    programs: [],
    showCompletedTasks: true,
    showPausedOnGrid: true,
    showCurrentTimeIndicator: false,
  });
  useViewStore.setState({
    canvasGroupBy: 'none',
    canvasSortBy: 'default',
    canvasFilters: EMPTY_VIEW_FILTERS,
    typeFilter: 'all',
    collapsedBuckets: [],
    bucketStyle: 'spine',
  });
}

const mount = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>);

const columnViews = () => [
  ['Week × Schedule', <WeekSchedule key="ws" activeId={null} />] as const,
  ['Week × Buckets', <WeekBuckets key="wb" activeId={null} />] as const,
];

afterEach(cleanup);
beforeEach(() => seed(DATE));

describe('the hover-emphasis hooks are on both column views', () => {
  it('puts every column inside the row the rule scopes its :has() to', () => {
    // The rule reads `[data-week-cols]:has([data-week-col]:hover) [data-week-col]`.
    // If a column ever stopped being a DESCENDANT of the marked row — a wrapper
    // slipped in above the map, say — the selector would quietly match nothing
    // and the week would simply never emphasise anything.
    for (const [name, ui] of columnViews()) {
      const { container } = mount(ui);
      const rows = container.querySelectorAll('[data-week-cols]');
      const cols = container.querySelectorAll('[data-week-col]');

      expect(rows, name).toHaveLength(1);
      expect(cols, name).toHaveLength(7);
      for (const col of cols) expect(rows[0].contains(col), name).toBe(true);
      cleanup();
    }
  });

  it('marks the same element that carries the selected/today opt-outs', () => {
    // The exclusions are `:not([data-selected='true']):not([data-today='true'])`
    // on the SAME compound as `[data-week-col]`. Split across two elements they
    // would stop excluding anything, and the lime would fade.
    for (const [name, ui] of columnViews()) {
      const { container } = mount(ui);
      for (const col of container.querySelectorAll('[data-week-col]')) {
        expect(col.getAttribute('data-selected'), name).toMatch(/^(true|false)$/);
        expect(col.getAttribute('data-today'), name).toMatch(/^(true|false)$/);
      }
      // Exactly one selected column — the opt-out is a single day, not a range.
      expect(container.querySelectorAll('[data-week-col][data-selected="true"]'), name).toHaveLength(1);
      cleanup();
    }
  });

  it('flags today, so the lime opt-out has something to match', () => {
    // Seeded on the real clock: whichever week that lands in, one of its seven
    // columns is today, and that is the column holding the now-marker and the
    // current-bucket bead.
    seed(new Date());
    for (const [name, ui] of columnViews()) {
      const { container } = mount(ui);
      expect(container.querySelectorAll('[data-week-col][data-today="true"]'), name).toHaveLength(1);
      cleanup();
    }
  });
});

describe('nothing is dimmed at rest', () => {
  it('leaves no resting opacity on any column', () => {
    // The regression this whole change is about. A resting `opacity-60` would
    // also beat the stylesheet rule on nothing at all — it is a plain utility,
    // and the hovered column would have no way back to full.
    for (const [name, ui] of columnViews()) {
      const { container } = mount(ui);
      for (const col of container.querySelectorAll('[data-week-col]')) {
        expect(col.className, name).not.toMatch(/(^|[\s:])opacity-\d/);
      }
      cleanup();
    }
  });

  it('keeps the unselected Buckets header at full surface and ink strength', () => {
    // Week × Buckets receded per-element rather than by opacity, because of the
    // lime bead. Those mutes (`bg-surface-2/60`, `text-muted-foreground/70`,
    // `text-foreground/70`) were the same resting dim wearing a different hat.
    const { container } = mount(<WeekBuckets activeId={null} />);
    const headers = [...container.querySelectorAll('[data-testid="week-column-header"]')];
    expect(headers).toHaveLength(7);

    const unselected = headers.filter(
      (h) => h.closest('[data-week-col]')?.getAttribute('data-selected') === 'false'
    );
    expect(unselected).toHaveLength(6);
    for (const h of unselected) {
      expect(h.className).toContain('bg-surface-2');
      // No alpha-fraction utilities anywhere in the header subtree.
      for (const el of [h, ...h.querySelectorAll('*')]) {
        expect(el.className).not.toMatch(/(bg|text)-[a-z-]+\/\d/);
      }
    }
  });

  it('still gives that header a hover affordance, which the un-muting used to be', () => {
    const { container } = mount(<WeekBuckets activeId={null} />);
    const unselected = [...container.querySelectorAll('[data-testid="week-column-header"]')].filter(
      (h) => h.closest('[data-week-col]')?.getAttribute('data-selected') === 'false'
    );
    for (const h of unselected) expect(h.className).toContain('hover-wash');
  });
});

describe('Week × List is out of scope, and stays out', () => {
  it('carries no column hooks — it is a stack of day sections, not columns', () => {
    // Same line lib/week-columns.ts draws with isScalableLayout: schedule and
    // buckets have day columns, list does not. There are no siblings to recede
    // against in a vertical agenda, and it dims nothing at rest already.
    const { container } = mount(<WeekList />);
    expect(container.querySelectorAll('[data-week-cols]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-week-col]')).toHaveLength(0);
  });
});

describe('the stylesheet still holds up its half', () => {
  const globalsCss = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

  /** The rule body, from its media guard to the closing brace of the block. */
  const block = (() => {
    const at = globalsCss.indexOf('@media (hover: hover) and (pointer: fine)');
    expect(at, 'the hover-emphasis rule is gone from app/globals.css').toBeGreaterThan(-1);
    return globalsCss.slice(at, globalsCss.indexOf('\n}\n', globalsCss.indexOf('opacity', at)));
  })();

  it('is gated on a hover-capable, fine pointer', () => {
    // A touch tablet is wide enough for the desktop shell, and there `:hover`
    // sticks after a tap — six columns would stay dimmed with no way back.
    expect(block).toContain('@media (hover: hover) and (pointer: fine)');
  });

  it('engages off a COLUMN hover, not the row itself', () => {
    // The row's flex gaps belong to the row. Hanging this off `[data-week-cols]:hover`
    // would recede all seven whenever the pointer crossed a gap.
    expect(block).toContain('[data-week-cols]:has([data-week-col]:hover)');
    expect(block).toMatch(/\[data-week-col\]:not\(:hover\)/);
  });

  it('never composites the lime columns', () => {
    // CLAUDE.md: the accent must not fade through a parent's opacity. These two
    // exclusions are the whole reason Week × Buckets can share the mechanism it
    // once had to refuse.
    expect(block).toContain(":not([data-selected='true'])");
    expect(block).toContain(":not([data-today='true'])");
  });

  it('recedes rather than hides', () => {
    expect(block).toMatch(/opacity:\s*0\.6;/);
  });
});
