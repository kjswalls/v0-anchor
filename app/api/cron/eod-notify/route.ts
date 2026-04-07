import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-service';

/**
 * GET /api/cron/eod-notify
 *
 * Vercel cron endpoint — runs every 5 minutes.
 * Finds users whose local time is within the 5-minute window of their EOD review
 * time and who haven't been notified today, then sends them a push notification.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (Vercel sets this automatically).
 * If CRON_SECRET is not set, the check is skipped (for local dev).
 */
export async function GET(req: NextRequest) {
  // Auth check — skip if CRON_SECRET is not configured (local dev)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const service = createServiceClient();

  // Fetch all users with EOD notifications enabled and a known timezone
  const { data: users, error } = await service
    .from('user_settings')
    .select('user_id, eod_review_time, timezone, last_eod_notified_date')
    .eq('eod_review_enabled', true)
    .not('timezone', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!users?.length) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  const now = new Date();
  let notified = 0;

  // Construct the base URL for internal fetch calls
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${req.headers.get('host')}`;

  for (const user of users) {
    const { user_id: userId, eod_review_time: eodReviewTime, timezone, last_eod_notified_date: lastNotifiedDate } = user;

    if (!eodReviewTime || !timezone) continue;

    // Get the user's current local time and date
    const userNow = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    const userToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
    }).format(now);

    // Skip if already notified today
    if (lastNotifiedDate === userToday) continue;

    // Compute eodReviewTime + 5 minutes for the window end
    const [eodHour, eodMin] = eodReviewTime.split(':').map(Number);
    const windowEndMin = eodMin + 5;
    const windowEndHour = windowEndMin >= 60 ? eodHour + 1 : eodHour;
    const windowEnd = [
      String(windowEndHour % 24).padStart(2, '0'),
      String(windowEndMin % 60).padStart(2, '0'),
    ].join(':');

    // Fire if local time is within [eodReviewTime, eodReviewTime + 5min)
    if (userNow < eodReviewTime || userNow >= windowEnd) continue;

    // Send push notification
    try {
      await fetch(`${appUrl}/api/push/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': process.env.SUPABASE_SECRET_KEY ?? '',
        },
        body: JSON.stringify({
          userId,
          title: 'End of day 🌙',
          body: "How'd today go?",
          url: '/?eod=1',
        }),
      });
    } catch {
      // Non-fatal — continue to next user
      continue;
    }

    // Record that we've notified this user today
    await service
      .from('user_settings')
      .update({ last_eod_notified_date: userToday })
      .eq('user_id', userId);

    notified++;
  }

  return NextResponse.json({ ok: true, notified });
}
