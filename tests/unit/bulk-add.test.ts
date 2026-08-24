import { describe, it, expect } from 'vitest';

/**
 * The bulk-add parsers — the single opinion on what a pasted "line" and an
 * imported "column" mean. Pure functions, so these pin behavior directly:
 * marker stripping, the two-line threshold, RFC 4180 quoting, header mapping,
 * and the dates-we-refuse policy (anything unparseable lands the item in the
 * braindump rather than guessing a day).
 */

import {
  MAX_BULK_ITEMS,
  isBulkPaste,
  normalizeBulkDate,
  parseDelimited,
  parseImportFile,
  rowsToDrafts,
  splitBulkLines,
  splitBulkLinesWithMeta,
} from '@/lib/bulk-add';

describe('splitBulkLines', () => {
  it('splits plain lines and drops empties', () => {
    expect(splitBulkLines('Buy milk\n\nCall the bank\n  \nWalk')).toEqual([
      'Buy milk',
      'Call the bank',
      'Walk',
    ]);
  });

  it('handles CRLF and bare CR', () => {
    expect(splitBulkLines('one\r\ntwo\rthree')).toEqual(['one', 'two', 'three']);
  });

  it('strips list markers: dashes, bullets, numbers, checkboxes', () => {
    expect(
      splitBulkLines(
        ['- dash', '* star', '+ plus', '• bullet', '– en', '1. first', '23) later', '- [ ] todo', '* [x] done'].join(
          '\n'
        )
      )
    ).toEqual(['dash', 'star', 'plus', 'bullet', 'en', 'first', 'later', 'todo', 'done']);
  });

  it('strips one marker only — a second dash is content', () => {
    expect(splitBulkLines('- - double')).toEqual(['- double']);
  });

  it('drops a marker-only row, keeps a bare dash as content', () => {
    // "- " alone parses to an empty title, and an empty title is not an item;
    // a lone "-" without trailing space is content, not a marker.
    expect(splitBulkLines('- real\n- \n-\n- also')).toEqual(['real', '-', 'also']);
  });

  it('does not treat an unspaced dash as a marker', () => {
    // "-9°C tomorrow" is a title, not a list row: the marker grammar requires
    // trailing whitespace.
    expect(splitBulkLines('-9 degrees\n- listed')).toEqual(['-9 degrees', 'listed']);
  });

  it(`caps at ${MAX_BULK_ITEMS} and says so`, () => {
    const text = Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => `line ${i}`).join('\n');
    const { titles, truncated } = splitBulkLinesWithMeta(text);
    expect(titles).toHaveLength(MAX_BULK_ITEMS);
    expect(truncated).toBe(true);
    expect(splitBulkLinesWithMeta('a\nb').truncated).toBe(false);
  });
});

describe('isBulkPaste', () => {
  it('is false for a single line, even with a trailing newline', () => {
    expect(isBulkPaste('just one thing')).toBe(false);
    expect(isBulkPaste('just one thing\n')).toBe(false);
  });

  it('is true for two or more content lines', () => {
    expect(isBulkPaste('one\ntwo')).toBe(true);
    expect(isBulkPaste('- a\n- b\n- c')).toBe(true);
  });

  it('is false when the extra lines are only markers or whitespace', () => {
    expect(isBulkPaste('one\n- \n  ')).toBe(false);
  });
});

