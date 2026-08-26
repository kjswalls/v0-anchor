import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

/**
 * "Off" means INERT, not hidden — proved from both sides, per extension.
 *
 * Anchor's extensions are a store, not a feature-flag list. A switched-off
 * extension keeps its catalogue row, keeps its settings pane and stays findable
 * by search; what stops is its BEHAVIOUR. Two halves, and each one is a
 * different way to be wrong:
 *
 *   · the extension still acts while switched off — the switch is a lie;
 *   · the extension vanishes from the catalogue while switched off — the user
 *     cannot find the thing they turned off, so they conclude it was deleted
 *     and there is no way back.
 *
 * So every feature below gets BOTH: an "acts while off" test and a "still in the
 * catalogue while off" test. Neither is redundant. Deleting the gate passes the
 * catalogue tests; deleting the manifest entry passes the behaviour tests.
 *
 * These assertions run against the REAL surfaces — the real command registry,
 * the real settings manifest and search, the real components mounted — because
 * this repo has shipped a green suite over a regression its own commit message
 * named. A test that re-implements the gate asserts its own arithmetic.
 */

// RelayField (the braindump's empty-state backdrop) reads prefers-reduced-motion.
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
});

vi.mock('@/lib/db', () => ({
  fetchItems: vi.fn(async () => []),
  fetchProjects: vi.fn(async () => []),
  fetchHabitGroups: vi.fn(async () => []),
  fetchItemTypes: vi.fn(async () => []),
  fetchRoutines: vi.fn(async () => []),
  fetchPrograms: vi.fn(async () => []),
  fetchGoals: vi.fn(async () => []),
  createItem: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  setItemCompletion: vi.fn(async () => {}),
  fetchUserExtensions: vi.fn(async () => ({})),
  fetchUserExtensionConfigs: vi.fn(async () => ({})),
  setUserExtensionEnabled: vi.fn(async () => {}),
  setUserExtensionConfig: vi.fn(async () => {}),
}));
vi.mock('@/lib/settings-service', () => ({
  saveSettings: vi.fn(async () => {}),
  flushSettings: vi.fn(async () => {}),
}));
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }),
  })),
}));
// UserProfileDropdown calls useRouter for its sign-out redirect.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/user-profile', () => ({
  isOnboardingComplete: vi.fn(async () => true),
  setOnboardingComplete: vi.fn(async () => {}),
  resetOnboardingComplete: vi.fn(async () => {}),
}));

import { useCommandShortcuts } from '@/hooks/use-command-shortcuts';
import { Braindump } from '@/components/sidebar/braindump';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { UserProfileDropdown } from '@/components/planner/user-profile-dropdown';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { useUIStore, openBulkAdd } from '@/lib/ui-store';
import { useExtensionsStore } from '@/lib/extensions-store';
import { EMPTY_VIEW_FILTERS } from '@/lib/filters';
import {
  EXT_BULK_PASTE,
  EXT_FEEDBACK,
  EXT_GUIDED_TOUR,
  OFFICIAL_EXTENSIONS,
  extensionManifest,
} from '@/lib/extension-registry';
import { serverExtensionOn } from '@/lib/extension-gate-server';
import { STATIC_COMMANDS } from '@/lib/commands/registry';
import { isAvailable, isHidden } from '@/lib/commands/types';
import type { CommandContext } from '@/lib/commands/types';
import {
  EXTENSION_PANES,
  extensionPaneId,
  paneById,
  settingById,
  settingsForPane,
  type SettingCtx,
} from '@/lib/settings/manifest';
import { searchSettings } from '@/lib/settings/search';

/* ── harness ─────────────────────────────────────────────────────────────── */

const settingCtx: SettingCtx = { theme: 'system', setTheme: () => {}, userId: 'user-1' };

const commandCtx: CommandContext = {
  theme: { resolved: 'light', value: 'light', set: () => {} },
  openChat: () => {},
  userId: 'user-1',
  isMobile: false,
};

/**
 * Set the switches by hand rather than through setEnabled().
 *
 * setEnabled goes to the network and refuses while `available` is false, which
 * would make every test below a test of the write path. What these tests are
 * about is the READ — what the rest of the app does with an answer that is
 * already in the store.
 */
function switches(enabled: Record<string, boolean>) {
  useExtensionsStore.setState({ available: true, configsLoaded: true, enabled, configs: {} });
}

const command = (id: string) => {
  const found = STATIC_COMMANDS.find((c) => c.id === id);
  if (!found) throw new Error(`no command ${id} — ids are permanent, so this is a rename`);
  return found;
};

