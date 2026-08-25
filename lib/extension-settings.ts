/**
 * extension-settings.ts — every extension that has settings, in one list.
 *
 * The two halves live in their own domains (delivery channels under
 * lib/reminders, stake adapters under lib/stakes) because that is where their
 * code and their reasons are. What they share is a consumer: the settings
 * manifest renders them and /api/reminders/secrets validates against them, and
 * both of those must see ALL of them or a field silently stops working.
 *
 * So this module exists purely to stop those two consumers from each keeping
 * their own list — which is the drift that makes a settings page offer a field
 * the server then rejects.
 */

import { CHANNEL_SETTINGS, type ChannelSettingsSpec } from './reminders/channel-config'
import { STAKE_SETTINGS } from './stakes/stake-config'

export type { ChannelField, ChannelSettingsSpec } from './reminders/channel-config'

/** Delivery channels first, then stakes — the order they appear in settings. */
export const EXTENSION_SETTINGS: ChannelSettingsSpec[] = [...CHANNEL_SETTINGS, ...STAKE_SETTINGS]

export function extensionSettingsFor(slug: string): ChannelSettingsSpec | undefined {
  return EXTENSION_SETTINGS.find((spec) => spec.slug === slug)
}

/**
 * Is `key` a credential this extension actually declares?
 *
 * The write path's allow-list. Without it, user_secrets.reminder_secrets is an
 * unbounded jsonb an authenticated caller can grow at will — and every byte of
 * it is read on every settlement and every reminder tick.
 */
export function isKnownSecretKey(slug: string, key: string): boolean {
  return extensionSettingsFor(slug)?.secrets.some((field) => field.key === key) ?? false
}

/** The config twin of isKnownSecretKey. */
export function isKnownConfigKey(slug: string, key: string): boolean {
  return extensionSettingsFor(slug)?.config.some((field) => field.key === key) ?? false
}