describe('parseDelimited', () => {
  it('parses plain rows', () => {
    expect(parseDelimited('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('honours quoted commas, escaped quotes, and embedded newlines', () => {
    const text = '"one, two",plain\n"say ""hi""","line\nbreak"';
    expect(parseDelimited(text)).toEqual([
      ['one, two', 'plain'],
      ['say "hi"', 'line\nbreak'],
    ]);
  });

  it('handles CRLF rows and skips blank lines', () => {
    expect(parseDelimited('a,b\r\n\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('parses tabs when asked', () => {
    expect(parseDelimited('a\tb\nc\td', '\t')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('accepts the human-edited "delimiter, space, quote" form', () => {
    // Strict RFC 4180 forbids the padding space, but hand-written CSVs use it
    // constantly — a literal quote here would shift every later column.
    expect(parseDelimited('a, "b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });
});

describe('normalizeBulkDate', () => {
  it('accepts ISO, with or without a time suffix', () => {
    expect(normalizeBulkDate('2026-08-23')).toBe('2026-08-23');
    expect(normalizeBulkDate('2026-08-23T09:00:00Z')).toBe('2026-08-23');
  });

  it('accepts M/D/YYYY', () => {
    expect(normalizeBulkDate('8/23/2026')).toBe('2026-08-23');
    expect(normalizeBulkDate('12/1/2026')).toBe('2026-12-01');
  });

  it('refuses impossible and natural-language dates', () => {
    expect(normalizeBulkDate('2026-02-30')).toBeUndefined();
    expect(normalizeBulkDate('13/45/2026')).toBeUndefined();
    expect(normalizeBulkDate('every day')).toBeUndefined();
    expect(normalizeBulkDate('')).toBeUndefined();
  });
});

describe('rowsToDrafts', () => {
  it('maps a recognised header row: title, notes, date', () => {
    const result = rowsToDrafts([
      ['Title', 'Notes', 'Due Date'],
      ['Buy milk', 'whole', '2026-08-23'],
      ['Call bank', '', ''],
    ]);
    expect(result.mappedHeader).toBe(true);
    expect(result.structured).toBe(true);
    expect(result.drafts).toEqual([
      { title: 'Buy milk', notes: 'whole', startDate: '2026-08-23' },
      { title: 'Call bank' },
    ]);
  });

  it('reads Todoist-style headers (CONTENT / DESCRIPTION / DATE)', () => {
    const result = rowsToDrafts([
      ['TYPE', 'CONTENT', 'DESCRIPTION', 'DATE'],
      ['task', 'Water plants', 'the big ones', 'every day'],
    ]);
    // The natural-language date is refused, not guessed at.
    expect(result.drafts).toEqual([{ title: 'Water plants', notes: 'the big ones' }]);
  });

  it('takes the first column when no header is recognised — including row one', () => {
    const result = rowsToDrafts([
      ['Buy milk', 'extra'],
      ['Call bank', 'noise'],
    ]);
    expect(result.mappedHeader).toBe(false);
    expect(result.structured).toBe(false);
    expect(result.drafts.map((d) => d.title)).toEqual(['Buy milk', 'Call bank']);
  });

  it('drops rows with an empty title', () => {
    const result = rowsToDrafts([
      ['Title', 'Due Date'],
      ['', '2026-08-23'],
      ['Real', ''],
    ]);
    expect(result.drafts).toEqual([{ title: 'Real' }]);
  });

  it('describes only the drafts it returns — structure past the cap does not count', () => {
    // A date that occurs only in a row beyond MAX_BULK_ITEMS must not send
    // the dialog down the read-only table path for what is effectively a
    // flat list.
    const rows = [
      ['Title', 'Due Date'],
      ...Array.from({ length: MAX_BULK_ITEMS }, (_, i) => [`row ${i}`, '']),
      ['the straggler', '2026-08-23'],
    ];
    const result = rowsToDrafts(rows);
    expect(result.drafts).toHaveLength(MAX_BULK_ITEMS);
    expect(result.truncated).toBe(true);
    expect(result.structured).toBe(false);
  });
});

describe('parseImportFile', () => {
  it('routes .csv through the table path', () => {
    const result = parseImportFile('list.csv', 'Title,Notes\nBuy milk,whole');
    expect(result.drafts).toEqual([{ title: 'Buy milk', notes: 'whole' }]);
    expect(result.structured).toBe(true);
  });

  it('routes .tsv with tab delimiting', () => {
    const result = parseImportFile('list.tsv', 'Title\tNotes\nBuy milk\twhole');
    expect(result.drafts).toEqual([{ title: 'Buy milk', notes: 'whole' }]);
  });

  it('treats .txt and .md as one item per line, markers stripped', () => {
    const result = parseImportFile('notes.md', '- one\n- two');
    expect(result.drafts).toEqual([{ title: 'one' }, { title: 'two' }]);
    expect(result.structured).toBe(false);
  });

  it('a title-only csv is not structured', () => {
    // No notes and no dates survive the mapping, so the dialog can degrade it
    // to the editable textarea instead of a read-only preview.
    const result = parseImportFile('flat.csv', 'Title\nBuy milk\nCall bank');
    expect(result.structured).toBe(false);
    expect(result.drafts.map((d) => d.title)).toEqual(['Buy milk', 'Call bank']);
  });
});
