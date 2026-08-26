import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * The Organize console's gate — the console stops opening, and stays findable.
 *
 * The console is the easier of this PR's two gates because it is one surface
 * behind one dialog request, but it has a wrinkle the goals gate does not: it
 * is the place GOALS are created. So the sections are not one switch, they are
 * one switch EACH (console-rail.tsx), and the four on/off combinations have to
 * be coherent — which is what `consoleSectionsFor` is pinned on below. The case
 * that matters is Organize OFF with Goals ON: the console still opens, holding
 * only the section that made it necessary.
 *
 * The other half is the doors. Every route into the console goes inert, and the
 * console itself refuses the request as a guard of last resort — returning the
 * ui-store's single dialog slot rather than rendering nothing into it, which
 * would leave a slot armed at a dialog nobody can see or Escape.
 */

/** vaul touches APIs jsdom lacks; the desktop path never renders it. */
vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Overlay: () => null,
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    Description: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    Close: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
    Handle: () => null,
  },
}));

import { OrganizeConsole } from '@/components/planner/organize/organize-console';
import {
  CONSOLE_SECTIONS,
  consoleSectionExtension,
  consoleSectionsFor,
} from '@/components/planner/organize/console-rail';
import { useExtensionsStore } from '@/lib/extensions-store';
import {
  EXT_GOALS,
  EXT_ORGANIZE,
  OFFICIAL_EXTENSIONS,
  extensionManifest,
  resolveEnabled,
} from '@/lib/extension-registry';
import {
  ALL_PANES,
  extensionPaneId,
  isPaneId,
  settingsForPane,
  DESTINATIONS,
} from '@/lib/settings/manifest';
import { STATIC_COMMANDS, isAvailable, type CommandContext } from '@/lib/commands';
import { enableExtensions, disableExtensions } from './support/extensions';

const ctx: CommandContext = {
  theme: { resolved: 'light', value: 'light', set: () => {} },
  openChat: () => {},
  userId: 'user-1',
  isMobile: false,
};

/** The predicate the console resolves its rail through, read live. */
const isOn = (slug: string) => resolveEnabled(useExtensionsStore.getState().enabled, slug);

const tabNames = () => screen.queryAllByRole('tab').map((t) => t.textContent);

beforeEach(() => useExtensionsStore.setState({ enabled: {} }));
afterEach(cleanup);

/* ── it must stop ACTING ───────────────────────────────────────────────────*/

describe('Organize switched off — the console stops opening', () => {
  it('renders no console at all, and hands the dialog slot back', () => {
    disableExtensions(EXT_ORGANIZE, EXT_GOALS);
    const onOpenChange = vi.fn();
    render(<OrganizeConsole open onOpenChange={onOpenChange} />);

    expect(screen.queryByTestId('organize-console')).toBeNull();
    expect(screen.queryByTestId('console-rail')).toBeNull();
    // Not just "renders nothing": ui-store holds ONE activeDialog, and leaving
    // it armed at an invisible dialog makes ⌘K the only way out.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ignores a deep link to a gated section rather than opening an empty plate', () => {
    disableExtensions(EXT_ORGANIZE, EXT_GOALS);
    render(<OrganizeConsole open onOpenChange={() => {}} section="trash" />);

    expect(screen.queryByTestId('organize-console')).toBeNull();
  });

  it('still opens for GOALS alone, which is the one section it does not own', () => {
    // The combination that would otherwise strand the other extension: Goals on
    // buys a filter, a grouping and a page for goals you would have no way to
    // create.
    disableExtensions(EXT_ORGANIZE);
    enableExtensions(EXT_GOALS);
    render(<OrganizeConsole open onOpenChange={() => {}} />);

    expect(screen.getByTestId('organize-console')).toBeInTheDocument();
    expect(tabNames()).toEqual(['Goals']);
  });

  it('lands a gated deep link on a section that exists', () => {
    disableExtensions(EXT_ORGANIZE);
    enableExtensions(EXT_GOALS);
    // 'routines' rides the console, which is off — the old hard-coded fallback
    // was also 'routines', so a naive gate leaves Radix on a tab with no
    // trigger and draws a blank plate.
    render(<OrganizeConsole open onOpenChange={() => {}} section="routines" />);

    expect(screen.getByRole('tab', { name: 'Goals' })).toHaveAttribute(
      'data-state',
      'active'
    );
  });

  it('drops the console sections and keeps Goals — all four combinations', () => {
    const ids = (goals: boolean, organize: boolean) =>
      consoleSectionsFor((slug) => (slug === EXT_GOALS ? goals : organize)).map((s) => s.id);

    expect(ids(true, true)).toEqual(CONSOLE_SECTIONS.map((s) => s.id));
    expect(ids(true, false)).toEqual(['goals']);
    expect(ids(false, true)).toEqual(
      CONSOLE_SECTIONS.filter((s) => s.id !== 'goals').map((s) => s.id)
    );
    expect(ids(false, false)).toEqual([]);
  });

  it('names an extension for every section, so no row can be silently ungated', () => {
    for (const section of CONSOLE_SECTIONS) {
      expect(OFFICIAL_EXTENSIONS.map((e) => e.slug)).toContain(section.extension);
      expect(consoleSectionExtension(section.id)).toBe(section.extension);
    }
    // Anything the rail cannot show answers with the console's own switch,
    // which is the safe default for a caller holding a stale section id.
    expect(consoleSectionExtension('not-a-section')).toBe(EXT_ORGANIZE);
    expect(consoleSectionExtension(undefined)).toBe(EXT_ORGANIZE);
  });

  it('opens the whole console once it is switched back on', () => {
    enableExtensions(EXT_ORGANIZE, EXT_GOALS);
    render(<OrganizeConsole open onOpenChange={() => {}} />);

    expect(screen.getByTestId('organize-console')).toBeInTheDocument();
    expect(tabNames()).toEqual(CONSOLE_SECTIONS.map((s) => s.label));
    expect(consoleSectionsFor(isOn)).toHaveLength(CONSOLE_SECTIONS.length);
  });
});

