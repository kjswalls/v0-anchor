import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createServiceClient } from '@/lib/supabase-service';
import { EXTENSION_SETTINGS, isKnownSecretKey } from '@/lib/extension-settings';

/**
 * Channel credentials — the write-only surface.
 *
 * user_secrets has its grants revoked from `authenticated` (migration 012), so
 * the browser cannot read or write it directly at all. This route is the only
 * door, and it is deliberately one-way:
 *
 *   GET  returns which keys are SET, never a value. Not even a masked one — a
 *        masked token still leaks its length and its last four characters, and
 *        there is no screen in Anchor that needs either.
 *   PUT  merges values in. `null` deletes a key.
 *
 * The session cookie authorises; the service client performs. The user id comes
 * from the verified session and NEVER from the body, which is what stops this
 * from being a way to write credentials into someone else's account.
 */

/** GET /api/reminders/secrets → { [channelSlug]: string[] } */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('user_secrets')
    .select('reminder_secrets')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    // A database without migration 030 means "nothing is configured", which is
    // true and renderable — not an error state for the settings page to explain.
    if (error.code === '42703' || /column\b.*\bdoes not exist/i.test(error.message ?? '')) {
      return NextResponse.json({ secrets: {}, unavailable: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bag = (data as { reminder_secrets?: unknown } | null)?.reminder_secrets;
  const out: Record<string, string[]> = {};
  if (bag && typeof bag === 'object') {
    for (const [slug, values] of Object.entries(bag as Record<string, unknown>)) {
      if (!values || typeof values !== 'object') continue;
      out[slug] = Object.entries(values as Record<string, unknown>)
        .filter(([key, value]) => typeof value === 'string' && value !== '' && isKnownSecretKey(slug, key))
        .map(([key]) => key);
    }
  }
  return NextResponse.json({ secrets: out });
}

/**
 * PUT /api/reminders/secrets
 * Body: { channel: string, values: Record<string, string | null> }
 */
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { channel?: string; values?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const channel = body.channel;
  if (!channel || !EXTENSION_SETTINGS.some((spec) => spec.slug === channel)) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
  }
  if (!body.values || typeof body.values !== 'object') {
    return NextResponse.json({ error: 'values is required' }, { status: 400 });
  }

  // Allow-list every key. Without this the column is an unbounded jsonb an
  // authenticated caller can grow at will — and the reminder scan reads all of
  // it into memory on every tick.
  const patch: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(body.values)) {
    if (!isKnownSecretKey(channel, key)) {
      return NextResponse.json({ error: `Unknown field ${key}` }, { status: 400 });
    }
    if (value === null || value === '') {
      patch[key] = null;
      continue;
    }
    if (typeof value !== 'string') {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
    }
    // A credential this long is a paste accident, and the column is read on
    // every tick for every user.
    if (value.length > 4096) {
      return NextResponse.json({ error: `${key} is too long` }, { status: 400 });
    }
    patch[key] = value;
  }

  const service = createServiceClient();
  const { data: existing, error: readError } = await service
    .from('user_secrets')
    .select('reminder_secrets')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError && readError.code !== 'PGRST116') {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const bag = ((existing as { reminder_secrets?: unknown } | null)?.reminder_secrets ?? {}) as Record<
    string,
    Record<string, string>
  >;
  const forChannel: Record<string, string> = { ...(bag[channel] ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete forChannel[key];
    else forChannel[key] = value;
  }

  const next = { ...bag, [channel]: forChannel };
  // Drop a channel that has nothing left, so "I removed my Twilio token" leaves
  // no empty shell behind for the next reader to reason about.
  if (Object.keys(forChannel).length === 0) delete next[channel];

  const { error: writeError } = await service
    .from('user_secrets')
    .upsert({ user_id: user.id, reminder_secrets: next }, { onConflict: 'user_id' });

  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });

  return NextResponse.json({ ok: true, set: Object.keys(forChannel) });
}
