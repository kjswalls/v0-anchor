import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { setItemCompletion, updateItem } from '@/lib/db';
import { getItemTypeConfig } from '@/lib/item-registry';
import { ACTION_DONE, ACTION_SNOOZE, SNOOZE_MINUTES } from '@/lib/reminders/channels/push';

/**
 * POST /api/reminders/act
 *
 * The notification's own buttons. Called by the service worker's
 * notificationclick handler (app/sw.ts) so a habit can be marked done from the
 * lock screen WITHOUT opening the app — which is the single biggest friction
 * cut this feature has: the gap between seeing a reminder and acting on it is
 * where most of them are lost.
 *
 * Auth is the ordinary cookie session, deliberately, and not the service key.
 * The service worker is same-origin and sends credentials, so RLS scopes every
 * statement below to the signed-in user — an itemId belonging to someone else
 * finds nothing rather than being trusted because the caller knew the id.
 *
 * Body: { action: 'done' | 'snooze', itemId: string, dateStr: 'yyyy-MM-dd' }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { action?: string; itemId?: string; dateStr?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, itemId, dateStr } = body;
  if (!itemId || (action !== ACTION_DONE && action !== ACTION_SNOOZE)) {
    return NextResponse.json({ error: 'action and itemId are required' }, { status: 400 });
  }
  if (action === ACTION_DONE && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? '')) {
    // The date comes off a notification that may have sat on a lock screen
    // overnight, so it is data, not a formality — completing "today" server-side
    // would credit the wrong day for exactly the user who most needs the credit.
    return NextResponse.json({ error: 'dateStr must be yyyy-MM-dd' }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from('items')
    .select('id, type, repeat_frequency')
    .eq('id', itemId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const type = row.type as string;

  if (action === ACTION_SNOOZE) {
    const until = new Date(Date.now() + SNOOZE_MINUTES * 60_000).toISOString();
    const { error: snoozeError } = await supabase
      .from('items')
      .update({ reminder_snooze_until: until })
      .eq('id', itemId);
    if (snoozeError) {
      return NextResponse.json({ error: snoozeError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, snoozedUntil: until });
  }

  const recurring = Boolean(row.repeat_frequency) && row.repeat_frequency !== 'none';

  try {
    if (recurring) {
      // Per-date completion, never scalar status — the rule in CLAUDE.md, and
      // the RPC owns the streak transition so this cannot desync it.
      await setItemCompletion(itemId, type, dateStr as string, true, true, supabase);
    } else {
      await updateItem(
        itemId,
        type,
        { status: getItemTypeConfig(type).doneStatus } as never,
        user.id,
        supabase,
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 },
    );
  }

  // A completed item must not be re-asked by a snooze that was armed before it.
  await supabase.from('items').update({ reminder_snooze_until: null }).eq('id', itemId);

  return NextResponse.json({ ok: true });
}
