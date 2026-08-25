import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-service';
import { runReminderScan } from '@/lib/reminders/scan';
import { checkCronAuth } from '@/lib/cron-auth';

/**
 * GET /api/cron/reminders
 *
 * The reminder tick. Runs every 5 minutes; works out whose per-item cue is due
 * in their own local minute, and whose streak-at-risk last call is owed.
 *
 * Everything real lives in lib/reminders/scan.ts — this route is auth, a clock
 * and a JSON summary, so the scan stays testable without a request.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (Vercel sets this automatically).
 */
/**
 * The tick fans out to every user, and each delivery channel is allowed up to
 * eight seconds. Next's default serverless budget is short enough that one
 * unreachable host — a Home Assistant behind a dead tunnel — can end the
 * invocation partway through, and a cue that was CLAIMED but not delivered is
 * lost for the day.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = checkCronAuth(req);
  if (denied) return denied.response;

  try {
    const summary = await runReminderScan(createServiceClient(), { now: new Date() });
    // 200 even for a partial tick: `notes` carries the per-user failures and a
    // non-2xx would make the platform retry the WHOLE scan, re-delivering to
    // every user it already reached this minute.
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[cron/reminders] scan failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 },
    );
  }
}
