import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Undo/redo is handled inside planner-store (Zustand). Because the store is a
// singleton tied to the Zustand runtime, these tests document the contract and
// will be implemented once the undo/redo logic is extracted into a pure
// reducer or a testable helper.
// ---------------------------------------------------------------------------

describe('undo/redo store logic', () => {
  it.todo('initial state has empty undo and redo stacks');
  // After store initialisation: undoStack.length === 0, redoStack.length === 0

  it.todo('completing a task pushes a snapshot onto the undo stack');
  // After setTaskStatus(id, "completed") the undo stack should grow by 1.

  it.todo('undo restores the previous task list snapshot');
  // undo() should pop the last snapshot and restore it as the current tasks array.

  it.todo('redo re-applies an undone change');
  // After undo(), redo() should bring the state back to post-completion state.

  it.todo('new action after undo clears the redo stack');
  // Standard undo/redo semantics: a new mutation after undo discards future states.

  it.todo('undo is a no-op when the stack is empty (no crash)');
  // Calling undo() on an empty stack should be a safe no-op.
});