beforeEach(() => {
  useExtensionsStore.getState().reset();
  useUIStore.setState({ activeDialog: null });
});

afterEach(cleanup);

/* ── the manifest's own claims ───────────────────────────────────────────── */

describe('the catalogue says what goes quiet', () => {
  /**
   * A test cannot prove a sentence describes the code — only the per-feature
   * suites below can do that. What it CAN do is refuse an extension that never
   * wrote the sentence, which is the state the three workspace entries were
   * added out of: a feature nobody had enumerated the reach points of.
   */
  it('gives every extension a non-empty inert list', () => {
    for (const extension of OFFICIAL_EXTENSIONS) {
      expect(extension.inert.length, `${extension.slug} declares nothing goes quiet`)
        .toBeGreaterThan(0);
      for (const line of extension.inert) {
        expect(line.trim().length, `${extension.slug} has an empty inert line`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The settings switch draws its unwritten state from `defaultValue`, the app
   * behaves off `defaultEnabled`. Disagree and the row shows the opposite of
   * what the app is doing for every account that has never touched it.
   */
  it('mirrors defaultEnabled in the switch the pane draws', () => {
    for (const extension of OFFICIAL_EXTENSIONS) {
      const rows = settingsForPane(extensionPaneId(extension.slug)).filter(
        (r) => r.control === 'switch'
      );
      expect(rows.length, `${extension.slug} has no switch in its pane`).toBeGreaterThan(0);
      expect(rows[0].defaultValue, `${extension.slug} draws the wrong default`).toBe(
        extension.defaultEnabled
      );
    }
  });

  it('ships the workspace tier ON, because these features already exist for everyone', () => {
    for (const slug of [EXT_FEEDBACK, EXT_GUIDED_TOUR, EXT_BULK_PASTE]) {
      expect(extensionManifest(slug)?.defaultEnabled, `${slug} would go dark on deploy`).toBe(true);
    }
  });
});

/**
 * The half that must NOT change when a switch flips.
 *
 * Written as a loop over the three workspace slugs because the assertions are
 * identical by construction: the pane, the row and the search hit are all
 * derived from the catalog entry, so anything that removed one for an off
 * extension would remove it for all three.
 */
describe.each([
  { slug: EXT_FEEDBACK, term: 'feedback' },
  { slug: EXT_GUIDED_TOUR, term: 'tour' },
  { slug: EXT_BULK_PASTE, term: 'paste' },
])('$slug stays in the catalogue while off', ({ slug, term }) => {
  beforeEach(() => switches({ [slug]: false }));

  it('keeps its manifest entry', () => {
    expect(extensionManifest(slug)).toBeTruthy();
    expect(OFFICIAL_EXTENSIONS.some((e) => e.slug === slug)).toBe(true);
  });

  it('keeps its own settings pane, with at least one row in it', () => {
    const pane = extensionPaneId(slug);
    expect(EXTENSION_PANES.some((p) => p.id === pane)).toBe(true);
    expect(paneById(pane)).toBeTruthy();
    expect(settingsForPane(pane).length).toBeGreaterThan(0);
  });

  it('is still findable by settings search', () => {
    const hits = searchSettings(term, settingCtx).settings.map((h) => h.record.id);
    expect(hits).toContain(`extensions.${slug}`);
  });

  it('draws a switch that reads OFF rather than disappearing', () => {
    const row = settingById(`extensions.${slug}`);
    expect(row?.control).toBe('switch');
    expect(row?.read(settingCtx)).toBe(false);
    // Not `unavailable` — that reason is for a deployment that cannot have the
    // extension at all. A user's own switch being off is the row working.
    expect(row?.unavailable?.(settingCtx) ?? null).toBeNull();
  });
});

/* ── Send feedback ───────────────────────────────────────────────────────── */

describe('Send feedback, switched off, does nothing', () => {
  it('does not offer the palette row', () => {
    switches({ [EXT_FEEDBACK]: false });
    expect(isHidden(command('app.feedback'), commandCtx)).toBe(true);

    switches({ [EXT_FEEDBACK]: true });
    expect(isHidden(command('app.feedback'), commandCtx)).toBe(false);
  });

  /**
   * The keyboard half, and it is a DIFFERENT gate from the one above:
   * hooks/use-command-shortcuts.ts never asks `hidden`, it asks `isAvailable`,
   * and it returns on a false answer BEFORE preventDefault — so `?` stops being
   * claimed and falls through instead of being swallowed into nothing.
   */
  it('does not claim the ? binding', () => {
    switches({ [EXT_FEEDBACK]: false });
    expect(isAvailable(command('app.feedback'), commandCtx)).toBe(false);

    switches({ [EXT_FEEDBACK]: true });
    expect(isAvailable(command('app.feedback'), commandCtx)).toBe(true);
  });

  /**
   * The claim the two gates above only IMPLY, asserted at the dispatcher.
   *
   * `defaultPrevented` is the whole point: hooks/use-command-shortcuts.ts
   * returns on an unavailable command BEFORE preventDefault, so `?` reaches
   * whatever would have handled it next instead of being eaten by a feature
   * that is switched off. A gate that swallowed the key and then did nothing
   * would pass every other test in this file.
   */
  it('lets ? through to the page instead of swallowing it', () => {
    const press = () => {
      const event = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '?', bubbles: true }));
      return event.defaultPrevented;
    };
    function Harness() {
      useCommandShortcuts(commandCtx);
      return null;
    }

    switches({ [EXT_FEEDBACK]: false });
    render(<Harness />);
    expect(press()).toBe(false);
    expect(useUIStore.getState().activeDialog).toBeNull();

    cleanup();
    switches({ [EXT_FEEDBACK]: true });
    render(<Harness />);
    expect(press()).toBe(true);
    expect(useUIStore.getState().activeDialog?.type).toBe('bug-report');
  });

  it('keeps the report_bug binding id, so a rebinding still resolves', () => {
    // The command is gated, never moved out of STATIC_COMMANDS — that is what
    // keeps DEFAULT_SHORTCUTS (derived statically) listing it in the shortcuts
    // modal while the extension is off.
    expect(command('app.feedback').shortcut?.id).toBe('report_bug');
  });

  it('shows no feedback row in the account menu', () => {
    // Radix's DropdownMenuTrigger opens on POINTERDOWN, not click — a click
    // alone leaves the menu shut and the OFF assertion passes for the wrong
    // reason, which is why the ON case is asserted in the same test.
    const openMenu = () =>
      fireEvent.pointerDown(screen.getByLabelText('User menu'), {
        button: 0,
        ctrlKey: false,
      });

    switches({ [EXT_FEEDBACK]: false });
    render(<UserProfileDropdown onOpenSettings={() => {}} onOpenBugReport={() => {}} />);
    openMenu();
    // The menu really is open — the Settings row proves it — and the feedback
    // row is the only thing missing from it.
    expect(screen.queryByText('Settings')).not.toBeNull();
    expect(screen.queryByTestId('user-menu-bug-report')).toBeNull();

    cleanup();
    switches({ [EXT_FEEDBACK]: true });
    render(<UserProfileDropdown onOpenSettings={() => {}} onOpenBugReport={() => {}} />);
    openMenu();
    expect(screen.queryByTestId('user-menu-bug-report')).not.toBeNull();
  });

  it('says why on the Anchor pane instead of opening the form', () => {
    switches({ [EXT_FEEDBACK]: false });
    const row = settingById('anchor.feedback');
    // Present and searchable — the row is NOT removed, it is disabled with a
    // reason that names where the switch lives.
    expect(row).toBeTruthy();
    expect(row?.unavailable?.(settingCtx)).toMatch(/Extensions/);

    switches({ [EXT_FEEDBACK]: true });
    expect(row?.unavailable?.(settingCtx)).toBeNull();
  });

  /**
   * The server half. Without it "off" is a UI decision, and a UI decision is
   * not inertness — a stale tab or a replayed request would still file an issue
   * under this account's name.
   */
  describe('the route refuses a signed-in author', () => {
    const reader = (row: { enabled?: boolean } | null, error: unknown = null) => ({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }),
        }),
      }),
    });

    it('reads an explicit off row as off', async () => {
      expect(await serverExtensionOn(reader({ enabled: false }), 'u1', EXT_FEEDBACK)).toBe(false);
    });

    it('reads an explicit on row as on', async () => {
      expect(await serverExtensionOn(reader({ enabled: true }), 'u1', EXT_FEEDBACK)).toBe(true);
    });

    /**
     * Sparse rows: no row is "never touched", not "off". Reading `enabled`
     * straight off a missing row would refuse every existing user of a
     * default-ON extension — which is all of them, on the deploy that adds it.
     */
    it('reads no row as the manifest default, not as off', async () => {
      expect(await serverExtensionOn(reader(null), 'u1', EXT_FEEDBACK)).toBe(true);
    });

    it('falls back to the default when the table is missing', async () => {
      expect(await serverExtensionOn(reader(null, { code: '42P01' }), 'u1', EXT_FEEDBACK)).toBe(
        true
      );
    });
  });
});

