import { describe, it, expect } from 'vitest';
import {
  entriesFromRows,
  entryLabel,
  groupByDay,
  outstandingTotals,
  payees,
  since,
  type LedgerRowFromDb,
} from '@/lib/stakes/ledger';

const row = (over: Partial<LedgerRowFromDb> = {}): LedgerRowFromDb => ({
  id: 'e1',
  date: '2026-08-10',
  subject: 'h1',
  subject_title: 'Vitamins',
  kind: 'miss',
  channel: 'pledge',
  amount_cents: 1000,
  currency: 'GBP',
  detail: 'A cause I hate',
  committed_at: '2026-08-11T03:00:00Z',
  ...over,
});

describe('entriesFromRows', () => {
  it('maps a row into the reader’s shape', () => {
    const [entry] = entriesFromRows([row()]);
    expect(entry).toMatchObject({
      id: 'e1', date: '2026-08-10', subjectTitle: 'Vitamins', kind: 'miss',
      channel: 'pledge', amountCents: 1000, currency: 'GBP',
    });
  });

  // A kind this version does not know about must not invent a debt.
  it('reads an unknown kind as a hit, never a miss', () => {
    const [entry] = entriesFromRows([row({ kind: 'refunded' })]);
    expect(entry.kind).toBe('hit');
  });

  it('normalises a missing amount to null rather than 0', () => {
    const [entry] = entriesFromRows([row({ amount_cents: null })]);
    expect(entry.amountCents).toBeNull();
  });
});

describe('outstandingTotals', () => {
  // The load-bearing distinction: only a PLEDGE MISS is money.
  it('counts only pledge misses', () => {
    const totals = outstandingTotals(
      entriesFromRows([
        row({ id: 'a' }),
        row({ id: 'b', kind: 'hit', amount_cents: 5000 }),
        row({ id: 'c', channel: 'beeminder', kind: 'hit', amount_cents: null, detail: 'vits' }),
        row({ id: 'd', channel: 'accountability-partner', subject: 'day', amount_cents: null }),
      ]),
    );
    expect(totals).toEqual([{ currency: 'GBP', cents: 1000, misses: 1 }]);
  });

  // Never converted: an exchange rate is a number this app would be inventing,
  // and a total that moved because a rate did is not a ledger.
  it('keeps currencies apart', () => {
    const totals = outstandingTotals(
      entriesFromRows([
        row({ id: 'a', amount_cents: 1000, currency: 'GBP' }),
        row({ id: 'b', amount_cents: 2500, currency: 'USD' }),
        row({ id: 'c', amount_cents: 500, currency: 'GBP' }),
      ]),
    );
    expect(totals).toEqual([
      { currency: 'USD', cents: 2500, misses: 1 },
      { currency: 'GBP', cents: 1500, misses: 2 },
    ]);
  });

  it('is empty when nothing is owed', () => {
    expect(outstandingTotals(entriesFromRows([row({ kind: 'hit' })]))).toEqual([]);
  });
});

describe('payees', () => {
  it('lists each payee once, most-owed first', () => {
    const list = payees(
      entriesFromRows([
        row({ id: 'a', detail: 'Small Cause', amount_cents: 500 }),
        row({ id: 'b', detail: 'Big Cause', amount_cents: 4000 }),
        row({ id: 'c', detail: 'Big Cause', amount_cents: 1000 }),
      ]),
    );
    expect(list).toEqual(['Big Cause', 'Small Cause']);
  });

  it('ignores a pledge with no named payee', () => {
    expect(payees(entriesFromRows([row({ detail: null })]))).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('puts the newest day first and misses before hits', () => {
    const days = groupByDay(
      entriesFromRows([
        row({ id: 'a', date: '2026-08-09' }),
        row({ id: 'b', date: '2026-08-10', kind: 'hit', subject_title: 'Reading' }),
        row({ id: 'c', date: '2026-08-10', subject_title: 'Stretching' }),
      ]),
    );
    expect(days.map((d) => d.date)).toEqual(['2026-08-10', '2026-08-09']);
    expect(days[0].entries.map((e) => e.subjectTitle)).toEqual(['Stretching', 'Reading']);
    expect(days[0]).toMatchObject({ hits: 1, misses: 1 });
    expect(days[0].owed).toEqual([{ currency: 'GBP', cents: 1000, misses: 1 }]);
  });

  it('is empty for no rows', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('since', () => {
  it('keeps the boundary day', () => {
    const entries = entriesFromRows([
      row({ id: 'a', date: '2026-08-09' }),
      row({ id: 'b', date: '2026-08-10' }),
      row({ id: 'c', date: '2026-08-11' }),
    ]);
    expect(since(entries, '2026-08-10').map((e) => e.id)).toEqual(['b', 'c']);
  });
});

describe('entryLabel', () => {
  it('names a whole-day row as the day', () => {
    const [entry] = entriesFromRows([row({ subject: 'day', subject_title: 'day' })]);
    expect(entryLabel(entry)).toBe('The day');
  });

  // The snapshot, not a live lookup — the ledger has to read correctly after a
  // rename or a delete.
  it('uses the recorded title for an item row', () => {
    const [entry] = entriesFromRows([row({ subject_title: 'Vitamins' })]);
    expect(entryLabel(entry)).toBe('Vitamins');
  });
});
