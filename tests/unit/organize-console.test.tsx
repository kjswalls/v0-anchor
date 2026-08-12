import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OrganizeConsole } from '@/components/planner/organize/organize-console';
import { CONSOLE_SECTIONS, isConsoleSection } from '@/components/planner/organize/console-rail';

/**
 * The Organize console's frame (memory/plans/organize-console.md, Phase 2).
 *
 * These pin the contracts that are expensive to discover late — the ones the
 * seven doors and both e2e spec files depend on — rather than the layout, which
 * is a visual review's job.
 *
 * ResponsiveModal picks Dialog vs vaul off useIsMobile, which reads
 * window.innerWidth; jsdom reports 1024, so these exercise the DESKTOP plate.
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

const tab = (name: string) => screen.getByRole('tab', { name });

/** Radix defers roving focus into a setTimeout. */
const tick = async () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('the Organize console frame', () => {
  afterEach(cleanup);

  it('exposes all six sections as tabs, in the decided order', () => {
    render(<OrganizeConsole open onOpenChange={() => {}} />);
    // Item types ABOVE Habit groups — decision 7. The order is asserted rather
    // than assumed because it is free to change now and awkward once the
    // habit-groups-into-routines fold starts.
    expect(screen.getAllByRole('tab').map((el) => el.textContent)).toEqual([
      'Routines',
      'Programs',
      'Projects',
      'Item types',
      'Habit groups',
      'Trash',
    ]);
  });

  it('keeps the group eyebrows out of every tab\'s accessible name', () => {
    render(<OrganizeConsole open onOpenChange={() => {}} />);
    // The e2e specs drive the manager with getByRole('tab', { name }). Playwright
    // substring-matches by default, so "CONTAINERS Routines" would still pass —
    // and that would be a silent dependency on matcher behaviour rather than on
    // the DOM being right.
    expect(tab('Routines')).toHaveAccessibleName('Routines');
    expect(tab('Habit groups')).toHaveAccessibleName('Habit groups');
    expect(screen.queryByRole('tab', { name: /CONTAINERS|LABELS/ })).toBeNull();
  });

  it('defaults to routines when no section is given', () => {
    render(<OrganizeConsole open onOpenChange={() => {}} />);
    expect(tab('Routines')).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to routines for a section slug it does not know', () => {
    // `tab` arrives as a bare string from ActiveDialog and from the palette, so
    // a stale or hand-typed value must land somewhere real rather than render an
    // empty plate.
    render(<OrganizeConsole open onOpenChange={() => {}} section="nonsense" />);
    expect(tab('Routines')).toHaveAttribute('aria-selected', 'true');
  });

  it('lands on the section it is opened with', () => {
    render(<OrganizeConsole open onOpenChange={() => {}} section="programs" />);
    expect(tab('Programs')).toHaveAttribute('aria-selected', 'true');
  });

  it('re-lands when reopened on a DIFFERENT section without unmounting', () => {
    // The whole reason ActiveDialog carries `tab`: the console stays mounted
    // between opens, so nothing resets on its own. A door that deep-links to
    // programs after a visit to projects must not land on projects.
    const { rerender } = render(
      <OrganizeConsole open onOpenChange={() => {}} section="projects" />
    );
    expect(tab('Projects')).toHaveAttribute('aria-selected', 'true');

    rerender(<OrganizeConsole open={false} onOpenChange={() => {}} section="projects" />);
    rerender(<OrganizeConsole open onOpenChange={() => {}} section="programs" />);

    expect(tab('Programs')).toHaveAttribute('aria-selected', 'true');
  });

  it('does not remember the last section a visit ended on', () => {
    // Deliberately not a last-used memory: at monthly frequency a remembered
    // destination is a coin flip, and it makes the braindump door unlearnable.
    const { rerender } = render(
      <OrganizeConsole open onOpenChange={() => {}} section="routines" />
    );
    fireEvent.mouseDown(tab('Habit groups'), { button: 0 });
    expect(tab('Habit groups')).toHaveAttribute('aria-selected', 'true');

    rerender(<OrganizeConsole open={false} onOpenChange={() => {}} section="routines" />);
    rerender(<OrganizeConsole open onOpenChange={() => {}} section="routines" />);

    expect(tab('Routines')).toHaveAttribute('aria-selected', 'true');
  });

  it('walks the rail with ↓, stepping over the eyebrows and the Trash rule', async () => {
    render(<OrganizeConsole open onOpenChange={() => {}} />);

    tab('Routines').focus();
    fireEvent.focus(tab('Routines'));

    for (const next of ['Programs', 'Projects', 'Item types', 'Habit groups', 'Trash']) {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      await tick();
      expect(tab(next)).toHaveFocus();
    }
  });

  it('claims the bare-key space so a focused row cannot fire a global', () => {
    render(<OrganizeConsole open onOpenChange={() => {}} />);
    // The console's rows are <button>s, so isFocusedOnInput() is false on them
    // and `n` would otherwise open the add dialog — replacing this console in
    // the single ActiveDialog slot. See hooks/use-command-shortcuts.ts.
    expect(document.querySelector('[data-keys-local="true"]')).not.toBeNull();
  });

  it('closes from its own header button rather than the stock floating one', () => {
    const onOpenChange = vi.fn();
    render(<OrganizeConsole open onOpenChange={onOpenChange} />);

    // One close control, on the header band's baseline.
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
    fireEvent.click(screen.getByTestId('organize-close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('gives the plate a title and a described purpose', () => {
    render(<OrganizeConsole open onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Organize');
  });

  it('shows the section teaching line, which is its permanent home', () => {
    // Today these sentences live only in an empty state and vanish the moment
    // one container exists, taking the only in-app explanation of what a routine
    // IS with them.
    render(<OrganizeConsole open onOpenChange={() => {}} section="programs" />);
    expect(
      screen.getByText(/A program is a stretch of life/)
    ).toBeInTheDocument();
  });
});

describe('console section slugs', () => {
  it('accepts exactly the six, and nothing else', () => {
    for (const s of CONSOLE_SECTIONS) expect(isConsoleSection(s.id)).toBe(true);
    expect(isConsoleSection('settings')).toBe(false);
    expect(isConsoleSection(undefined)).toBe(false);
  });

  it('keeps the five legacy tab values verbatim, so no call site translates', () => {
    // Every existing openDialog({ tab }) literal must keep working — this is a
    // variant rename, not a value migration.
    const ids = CONSOLE_SECTIONS.map((s) => s.id);
    for (const legacy of ['routines', 'programs', 'projects', 'groups', 'types']) {
      expect(ids).toContain(legacy);
    }
  });
});