/* ── Guided tour ─────────────────────────────────────────────────────────── */

describe('Guided tour, switched off, does nothing', () => {
  const tourProps = {
    userId: 'user-1',
    onComplete: () => {},
    onOpenSettings: () => {},
  };

  /**
   * Mounted for real, because "does nothing" is a claim about the EFFECTS: the
   * tour's body expands the chat panel, switches the mobile tab and paints a
   * `fixed inset-0` overlay the moment its hooks run. Asserting an empty
   * container is asserting that none of that happened.
   */
  it('never mounts, so it spotlights nothing and blocks nothing', () => {
    switches({ [EXT_GUIDED_TOUR]: false });
    const { container } = render(<OnboardingTour {...tourProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('still mounts when it is on', () => {
    switches({ [EXT_GUIDED_TOUR]: true });
    const { container } = render(<OnboardingTour {...tourProps} />);
    expect(container).not.toBeEmptyDOMElement();
  });

  it('says why on the Anchor pane instead of replaying', () => {
    switches({ [EXT_GUIDED_TOUR]: false });
    const row = settingById('anchor.tour');
    expect(row).toBeTruthy();
    expect(row?.unavailable?.(settingCtx)).toMatch(/Extensions/);

    switches({ [EXT_GUIDED_TOUR]: true });
    expect(row?.unavailable?.(settingCtx)).toBeNull();
  });
});

/* ── Paste a list ────────────────────────────────────────────────────────── */

describe('Paste a list, switched off, does nothing', () => {
  function seedBraindump() {
    usePlannerStore.setState({
      userId: 'user-1',
      userTimezone: 'UTC',
      items: [],
      tasks: [],
      habits: [],
      projects: [],
      habitGroups: [],
      routines: [],
      programs: [],
    });
    useViewStore.setState({
      braindumpGroupBy: 'none',
      braindumpSortBy: 'default',
      braindumpFilters: EMPTY_VIEW_FILTERS,
    });
  }

  /** Returns false when the handler called preventDefault. */
  const pasteTwoLines = (el: Element) =>
    fireEvent.paste(el, { clipboardData: { getData: () => 'first\nsecond' } });

  it('does not offer the palette row', () => {
    switches({ [EXT_BULK_PASTE]: false });
    expect(isHidden(command('create.bulk'), commandCtx)).toBe(true);
    expect(isAvailable(command('create.bulk'), commandCtx)).toBe(false);

    switches({ [EXT_BULK_PASTE]: true });
    expect(isHidden(command('create.bulk'), commandCtx)).toBe(false);
    expect(isAvailable(command('create.bulk'), commandCtx)).toBe(true);
  });

  it('opens nothing from openBulkAdd, so no caller can route around the gate', () => {
    switches({ [EXT_BULK_PASTE]: false });
    openBulkAdd({ text: 'first\nsecond' });
    expect(useUIStore.getState().activeDialog).toBeNull();

    switches({ [EXT_BULK_PASTE]: true });
    openBulkAdd({ text: 'first\nsecond' });
    expect(useUIStore.getState().activeDialog?.type).toBe('bulk-add');
  });

  /**
   * The braindump's capture field, mounted for real.
   *
   * `notCancelled` is the assertion that matters and the one a mock cannot
   * make: inert here means the paste FALLS THROUGH to the browser, so the two
   * lines land in the field the way they would in any other app. A handler that
   * called preventDefault and then declined to open the dialog would pass a
   * "no dialog opened" test while silently eating the user's paste.
   */
  it('lets a multi-line paste fall through to the browser', () => {
    switches({ [EXT_BULK_PASTE]: false });
    seedBraindump();
    render(
      <DndContext>
        <Braindump />
      </DndContext>
    );

    const notCancelled = pasteTwoLines(screen.getByTestId('braindump-quick-add-input'));
    expect(notCancelled).toBe(true);
    expect(useUIStore.getState().activeDialog).toBeNull();
  });

  it('still intercepts it when it is on', () => {
    switches({ [EXT_BULK_PASTE]: true });
    seedBraindump();
    render(
      <DndContext>
        <Braindump />
      </DndContext>
    );

    const notCancelled = pasteTwoLines(screen.getByTestId('braindump-quick-add-input'));
    expect(notCancelled).toBe(false);
    expect(useUIStore.getState().activeDialog?.type).toBe('bulk-add');
  });
});
