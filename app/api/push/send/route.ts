import { NextRequest, NextResponse } from 'next/server';
import webPush from 'web-push';
import { createClient } from '@/lib/supabase-server';
import { createServiceClient } from '@/lib/supabase-service';

// VAPID keys — set in Vercel env vars for production.
// Generate with: node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';

/**
 * POST /api/push/send
 *
 * Sends a push notification to all of a user's subscribed devices.
 *
 * Auth: either
 *   - The requesting user is the same as `userId` (cookie session)
 *   - OR the request includes `x-service-key: <SUPABASE_SECRET_KEY>` header
 *
 * Body: { userId: string; title: string; body: string; url?: string }
 */
export async function POST(req: NextRequest) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
  }

  const { userId, title, body, url } = await req.json();
  if (!userId || !title) {
    return NextResponse.json({ error: 'userId and title are required' }, { status: 400 });
  }

  // Auth: service key header OR same authenticated user
  const serviceKeyHeader = req.headers.get('x-service-key');
  const isServiceCall = serviceKeyHeader && serviceKeyHeader === process.env.SUPABASE_SECRET_KEY;

  if (!isServiceCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Fetch all subscriptions for this user using service client (bypasses RLS)
  const service = createServiceClient();
  const { data: subscriptions, error } = await service
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subscriptions?.length) return NextResponse.json({ ok: true, sent: 0 });

  webPush.setVapidDetails(
    'mailto:hello@anchor.app',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({ title, body, url: url ?? '/' });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // Remove subscriptions that are no longer valid (e.g. user unsubscribed in browser)
  const expired: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        expired.push(subscriptions[i].endpoint);
      }
    }
  });

  if (expired.length) {
    await service.from('push_subscriptions').delete().in('endpoint', expired);
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return NextResponse.json({ ok: true, sent });
}
