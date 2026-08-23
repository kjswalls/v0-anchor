import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createServiceClient } from '@/lib/supabase-service';
import { reportLiveCompletion } from '@/lib/stakes/live';

/**
 * POST /api/stakes/completion
 *
 * "This habit was just ticked (or un-ticked) for this day." The browser fires
 * it alongside the completion write so a Beeminder datapoint lands NOW rather
 * than at the nightly settlement — which, at its default of 03:00 against a
 * goal deadline of midnight, reports the completion after the goal has already
 * derailed.
 *
 * Auth is the ordinary cookie session, the /api/reminders/act pattern: the
 * session identifies WHO, and the service client (which the stake path needs,
 * because credentials live in user_secrets and only service_role can read it)
 * is then scoped by that user id explicitly. The request body is never trusted
 * for identity.
 *
 * Fire-and-forget by design. It always answers 200 with a note — the completion
 * it reports has already been written, and a failed datapoint must not surface
 * as an error on a habit the user did do. The settlement is the retry.
 *
 * Body: { itemId: string, dateStr: 'yyyy-MM-dd', completed: boolean }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { itemId?: string; dateStr?: string; completed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { itemId, dateStr, completed } = body;
  if (!itemId || typeof completed !== 'boolean') {
    return NextResponse.json({ error: 'itemId and completed are required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? '')) {
    return NextResponse.json({ error: 'dateStr must be yyyy-MM-dd' }, { status: 400 });
  }

  const result = await reportLiveCompletion(createServiceClient(), {
    userId: user.id,
    itemId,
    dateStr: dateStr as string,
    completed,
  });

  return NextResponse.json(result);
}