/* ── and it must stay findable ─────────────────────────────────────────────*/

describe('Organize switched off — still in the catalogue', () => {
  beforeEach(() => disableExtensions(EXT_ORGANIZE));

  it('keeps its manifest row, which is what generates every way of finding it', () => {
    expect(OFFICIAL_EXTENSIONS.map((e) => e.slug)).toContain(EXT_ORGANIZE);
    const manifest = extensionManifest(EXT_ORGANIZE);
    expect(manifest?.name).toBe('Organize console');
    expect(manifest?.description).toBeTruthy();
    expect(manifest?.defaultEnabled).toBe(false);
    expect(resolveEnabled({}, EXT_ORGANIZE)).toBe(false);
  });

  it('keeps its settings pane and the one switch that turns it back on', () => {
    const pane = extensionPaneId(EXT_ORGANIZE);
    expect(isPaneId(pane)).toBe(true);
    expect(ALL_PANES.map((p) => p.id)).toContain(pane);

    const toggle = settingsForPane(pane).find((r) => r.control === 'switch' && !r.dependsOn);
    expect(toggle).toBeDefined();
    expect(toggle!.read({} as never)).toBe(false);
  });

  it('keeps every Organize destination in the settings search index', () => {
    // These are how someone in trouble finds the trash. They stay searchable
    // with the console off; the page sends them to the switch instead of to a
    // console that would close on arrival (app/settings/[[...pane]]/page.tsx).
    const organize = DESTINATIONS.filter((d) => d.action === 'organize').map((d) => d.id);
    expect(organize).toContain('dest.trash');
    expect(organize).toContain('dest.projects');
    expect(organize).toContain('dest.goals');
  });

  it('keeps the Organize commands, greyed rather than deleted', () => {
    const categories = STATIC_COMMANDS.find((c) => c.id === 'app.categories');
    const collections = STATIC_COMMANDS.find((c) => c.id === 'app.collections');
    expect(categories).toBeDefined();
    expect(collections).toBeDefined();
    expect(isAvailable(categories!, ctx)).toBe(false);
    expect(isAvailable(collections!, ctx)).toBe(false);

    enableExtensions(EXT_ORGANIZE);
    expect(isAvailable(categories!, ctx)).toBe(true);
    expect(isAvailable(collections!, ctx)).toBe(true);
  });

  it('leaves the goals command alone — it rides Goals, not the console', () => {
    // Same row, different switch: `app.goals` opens the one section the console
    // does not own, so a console that is off must not grey it out.
    enableExtensions(EXT_GOALS);
    const goals = STATIC_COMMANDS.find((c) => c.id === 'app.goals');
    expect(isAvailable(goals!, ctx)).toBe(true);
  });
});
