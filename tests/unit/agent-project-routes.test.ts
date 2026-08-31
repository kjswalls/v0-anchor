import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The project write surface — the CLASSIFY container's agent API.
 *
 * These routes existed before the MCP server did, hand-rolled and unvalidated:
 * a body with no name reached Postgres, and a duplicate name came back as a 500
 * carrying a constraint string. They are factory-built now, so what is worth
 * pinning is the behaviour that is NOT shared with the other containers — the
 * rename fan-out, the 409, and the refusal that points a caller at the item.
 */

const USER = 'user-1';

const db = {
  createProject: vi.fn(async () => {}),
  updateProject: vi.fn(async () => {}),
  deleteProject: vi.fn(async () => {}),
  renameContainerMembers: vi.fn(async () => {}),
};

/** Rows the ownership gate will find, keyed by id. */
let owned: Record<string, { user_id: string } | null> = {};

vi.mock('@/lib/db', () => db);

vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          is: () => ({
            maybeSingle: async () => ({ data: owned[id] ?? null, error: null }),
          }),
        }),
      }),
    }),
  }),
  resolveUserIdFromApiKey: vi.fn(async () => USER),
}));

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/agent/projects/route');
  return POST(
    new NextRequest('http://localhost/api/agent/projects', {
      method: 'POST',
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
};

const patch = async (id: string, body: unknown) => {
  const { PATCH } = await import('@/app/api/agent/projects/[id]/route');
  return PATCH(
    new NextRequest(`http://localhost/api/agent/projects/${id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
};

const del = async (id: string) => {
  const { DELETE } = await import('@/app/api/agent/projects/[id]/route');
  return DELETE(
    new NextRequest(`http://localhost/api/agent/projects/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer k' },
    }),
    { params: Promise.resolve({ id }) },
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  owned = { p1: { user_id: USER } };
});

describe('POST /api/agent/projects', () => {
  it('creates a project and echoes it with a generated id', async () => {
    const res = await post({ name: 'Chinese', emoji: '🇨🇳' });
    expect(res.status).toBe(201);
    const { project } = await res.json();
    expect(project).toMatchObject({ name: 'Chinese', emoji: '🇨🇳' });
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.createProject).toHaveBeenCalledOnce();
  });

  it('keeps a caller-supplied id, so a retry cannot double-create', async () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const res = await post({ id, name: 'Chinese', emoji: '🇨🇳' });
    expect((await res.json()).project.id).toBe(id);
  });

  it('carries the block fields onto the row', async () => {
    await post({
      name: 'Chinese',
      emoji: '🇨🇳',
      repeatFrequency: 'daily',
      timeBucket: 'morning',
      startTime: '07:30',
      duration: 30,
    });
    expect(db.createProject.mock.calls[0][1]).toMatchObject({
      repeatFrequency: 'daily',
      timeBucket: 'morning',
      startTime: '07:30',
      duration: 30,
    });
  });

  it('400s a body with no name instead of writing a nameless row', async () => {
    const res = await post({ emoji: '🇨🇳' });
    expect(res.status).toBe(400);
    expect(db.createProject).not.toHaveBeenCalled();
  });

  it('400s a body with no emoji', async () => {
    const res = await post({ name: 'Chinese' });
    expect(res.status).toBe(400);
  });

  it('refuses itemIds by pointing at the call that files the work', async () => {
    const res = await post({ name: 'Chinese', emoji: '🇨🇳', itemIds: ['a'] });
    expect(res.status).toBe(400);
    // The whole point: a stripped key would have created an empty project and
    // reported 201, and the caller would have believed the items were filed.
    expect(JSON.stringify(await res.json())).toContain('item names its project');
    expect(db.createProject).not.toHaveBeenCalled();
  });

  it('refuses an icon token, naming the field projects actually wear', async () => {
    const res = await post({ name: 'Chinese', emoji: '🇨🇳', icon: 'icon:Sparkles' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('emoji');
  });

  it('rejects a custom frequency with no days, which repeats on nothing', async () => {
    const res = await post({ name: 'Chinese', emoji: '🇨🇳', repeatFrequency: 'custom' });
    expect(res.status).toBe(400);
  });

  it('answers a duplicate name with 409 and names the trash', async () => {
    db.createProject.mockRejectedValueOnce({ code: '23505' });
    const res = await post({ name: 'Chinese', emoji: '🇨🇳' });
    expect(res.status).toBe(409);
    // The holder may be soft-deleted, which the agent can see through no
    // endpoint — so the message has to say so or the retry loop never ends.
    expect((await res.json()).error).toContain('trash');
  });
});

describe('PATCH /api/agent/projects/:id', () => {
  it('fans a rename out to the members, after the container write', async () => {
    const order: string[] = [];
    db.updateProject.mockImplementationOnce(async () => { order.push('container'); });
    db.renameContainerMembers.mockImplementationOnce(async () => { order.push('members'); });

    const res = await patch('p1', { name: 'Mandarin' });
    expect(res.status).toBe(200);
    // Chained, never parallel: a rejected rename that had already rewritten its
    // members reads as the items having moved, and nothing can detect it.
    expect(order).toEqual(['container', 'members']);
    expect(db.renameContainerMembers).toHaveBeenCalledWith(USER, 'p1', 'Mandarin', expect.anything());
  });

  it('does not touch the members when the rename is not part of the patch', async () => {
    await patch('p1', { emoji: '📚' });
    expect(db.updateProject).toHaveBeenCalledOnce();
    expect(db.renameContainerMembers).not.toHaveBeenCalled();
  });

  it('answers a duplicate name with 409', async () => {
    db.updateProject.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));
    const res = await patch('p1', { name: 'Work' });
    expect(res.status).toBe(409);
  });

  it('404s another user\'s project without writing', async () => {
    owned = { p1: { user_id: 'someone-else' } };
    const res = await patch('p1', { name: 'Mine now' });
    expect(res.status).toBe(404);
    expect(db.updateProject).not.toHaveBeenCalled();
  });

  it('404s an id that does not exist', async () => {
    const res = await patch('nope', { name: 'X' });
    expect(res.status).toBe(404);
  });

  it('rejects an empty name rather than stranding every member', async () => {
    const res = await patch('p1', { name: '' });
    expect(res.status).toBe(400);
    expect(db.updateProject).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/agent/projects/:id', () => {
  it('soft-deletes a project it owns', async () => {
    const res = await del('p1');
    expect(res.status).toBe(200);
    expect(db.deleteProject).toHaveBeenCalledWith(USER, 'p1', expect.anything());
  });

  it('404s another user\'s project without deleting', async () => {
    owned = { p1: { user_id: 'someone-else' } };
    expect((await del('p1')).status).toBe(404);
    expect(db.deleteProject).not.toHaveBeenCalled();
  });
});
