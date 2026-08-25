/**
 * stakes/ledger.ts — reading the record back.
 *
 * `stake_events` had no reader. The pledge tier's whole claim is that "you owe
 * £30" is backed by rows a person can look at, and until this existed that
 * number only ever arrived as a notification — which is exactly the shape of a
 * commitment device you stop believing. A ledger nobody can open is a number an
 * app made up.
 *
 * Pure and string-based, like day.ts and due.ts, so the totals are testable
 * without a database and the page stays a renderer.
 *
 * WHAT IS AND IS NOT A DEBT. Only PLEDGE MISSES carry money. A Beeminder row is
 * a datapoint that went up, a partner row is a digest that went out, and a hit
 * is a day that went well — all three belong in the record and none of them
 * belongs in the total. Summing "events" instead of pledge misses is how a
 * ledger quietly becomes wrong in the user's favour and then, once, badly
 * against it.
 */

export type StakeChannel = 'beeminder' | 'pledge' | 'accountability-partner' | (string & {})

export interface LedgerEntry {
  id: string
  /** Local day, yyyy-MM-dd. */
  date: string
  /** Item id, or the literal 'day'. */
  subject: string
  subjectTitle: string
  kind: 'hit' | 'miss'
  channel: StakeChannel
  amountCents: number | null
  currency: string | null
  detail: string | null
  /** ISO instant the outside-world side effect happened, or null. */
  committedAt: string | null
}

/** The shape PostgREST hands back, before it is anything. */
export interface LedgerRowFromDb {
  id: string
  date: string
  subject: string
  subject_title: string
  kind: string
  channel: string
  amount_cents: number | null
  currency: string | null
  detail: string | null
  committed_at: string | null
}

export const PLEDGE_CHANNEL = 'pledge'

export function entriesFromRows(rows: readonly LedgerRowFromDb[]): LedgerEntry[] {
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    subject: row.subject,
    subjectTitle: row.subject_title,
    // Constrained by a CHECK, so anything else is a row from a future version
    // of this table. Reading it as a miss would invent a debt; 'hit' is the
    // reading that cannot cost anyone money.
    kind: row.kind === 'miss' ? 'miss' : 'hit',
    channel: row.channel,
    amountCents: typeof row.amount_cents === 'number' ? row.amount_cents : null,
    currency: row.currency,
    detail: row.detail,
    committedAt: row.committed_at,
  }))
}

export interface CurrencyTotal {
  currency: string
  cents: number
  /** How many missed occurrences make it up. */
  misses: number
}

/**
 * What is owed, per currency.
 *
 * Per currency and not converted, deliberately: an exchange rate is a number
 * this app would have to invent, and a total that silently moved because a rate
 * did is not a ledger. Someone with pledges in two currencies owes two amounts.
 */
export function outstandingTotals(entries: readonly LedgerEntry[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>()
  for (const entry of entries) {
    if (entry.channel !== PLEDGE_CHANNEL || entry.kind !== 'miss') continue
    if (!entry.amountCents) continue
    const currency = entry.currency ?? 'USD'
    const running = byCurrency.get(currency) ?? { currency, cents: 0, misses: 0 }
    running.cents += entry.amountCents
    running.misses += 1
    byCurrency.set(currency, running)
  }
  return [...byCurrency.values()].sort((a, b) => b.cents - a.cents)
}

/** Everyone a pledge names as payee, most-owed first. */
export function payees(entries: readonly LedgerEntry[]): string[] {
  const owed = new Map<string, number>()
  for (const entry of entries) {
    if (entry.channel !== PLEDGE_CHANNEL || entry.kind !== 'miss') continue
    const who = entry.detail?.trim()
    if (!who) continue
    owed.set(who, (owed.get(who) ?? 0) + (entry.amountCents ?? 0))
  }
  return [...owed.entries()].sort((a, b) => b[1] - a[1]).map(([who]) => who)
}

export interface LedgerDay {
  date: string
  entries: LedgerEntry[]
  hits: number
  misses: number
  /** Pledge money recorded on this day, per currency. */
  owed: CurrencyTotal[]
}

/** Newest day first; within a day, misses before hits, then by title. */
export function groupByDay(entries: readonly LedgerEntry[]): LedgerDay[] {
  const byDate = new Map<string, LedgerEntry[]>()
  for (const entry of entries) {
    const bucket = byDate.get(entry.date)
    if (bucket) bucket.push(entry)
    else byDate.set(entry.date, [entry])
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, dayEntries]) => {
      const sorted = [...dayEntries].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'miss' ? -1 : 1
        return a.subjectTitle.localeCompare(b.subjectTitle)
      })
      return {
        date,
        entries: sorted,
        hits: sorted.filter((e) => e.kind === 'hit').length,
        misses: sorted.filter((e) => e.kind === 'miss').length,
        owed: outstandingTotals(sorted),
      }
    })
}

/** Entries on or after `sinceDate` (inclusive). Strings compare correctly. */
export function since(entries: readonly LedgerEntry[], sinceDate: string): LedgerEntry[] {
  return entries.filter((entry) => entry.date >= sinceDate)
}

/**
 * The one-line summary of a row, in the reader's terms.
 *
 * Written here rather than in the component because it is the same judgement
 * day.ts makes — what a row MEANS — and two places deciding that is how a
 * screen ends up describing a row the settlement recorded differently.
 */
export function entryLabel(entry: LedgerEntry): string {
  if (entry.subject === 'day') return 'The day'
  return entry.subjectTitle
}
