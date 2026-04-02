import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Placeholder module — the search parser doesn't exist as a standalone pure
// function yet. These tests document the EXPECTED behaviour so we can TDD it
// once the parser is extracted from the component.
// ---------------------------------------------------------------------------

// Known issue: "task:" and "habit:" keyword filters are not yet implemented (#93)

describe('search keyword parser', () => {
  it.todo('empty string returns no filters');
  // parseSearchQuery('') → { text: '', type: null, priority: null, project: null }

  it.todo('plain text query sets text field only');
  // parseSearchQuery('meeting notes') → { text: 'meeting notes', type: null, ... }

  it.skip('"task:" prefix filters to tasks only (#93 — keyword not implemented)', () => {
    // BUG #93: "task:" and "habit:" keywords are not yet implemented.
    // Once fixed:
    //   parseSearchQuery('task:standup') → { text: 'standup', type: 'task', ... }
  });

  it.skip('"habit:" prefix filters to habits only (#93 — keyword not implemented)', () => {
    // BUG #93: same as above for "habit:" keyword
    //   parseSearchQuery('habit:water') → { text: 'water', type: 'habit', ... }
  });

  it.todo('"priority:high" keyword sets priority filter');
  // parseSearchQuery('priority:high report') → { text: 'report', priority: 'high', ... }

  it.todo('unknown keywords are treated as plain text');
  // parseSearchQuery('foo:bar baz') → { text: 'foo:bar baz', type: null, ... }
});
