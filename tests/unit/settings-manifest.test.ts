import { describe, it, expect, vi } from 'vitest';

// The manifest imports the stores, which import the Supabase client. Nothing
// here exercises a write path — these are structural assertions over data.
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import {
  SETTINGS,
  DESTINATIONS,
  PANES,
  settingById,
  isPaneId,
  displayValue,
  valueLabels,
  type SettingCtx,
} from '@/lib/settings/manifest';
import { searchSettings, paneRows, queryTerms, highlightRuns } from '@/lib/settings/search';
import { STATIC_COMMANDS } from '@/lib/commands/registry';
import type { CommandContext } from '@/lib/commands/types';

const ctx: SettingCtx = {
  theme: 'system',
  setTheme: () => {},
  userId: 'test-user',
};

describe('settings manifest — structure', () => {
  it('every id is unique', () => {
    const ids = SETTINGS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id is dotted and stable-looking', () => {
    // Two shapes, both permanent — these ids are the deep links and the e2e
    // handles, so the point of this test is that they look DELIBERATE, not that
    // they are short.
    //
    //   pane.setting                      — a hand-written record.
    //   extensions.<slug>[.<field>]       — a record generated per extension in
    //                                       channelRecords(). The slug segment
    //                                       is the extension's own permanent
    //                                       slug, which is kebab-case by the
    //                                       user_extensions CHECK constraint,
    //                                       so hyphens are admitted HERE and
    //                                       nowhere else.
    for (const s of SETTINGS) {
      expect(s.id, s.id).toMatch(/^[a-z]+\.[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9]*)?$/);
    }
  });

  it('every record lands in a real pane', () => {
    for (const s of SETTINGS) {
      expect(isPaneId(s.pane), `${s.id} → ${s.pane}`).toBe(true);
    }
  });

  it('every pane has at least one record on EVERY platform — no empty rooms', () => {
    // Through the real filter, on both platforms. Asserting against raw
    // SETTINGS passed while the Keyboard pane — whose only record was
    // desktopOnly — was empty on every phone, with the rail still offering it.
    for (const pane of PANES) {
      for (const isMobile of [false, true]) {
        const { rows, advanced } = paneRows(pane.id, { isMobile });
        expect(
          rows.length + advanced.length,
          `${pane.id} is empty (isMobile=${isMobile})`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('enum records declare options, and non-enums do not', () => {
    for (const s of SETTINGS) {
      if (s.control === 'enum') {
        expect(s.options?.length, `${s.id} has no options`).toBeGreaterThan(1);
      } else {
        expect(s.options, `${s.id} should not carry options`).toBeUndefined();
      }
    }
  });

  it('every enum default is one of its own option values', () => {
    for (const s of SETTINGS) {
      if (s.control !== 'enum') continue;
      const values = s.options!.map((o) => o.value);
      expect(values, `${s.id} default ${String(s.defaultValue)}`).toContain(String(s.defaultValue));
    }
  });

  it('every dependsOn points at a real record in the same pane', () => {
    for (const s of SETTINGS) {
      if (!s.dependsOn) continue;
      const parent = settingById(s.dependsOn);
      expect(parent, `${s.id} depends on missing ${s.dependsOn}`).toBeDefined();
      expect(parent!.pane, `${s.id} depends across panes`).toBe(s.pane);
    }
  });

  it('keywords are hand-authored, lowercase, and never just the label', () => {
    for (const s of SETTINGS) {
      expect(s.keywords.length, `${s.id} has no keywords`).toBeGreaterThan(2);
      for (const k of s.keywords) {
        expect(k, `${s.id}: "${k}"`).toBe(k.toLowerCase());
        expect(k.trim(), `${s.id} has a blank keyword`).not.toBe('');
      }
      expect(
        s.keywords.some((k) => k === s.label.toLowerCase()),
        `${s.id} duplicates its own label as a keyword`
      ).toBe(false);
    }
  });

  it('aliases are single lowercase words', () => {
    for (const s of SETTINGS) {
      for (const a of s.aliases ?? []) {
        expect(a, `${s.id}: "${a}"`).toMatch(/^[a-z0-9]+$/);
      }
    }
  });

  it('no record is both advanced and a dependent row', () => {
    // A dependent row that only appears behind a disclosure is two levels of
    // hiding for one control — the nesting the redesign exists to remove.
    for (const s of SETTINGS) {
      expect(!(s.advanced && s.dependsOn), `${s.id} is advanced AND dependent`).toBe(true);
    }
  });
});

describe('settings manifest — persistence contract', () => {
  it('show_completed_tasks keeps the column name the e2e suite selects on', () => {
    // tests/e2e/settings.spec.ts reaches this switch through
    // data-setting="show_completed_tasks". Renaming it breaks the suite
    // silently — the switch is simply never found.
    const record = settingById('look.showCompleted');
    expect(record?.dbColumn).toBe('show_completed_tasks');
  });

  it('records that name a DB column use snake_case', () => {
    for (const s of SETTINGS) {
      if (!s.dbColumn) continue;
      expect(s.dbColumn, s.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('device-local settings declare no DB column', () => {
    // view-store and ai-settings-store have no user_settings columns at all.
    // Naming one here would put an unknown key into the debounced upsert, and
    // PostgREST fails the ENTIRE patch with PGRST204 — dropping every other
    // setting batched into the same flush.
    const localOnly = [
      'look.typeface',
      'look.buckets',
      'look.markStyle',
      'look.showPaused',
      'beacon.provider',
      'beacon.instructions',
      'beacon.apiKey',
      'beacon.model',
    ];
    for (const id of localOnly) {
      expect(settingById(id)?.dbColumn, `${id} must not name a column`).toBeUndefined();
    }
  });
});

describe('settings manifest — no drift with the command palette', () => {
  it('manifest aliases never collide with a command alias', () => {
    // The palette's settings.* group is still hand-declared, and its aliases
    // are globally unique under an exhaustive test. This is what stops the two
    // surfaces growing into a conflict before they are unified.
    const commandCtx: CommandContext = {
      theme: { resolved: 'light', value: 'system', set: () => {} },
      openChat: () => {},
      userId: 'test-user',
      isMobile: false,
    };

    const commandAliases = new Set(
      STATIC_COMMANDS.flatMap((c) => [
        ...(c.aliases ?? []),
        // Enum commands flatten their option values into the SAME namespace
        // (/dark, /light, /system), so those count as claimed too.
        ...(c.argument?.kind === 'enum'
          ? c.argument.options(commandCtx).flatMap((o) => o.aliases ?? [])
          : []),
      ])
    );
    for (const s of SETTINGS) {
      for (const a of s.aliases ?? []) {
        expect(commandAliases.has(a), `alias "${a}" (${s.id}) is already a command alias`).toBe(
          false
        );
      }
    }
  });

  it('destination ids are unique and disjoint from setting ids', () => {
    const ids = DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DESTINATIONS) {
      expect(settingById(d.id), `${d.id} collides with a setting`).toBeUndefined();
    }
  });
});

describe('settings search', () => {
  it('splits and lowercases the query — scoreText only lowercases the text', () => {
    expect(queryTerms('  Week  Start ')).toEqual(['week', 'start']);
  });

  it('finds a setting by its VALUE label, not just its own label', () => {
    // The most commonly forgotten field. "Sunday" is nowhere in the label
    // "Week starts on".
    const hits = searchSettings('sunday', ctx).settings.map((h) => h.record.id);
    expect(hits).toContain('day.weekStart');
  });

  it('finds a setting by the words you use when annoyed', () => {
    const hits = searchSettings('pile up', ctx).settings.map((h) => h.record.id);
    expect(hits).toContain('rituals.autoAge');
  });

  it('ANDs multiple terms across different fields', () => {
    // "week" comes from the label, "start" from the label too — but the pair
    // must not match records that only carry one of them.
    const hits = searchSettings('week starts', ctx).settings.map((h) => h.record.id);
    expect(hits).toContain('day.weekStart');
    expect(hits).not.toContain('look.theme');
  });

  it('a label hit outranks a description-only hit', () => {
    const { settings } = searchSettings('theme', ctx);
    expect(settings[0]?.record.id).toBe('look.theme');
  });

  it('excludes advanced rows unless asked', () => {
    const plain = searchSettings('resize', ctx).settings.map((h) => h.record.id);
    expect(plain).not.toContain('look.markStyle');

    const withAdv = searchSettings('resize', ctx, { includeAdvanced: true }).settings.map(
      (h) => h.record.id
    );
    expect(withAdv).toContain('look.markStyle');
  });

  it('does not index desktop-only rows on mobile', () => {
    // A result that deep-links to a row which will never render is
    // indistinguishable from a bug.
    const hits = searchSettings('sidebar', ctx, {
      includeAdvanced: true,
      isMobile: true,
    }).settings.map((h) => h.record.id);
    expect(hits).not.toContain('look.sidebarHover');
  });

  it('surfaces destinations for configuration that lives elsewhere', () => {
    // The whole reason the rail can stay at six panes.
    const { destinations } = searchSettings('program', ctx);
    expect(destinations.map((d) => d.record.id)).toContain('dest.programs');
  });

  it('the per-pane counts add up and name only panes that actually have hits', () => {
    // NOT `total === settings.length` — search.ts builds both from the same
    // array, so that assertion can never fail. `counts` is the field with a
    // consumer: the rail renders `counts[p.id] ?? 0` and dims a pane at zero.
    const result = searchSettings('time', ctx);
    expect(result.settings.length).toBeGreaterThan(0);
    expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(result.total);
    for (const [pane, n] of Object.entries(result.counts)) {
      expect(n, `${pane} is in counts with zero hits`).toBeGreaterThan(0);
      expect(result.settings.some((h) => h.record.pane === pane)).toBe(true);
    }
  });

  it('an advanced row can still be reached by typing its exact label', () => {
    // The escape hatch: `terms` is split on whitespace, so comparing against
    // terms[0] made this unreachable for every multi-word advanced label.
    const hits = searchSettings('schedule handles', ctx).settings.map((h) => h.record.id);
    expect(hits).toContain('look.markStyle');
  });

  it('names the value that actually matched, including on the reverse-word tier', () => {
    // 'mondays' matches the option 'Monday' only through scoreText's
    // reverse-word tier, where a plain includes() is false — which is exactly
    // the case the "matches: …" subline exists to explain.
    const hit = searchSettings('mondays', ctx).settings.find(
      (h) => h.record.id === 'day.weekStart'
    );
    expect(hit).toBeDefined();
    expect(hit!.matchedValue).toBe('Monday');
  });

  it('does not explain a value that is already the one on screen', () => {
    // The stored default is Sunday, so surfacing "matches: Sunday" would be
    // noise next to a chip already reading Sunday.
    const hit = searchSettings('sundays', ctx).settings.find(
      (h) => h.record.id === 'day.weekStart'
    );
    expect(hit).toBeDefined();
    expect(hit!.matchedValue).toBeUndefined();
  });

  it('tolerates a transposition, which is the most common typo there is', () => {
    const result = searchSettings('thmee', ctx);
    expect(result.didYouMean).toBe(true);
    expect(result.settings.map((h) => h.record.id)).toContain('look.theme');
  });

  it('returns nothing for a query that means nothing here', () => {
    const result = searchSettings('quiet hours', ctx);
    expect(result.settings).toHaveLength(0);
    expect(result.destinations).toHaveLength(0);
  });

  it('falls back to one-edit matches ONLY when the strict pass is empty', () => {
    const typo = searchSettings('thene', ctx);
    expect(typo.didYouMean).toBe(true);
    expect(typo.settings.map((h) => h.record.id)).toContain('look.theme');

    // …and never interleaves them into a list that already has strict hits.
    expect(searchSettings('theme', ctx).didYouMean).toBe(false);
  });

  it('an empty query is not a search', () => {
    expect(searchSettings('   ', ctx).total).toBe(0);
  });
});

describe('highlighting', () => {
  it('slices ranges rather than replacing text', () => {
    const runs = highlightRuns('Week starts on', [[0, 4]]);
    expect(runs).toEqual([
      { text: 'Week', hit: true },
      { text: ' starts on', hit: false },
    ]);
  });

  it('merges overlapping ranges from multiple terms', () => {
    const runs = highlightRuns('Time format', [
      [0, 4],
      [2, 6],
    ]);
    expect(runs.filter((r) => r.hit)).toHaveLength(1);
    expect(runs.map((r) => r.text).join('')).toBe('Time format');
  });

  it('never drops characters', () => {
    for (const s of SETTINGS) {
      const runs = highlightRuns(s.label, [[1, 3]]);
      expect(runs.map((r) => r.text).join(''), s.id).toBe(s.label);
    }
  });
});

describe('value display', () => {
  it('renders an enum by its label, not its stored value', () => {
    const record = settingById('look.buckets')!;
    // The stored value stays 'spine' forever — renaming it to match the label
    // would reset every user's choice.
    expect(displayValue(record, 'spine')).toBe('Threaded seam');
  });

  it('renders a switch as On/Off', () => {
    const record = settingById('look.showCompleted')!;
    expect(displayValue(record, true)).toBe('On');
    expect(displayValue(record, false)).toBe('Off');
  });

  it('exposes every value label to the index', () => {
    expect(valueLabels(settingById('day.timeFormat')!)).toEqual(['12-hour', '24-hour']);
  });
});
