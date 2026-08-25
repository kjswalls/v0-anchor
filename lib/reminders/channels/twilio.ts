/**
 * channels/twilio.ts — what the call and the SMS channel share.
 *
 * Both speak the same 2010-era form-encoded API with the same Basic auth, so
 * the credential handling and the request shape live once. What they do NOT
 * share is when they fire: an SMS is cheap and glanceable, a phone call
 * interrupts a meeting. See each channel's `kinds` default.
 */

import { postToChannel, requireString } from './http'

const TWILIO_API = 'https://api.twilio.com/2010-04-01'

export interface TwilioCredentials {
  accountSid: string
  authToken: string
  from: string
  to: string
}

/**
 * Pull the four values a Twilio call needs, or null if the user has not
 * finished setting it up.
 *
 * The SID and token come from secrets (user_secrets — never browser-readable);
 * the phone numbers come from config, because a phone number is not a
 * credential and the settings page has to be able to show you which one it is
 * about to ring.
 */
export function twilioCredentials(
  config: Record<string, unknown>,
  secrets: Record<string, string>,
): TwilioCredentials | null {
  const accountSid = requireString(secrets, 'accountSid')
  const authToken = requireString(secrets, 'authToken')
  const from = requireString(config, 'from')
  const to = requireString(config, 'to')
  if (!accountSid || !authToken || !from || !to) return null
  return { accountSid, authToken, from, to }
}

/** POST a form body to one of the account's resources. */
export async function twilioPost(
  credentials: TwilioCredentials,
  resource: 'Calls' | 'Messages',
  fields: Record<string, string>,
): Promise<string> {
  // Basic auth, per Twilio's own documented scheme. btoa is available on the
  // edge and node runtimes Next serves routes on.
  const auth = btoa(`${credentials.accountSid}:${credentials.authToken}`)
  return postToChannel(
    `${TWILIO_API}/Accounts/${encodeURIComponent(credentials.accountSid)}/${resource}.json`,
    {
      headers: { Authorization: `Basic ${auth}` },
      contentType: 'application/x-www-form-urlencoded',
      body: new URLSearchParams(fields).toString(),
    },
  )
}

/**
 * Escape text for inclusion in a TwiML document.
 *
 * Load-bearing, not hygiene: the spoken text is an item TITLE, which is free
 * user input. A habit called `Read <b>more</b>` would otherwise produce
 * malformed XML and a failed call, and one called something with an unbalanced
 * quote could change the surrounding attribute. Twilio parses this as XML, so
 * it gets XML escaping.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
