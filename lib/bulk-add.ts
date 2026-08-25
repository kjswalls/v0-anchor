/**
 * Bulk add: turn pasted text or an exported file into item drafts.
 *
 * Pure functions only — no store imports, no DOM. The surfaces (braindump
 * quick-add, omnibar, item dialog) detect a multi-line paste with
 * `splitBulkLines` and hand the raw text to the bulk-add dialog; the dialog
 * re-parses on every edit, so this module is the single opinion on what a
 * "line" and a "column" mean.
 */

/** One item-to-be. `startDate` is yyyy-MM-dd, same contract as the store. */
export interface BulkDraft {
  title: string;
  notes?: string;
  startDate?: string;
}

/**
 * Hard ceiling on how many drafts a single paste or file can produce. A
 * mis-paste of a whole document should degrade to "the first 500 lines",
 * not to a thousand webhook-emitting inserts. Callers surface `truncated`
 * rather than silently dropping the tail.
 */
export const MAX_BULK_ITEMS = 500;

/**
 * List markers people paste from other apps: `-`, `*`, `+`, `•`, `–`, `—`,
 * GitHub/Notion checkboxes (`- [ ]`, `* [x]`), and numbered lists (`1.`,
 * `2)`). Stripped once, not recursively — a title that itself starts with a
 * dash after its marker ("- - hello") keeps the second dash, because guessing
 * twice mangles more titles than it cleans.
 */
const LIST_MARKER =
  /^\s*(?:[-*+•–—]\s*\[[ xX]\]|[-*+•–—]|\d{1,3}[.)])\s+/;

/**
 * Split free text into one title per non-empty line, list markers stripped.
 * The result is capped at MAX_BULK_ITEMS; use `splitBulkLinesWithMeta` when
 * the caller needs to say so.
 */
export function splitBulkLines(text: string): string[] {
  return splitBulkLinesWithMeta(text).titles;
}

export function splitBulkLinesWithMeta(text: string): {
  titles: string[];
  truncated: boolean;
} {
  const titles = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter((line) => line.length > 0);
  return {
    titles: titles.slice(0, MAX_BULK_ITEMS),
    truncated: titles.length > MAX_BULK_ITEMS,
  };
}

/**
 * Whether a paste should be offered as a bulk add: two or more lines survive
 * parsing. One line — however long — is a normal paste and stays in the input.
 */
export function isBulkPaste(text: string): boolean {
  return text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.replace(LIST_MARKER, '').trim().length > 0)
    .length > 1;
}

/* ── CSV ─────────────────────────────────────────────────────────────────── */

/**
 * Minimal RFC 4180 parser — quoted fields, doubled-quote escapes, newlines
 * inside quotes, CRLF rows. Delimiter is a parameter so `.tsv` rides the same
 * code. Deliberately not a dependency: the grammar is a page long and the
 * failure mode of a heavy parser (silently coercing types) is worse than the
 * failure mode of this one (a weird cell stays a string).
 */
export function parseDelimited(text: string, delimiter: ',' | '\t' = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let sawAny = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    // A blank line between records parses as [''] — drop it rather than
    // manufacturing an empty draft.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    sawAny = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      // Strict RFC 4180 wants the quote flush against the delimiter, but
      // hand-edited CSVs write `a, "b,c"` — treat whitespace-so-far as
      // padding, not content, or the quote turns literal and the embedded
      // comma shifts every later column.
      cell = '';
      inQuotes = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (sawAny && (cell !== '' || row.length > 0)) endRow();
  return rows;
}

/* ── column mapping ──────────────────────────────────────────────────────── */

/** Header names that mean "this column is the title", across common exports:
 *  Todoist (CONTENT), TickTick (Title), generic sheets (Task/Name/Item). */
const TITLE_HEADERS = /^(title|content|name|task|item|summary|text)$/i;
const NOTES_HEADERS = /^(notes?|descriptions?|desc|details?|body|comment)$/i;
const DATE_HEADERS = /^(date|due|due date|duedate|start date|startdate|start|when|scheduled|do date)$/i;

/**
 * Normalise a date cell to yyyy-MM-dd. Accepts ISO (with or without a time
 * suffix) and M/D/YYYY. Anything else — including the natural-language dates
 * Todoist exports ("every day") — returns undefined and the item simply lands
 * in the braindump, which is the safe reading of a date we can't honour.
 */
export function normalizeBulkDate(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (iso) {
    const [, y, m, d] = iso;
    return validYmd(+y, +m, +d) ? `${y}-${m}-${d}` : undefined;
  }

  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return validYmd(+y, +m, +d)
      ? `${y}-${String(+m).padStart(2, '0')}-${String(+d).padStart(2, '0')}`
      : undefined;
  }

  return undefined;
}

const validYmd = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export interface BulkTableResult {
  drafts: BulkDraft[];
  truncated: boolean;
  /** True when a header row was recognised and mapped (vs. first-column guess). */
  mappedHeader: boolean;
  /** True when any draft carries notes or a date — i.e. the table brought
   *  structure a plain textarea can't represent. */
  structured: boolean;
}

/**
 * Map parsed rows to drafts.
 *
 * With a recognisable header row: title column required, notes/date columns
 * optional. Without one: the first column is the title and the rest are
 * ignored — predictable beats clever for a file we didn't write. Empty titles
 * drop their whole row (a dateless title is an item; a title-less date is
 * noise).
 */
export function rowsToDrafts(rows: string[][]): BulkTableResult {
  if (rows.length === 0) {
    return { drafts: [], truncated: false, mappedHeader: false, structured: false };
  }

  const header = rows[0].map((cell) => cell.trim());
  const titleCol = header.findIndex((cell) => TITLE_HEADERS.test(cell));
  const mappedHeader = titleCol !== -1;
  const notesCol = mappedHeader ? header.findIndex((cell) => NOTES_HEADERS.test(cell)) : -1;
  const dateCol = mappedHeader ? header.findIndex((cell) => DATE_HEADERS.test(cell)) : -1;

  const body = mappedHeader ? rows.slice(1) : rows;
  const pick = mappedHeader ? titleCol : 0;

  const drafts: BulkDraft[] = [];
  for (const row of body) {
    const title = (row[pick] ?? '').trim();
    if (!title) continue;
    const draft: BulkDraft = { title };
    if (notesCol !== -1) {
      const notes = (row[notesCol] ?? '').trim();
      if (notes) draft.notes = notes;
    }
    if (dateCol !== -1) {
      const startDate = normalizeBulkDate(row[dateCol] ?? '');
      if (startDate) draft.startDate = startDate;
    }
    drafts.push(draft);
  }

  // Capped first, described second: `structured` is a claim about the drafts
  // we RETURN, and a date that only occurs past the cap must not send the
  // dialog down the read-only table path for what is effectively a flat list.
  const capped = drafts.slice(0, MAX_BULK_ITEMS);
  return {
    drafts: capped,
    truncated: drafts.length > MAX_BULK_ITEMS,
    mappedHeader,
    structured: capped.some((d) => d.notes !== undefined || d.startDate !== undefined),
  };
}

/**
 * Parse an imported file by extension. `.csv`/`.tsv` go through the table
 * path; everything else is treated as plain text, one item per line.
 */
export function parseImportFile(name: string, text: string): BulkTableResult {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv' || ext === 'tsv') {
    return rowsToDrafts(parseDelimited(text, ext === 'tsv' ? '\t' : ','));
  }
  const { titles, truncated } = splitBulkLinesWithMeta(text);
  return {
    drafts: titles.map((title) => ({ title })),
    truncated,
    mappedHeader: false,
    structured: false,
  };
}
