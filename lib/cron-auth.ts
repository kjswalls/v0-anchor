/**
 * cron-auth.ts — the shared gate on every scheduled route.
 *
 * Extracted when the reminder scan became the second cron endpoint and the
 * nightly settlement was about to be the third. The rule it encodes is the one
 * /api/cron/eod-notify already had, and the reason it is worth centralising is
 * the FAIL-CLOSED half: an unset CRON_SECRET must 500 in production and only
 * wave the request through in development. Copied by hand a third time, that is
 * the clause someone eventually inverts, and the result is a public endpoint
 * that will happily send notifications to every user on demand.
 */

import { NextResponse } from 'next/server'

export type CronAuthFailure = { response: NextResponse }

/**
 * Returns null when the caller may proceed, or the response to return.
 *
 * Vercel sets the Authorization header on scheduled invocations from the
 * project's CRON_SECRET automatically.
 */
export function checkCronAuth(req: Request): CronAuthFailure | null {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    if (process.env.NODE_ENV !== 'development') {
      return {
        response: NextResponse.json({ error: 'CRON secret not configured' }, { status: 500 }),
      }
    }
    return null
  }

  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return null
}
