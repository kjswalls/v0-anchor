import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * The Trash SECTION — the console's one heterogeneous list, and its one
 * per-row action.
 *
 * What is worth pinning here rather than in the store tests:
 *
 *  - The KIND is on the row as a word. Every other section is homogeneous, so
 *    its column header names the kind for every row at once; this one is not,
 *    and a name-hashed CategoryIcon encodes no kind whatsoever. A trashed task
 *    and a trashed project both called "Reading" would otherwise be
 *    pixel-identical, and ⌘Z after restoring the wrong one is not a recovery.
 *  - A FAILED fetch says so. Rendering an empty list would tell someone hunting
 *    for a deleted routine that it is gone for good — the one wrong answer this
 *    surface can give.
 *  - The Restore control is a real button, always visible, and carries
 *    `data-organize-row` so the filter's ↓ still lands somewhere useful.
 */

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

const listDeleted = vi.fn();
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listDeleted: (...args: unknown[]) => listDeleted(...args),
    fetchTrashedNames: vi.fn(async () => ({ projects: [], groups: [] })),
  };
});

import { OrganizeConsole } from '@/components/planner/organize/organize-console';
import { whenGone } from '@/components/planner/organize/sections/trash';
import { heldByTrash } from '@/components/planner/organize/use-trashed-names';
import { usePlannerStore } from '@/lib/planner-store';
import type { TrashEntry } from '@/lib/db';

const DELETED = '2026-08-12T10:00:00.000Z';

const restoreFromTrash = vi.fn();

beforeEach(() => {
  listDeleted.mockReset();
  restoreFromTrash.mockReset();
  usePlannerStore.setState({
    userId: 'u1',
    isLoading: false,
    items: [],
    projects: [],
    habitGroups: [],
    routines: [],
    programs: [],
    itemTypes: [],
    restoreFromTrash,
  } as never);
});

afterEach(cleanup);

const openTrash = () =>
  render(<OrganizeConsole open onOpenChange={() => {}} section="trash" />);

const entry = (over: Partial<TrashEntry>): TrashEntry =>
  ({
    kind: 'item', id: 'i1', name: 'A task', deletedAt: DELETED,
    entity: { type: 'task', id: 'i1', title: 'A task', status: 'pending', isScheduled: false, order: 0 },
    ...over,
  }) as TrashEntry;

describe('the Trash section', () => {
  it('names the KIND on every row, because the list mixes them', async () => {
    listDeleted.mockResolvedValue([
      entry({ kind: 'item', id: 'i1', name: 'Reading' }),
      entry({ kind: 'project', id: 'p1', name: 'Reading', entity: { id: 'p1', name: 'Reading', emoji: 'x' } }),
    ]);
    openTrash();

    const rows = await screen.findAllByTestId('trash-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Item');
    expect(rows[1].textContent).toContain('Project');
  });

  it('says how many subtasks come back with a parent', async () => {
    listDeleted.mockResolvedValue([
      entry({ name: 'Plan trip', children: [entry({ id: 'k1' }).entity, entry({ id: 'k2' }).entity] as never }),
    ]);
    openTrash();
    expect((await screen.findByTestId('trash-row')).textContent).toContain('2 subtasks');
  });

  it('says how many members will re-file with a container', async () => {
    listDeleted.mockResolvedValue([
      entry({ kind: 'project', id: 'p1', name: 'Work', memberIds: ['a', 'b', 'c'],
        entity: { id: 'p1', name: 'Work', emoji: 'x' } }),
    ]);
    openTrash();
    expect((await screen.findByTestId('trash-row')).textContent).toContain('3 items refile');
  });

  it('hands the whole entry to the store and drops the row', async () => {
    const row = entry({ name: 'A task' });
    listDeleted.mockResolvedValue([row]);
    openTrash();

    fireEvent.click(await screen.findByTestId('trash-restore'));

    expect(restoreFromTrash).toHaveBeenCalledWith(row);
    // Dropped locally rather than refetched — the bin is a snapshot, and a row
    // that stays after a successful restore reads as the restore not working.
    await waitFor(() => expect(screen.queryByTestId('trash-row')).toBeNull());
  });

  it('reports a failed fetch instead of rendering an empty bin', async () => {
    listDeleted.mockRejectedValue(new Error('network'));
    openTrash();

    expect(await screen.findByTestId('trash-failed')).toBeTruthy();
    expect(screen.queryByTestId('trash-empty')).toBeNull();
  });

  it('distinguishes an empty bin from one that never loaded', async () => {
    listDeleted.mockResolvedValue([]);
    openTrash();
    expect(await screen.findByTestId('trash-empty')).toBeTruthy();
  });

  it('filters on the name AND the kind', async () => {
    listDeleted.mockResolvedValue([
      entry({ kind: 'item', id: 'i1', name: 'Groceries' }),
      entry({ kind: 'routine', id: 'r1', name: 'Morning', entity: { id: 'r1', name: 'Morning', itemIds: [] } }),
    ]);
    openTrash();
    await screen.findAllByTestId('trash-row');

    fireEvent.change(screen.getByTestId('trash-filter'), { target: { value: 'routine' } });

    const rows = screen.getAllByTestId('trash-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Morning');
  });

  it('puts the filter’s ArrowDown target on the Restore button', async () => {
    // `data-organize-row` is looked up with querySelector at any depth, so the
    // hook works from the verb — and Enter then does the only thing a trash row
    // can do. See detail-parts.tsx's FilterRow.
    listDeleted.mockResolvedValue([entry({})]);
    openTrash();
    const restore = await screen.findByTestId('trash-restore');
    expect(restore.hasAttribute('data-organize-row')).toBe(true);
    expect(restore.tagName).toBe('BUTTON');
  });
});

describe('whenGone', () => {
  const at = (iso: string) => new Date(iso).getTime();

  it('rounds DOWN, so the count never runs ahead of the purge', () => {
    // 25 hours is one day gone, not two.
    expect(whenGone('2026-08-12T10:00:00.000Z', at('2026-08-13T11:00:00.000Z'))).toBe('1d ago');
  });

  it('reads in hours inside the first day', () => {
    expect(whenGone('2026-08-12T10:00:00.000Z', at('2026-08-12T15:30:00.000Z'))).toBe('5h ago');
  });

  it('says "just now" rather than "0h ago"', () => {
    expect(whenGone('2026-08-12T10:00:00.000Z', at('2026-08-12T10:20:00.000Z'))).toBe('just now');
  });

  it('does not render a negative age from a clock skew', () => {
    expect(whenGone('2026-08-12T10:00:00.000Z', at('2026-08-12T09:00:00.000Z'))).toBe('just now');
  });
});

describe('heldByTrash', () => {
  const trashed = [{ id: 'p1', name: 'Work' }];

  it('refuses an exact repeat and names the holder', () => {
    expect(heldByTrash(trashed, 'Work', 'project')).toContain('“Work”');
    expect(heldByTrash(trashed, 'Work', 'project')).toContain('Trash');
  });

  it('allows a case variant, because the unique index is case-SENSITIVE', () => {
    // Refusing "work" here would block a name Postgres accepts — the opposite
    // failure, and just as invisible to the person typing.
    expect(heldByTrash(trashed, 'work', 'project')).toBeNull();
  });

  it('says nothing about a free name', () => {
    expect(heldByTrash(trashed, 'Home', 'project')).toBeNull();
  });
});
