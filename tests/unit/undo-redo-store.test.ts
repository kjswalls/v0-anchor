import { describe, it, expect, vi, beforeEach } from 'vitest';

// planner-store's db layer is fully mocked: these tests drive the real
// Zustand store (including the module-level history subscriber) and assert
// both the restored state and the db sync calls undo/redo emits.

vi.mock('@/lib/db', () => ({
  fetchItems: vi.fn(async () => []),
  fetchProjects: vi.fn(async () => []),
  fetchHabitGroups: vi.fn(async () => []),
  createItem: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  restoreItem: vi.fn(async () => {}),
  setItemCompletion: vi.fn(async () => {}),
  createProject: vi.fn(async () => {}),
  updateProject: vi.fn(async () => {}),
  deleteProject: vi.fn(async () => {}),
  restoreProject: vi.fn(async () => {}),
  createHabitGroup: vi.fn(async () => {}),
  updateHabitGroup: vi.fn(async () => {}),
  deleteHabitGroup: vi.fn(async () => {}),
  restoreHabitGroup: vi.fn(async () => {}),
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));

import { usePlannerStore } from '@/lib/planner-store';
import * as db from '@/lib/db';
import type { Item } from '@/lib/planner-types';

const USER = 'user-1';

const fixtures = (): Item[] => [
  {
    type: 'task',
    id: 'task-1',
    title: 'Write tests',
    status: 'pending',
    isScheduled: false,
    order: 0,
    completedDates: [],
  },
  {
    type: 'habit',
    id: 'habit-1',
    title: 'Stretch',
    group: 'Wellness',
    streak: 2,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    repeatFrequency: 'daily',
  },
];

const store = () => usePlannerStore.getState();

beforeEach(async () => {
  store().clearStore();
  vi.clearAllMocks();
  vi.mocked(db.fetchItems).mockResolvedValue(fixtures());
  await store().initializeStore(USER);
});

describe('undo/redo store logic', () => {
  it('initial state has empty undo and redo stacks', () => {
    expect(store().canUndo).toBe(false);
    expect(store().canRedo).toBe(false);
    expect(store().tasks).toHaveLength(1);
    expect(store().habits).toHaveLength(1);
  });

  it('completing a task pushes a snapshot onto the undo stack', () => {
    store().toggleTaskStatus('task-1');
    expect(store().tasks[0].status).toBe('completed');
    expect(store().canUndo).toBe(true);
    expect(store().canRedo).toBe(false);
  });

  it('undo restores the previous task list snapshot', () => {
    store().toggleTaskStatus('task-1');
    store().undo();
    expect(store().tasks[0].status).toBe('pending');
    expect(store().canUndo).toBe(false);
    // and the db was patched back toward the restored snapshot
    expect(db.updateItem).toHaveBeenCalledWith('task-1', 'task', { status: 'pending' });
  });

  it('redo re-applies an undone change', () => {
    store().toggleTaskStatus('task-1');
    store().undo();
    store().redo();
    expect(store().tasks[0].status).toBe('completed');
    expect(store().canUndo).toBe(true);
    expect(store().canRedo).toBe(false);
  });

  it('new action after undo clears the redo stack', () => {
    store().toggleTaskStatus('task-1');
    store().undo();
    expect(store().canRedo).toBe(true);
    store().addTask({ title: 'Another' });
    expect(store().canRedo).toBe(false);
  });

  it('undo is a no-op when the stack is empty (no crash)', () => {
    expect(() => store().undo()).not.toThrow();
    expect(store().tasks).toHaveLength(1);
    expect(store().canUndo).toBe(false);
  });
});

describe('undo db sync (Phase 3 regression coverage)', () => {
  it('undoing a habit title edit persists the old title (pre-unification bug: habit sync was status-gated)', () => {
    store().updateHabit('habit-1', { title: 'Stretch more' });
    vi.clearAllMocks();
    store().undo();
    expect(db.updateItem).toHaveBeenCalledWith('habit-1', 'habit', { title: 'Stretch' });
  });

  it('undoing an added item soft-deletes it; redo restores it', () => {
    store().addTask({ title: 'Ephemeral' });
    const added = store().tasks.find((t) => t.title === 'Ephemeral')!;
    store().undo();
    expect(db.deleteItem).toHaveBeenCalledWith(added.id, 'task');
    store().redo();
    expect(db.restoreItem).toHaveBeenCalledWith(added.id, 'task');
  });

  it('undoing a habit completion replays per-date intents, never an absolute completedDates write', () => {
    store().toggleHabitStatus('habit-1', 'done');
    const today = [...store().habits[0].completedDates].pop()!;
    vi.clearAllMocks();
    store().undo();
    expect(db.setItemCompletion).toHaveBeenCalledWith('habit-1', 'habit', today, false, false);
    for (const call of vi.mocked(db.updateItem).mock.calls) {
      expect(Object.keys(call[2] as object)).not.toContain('completedDates');
    }
  });

  it('undoing a project rename patches the name back — it must NOT delete the row', () => {
    store().addProject('Deep Work', '📚');
    const project = store().projects.find((p) => p.name === 'Deep Work')!;
    store().updateProject(project.id, { name: 'Deeper Work' });
    vi.clearAllMocks();
    store().undo();
    expect(db.updateProject).toHaveBeenCalledWith(USER, project.id, { name: 'Deep Work' });
    expect(db.deleteProject).not.toHaveBeenCalled();
    expect(db.restoreProject).not.toHaveBeenCalled();
  });
});
