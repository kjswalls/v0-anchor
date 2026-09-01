/**
 * ai-registry.ts — per-tier capability config for the AI assistant.
 *
 * The sibling of [item-registry.ts](item-registry.ts), and it exists for the
 * same reason: every place the app wants to ask "is this OpenClaw or Beacon?"
 * should instead ask what the current tier *can do*. Adding a tier (a hosted
 * dsul-operated agent, a local model, whatever comes next) means adding a
 * config here — not adding code paths through the UI.
 *
 * Tiers are deliberately NOT equivalent, and the UI must not pretend otherwise:
 * a delegate button that silently does nothing on the assistant tier is worse
 * than no button. See memory/plans/ai-vision.md.
 */

import type { AIProvider } from './ai-settings-store'

/**
 * - `agent` — the user's own OpenClaw gateway. Background work, delegation,
 *   durable server-side sessions.
 * - `assistant` — BYOK request/response completions. Planning help only.
 * - `none` — no AI configured. Every capability is off; surfaces hide rather
 *   than erroring.
 */
export type AITier = 'agent' | 'assistant' | 'none'

/** How sure we are that the tier's backend is actually reachable. */
export type AIConnection = 'unknown' | 'connected' | 'disconnected'

export interface AITierConfig {
  tier: AITier
  /** Fallback display name. The agent tier prefers its own agentId when known. */
  label: string
  /** Free-form conversation: the omnibar ask, item threads, ritual replies. */
  canChat: boolean
  /**
   * Can return structured proposals (a diff the user accepts with one tap).
   * Pillar 1 — the core value, and the reason the assistant tier is a real
   * product rather than a degraded mode.
   */
  canPropose: boolean
  /** Items can be assigned to the agent. Implies canRunBackground. */
  canDelegate: boolean
  /** Work continues while the app is closed. */
  canRunBackground: boolean
  /**
   * Conversation state lives on the backend, keyed by session, so a thread
   * survives a reload and follows the user across devices. False means the
   * transcript is only as durable as dsul's own storage.
   */
  hasServerSessions: boolean
  /**
   * The agent can reach the user outside dsul (its own channels). Gates
   * "notify me when it's done" affordances that would otherwise be a lie.
   */
  canNotifyOutOfApp: boolean
}

export const AI_TIERS: Record<AITier, AITierConfig> = {
  agent: {
    tier: 'agent',
    label: 'OpenClaw',
    canChat: true,
    canPropose: true,
    canDelegate: true,
    canRunBackground: true,
    hasServerSessions: true,
    canNotifyOutOfApp: true,
  },
  assistant: {
    tier: 'assistant',
    label: 'Beacon',
    canChat: true,
    canPropose: true,
    // Rebuilding a tool loop, a task queue and background workers inside dsul
    // to fake delegation on a bare completions API is the one thing this
    // architecture is explicitly not doing.
    canDelegate: false,
    canRunBackground: false,
    hasServerSessions: false,
    canNotifyOutOfApp: false,
  },
  none: {
    tier: 'none',
    label: 'AI',
    canChat: false,
    canPropose: false,
    canDelegate: false,
    canRunBackground: false,
    hasServerSessions: false,
    canNotifyOutOfApp: false,
  },
}

/**
 * Providers with no working transport yet.
 *
 * They belong to a tier conceptually but cannot do anything, and the registry
 * has to say so — otherwise a surface asks `canPropose`, gets true, offers the
 * action, and the route answers with an error string. One question, one answer,
 * in one place.
 */
const NOT_IMPLEMENTED: readonly AIProvider[] = ['anthropic']

/** Which tier a stored provider belongs to, ignoring reachability. */
export function tierForProvider(provider: AIProvider): AITier {
  if (NOT_IMPLEMENTED.includes(provider)) return 'none'
  switch (provider) {
    case 'openclaw':
      return 'agent'
    case 'openai':
      return 'assistant'
    case 'none':
    default:
      return 'none'
  }
}

/** True when the provider is selectable but not yet wired to anything. */
export function isProviderComingSoon(provider: AIProvider): boolean {
  return NOT_IMPLEMENTED.includes(provider)
}

/**
 * The capabilities actually available right now.
 *
 * A configured-but-unreachable gateway degrades to the assistant tier's
 * capability set rather than the agent's: the user can still be told chat is
 * offline, but nothing may offer to delegate work to a gateway that will never
 * pick it up. `unknown` (still checking) is treated optimistically so the UI
 * does not flicker capabilities off and back on during hydration.
 */
export function resolveAICapabilities(
  provider: AIProvider,
  connection: AIConnection = 'unknown'
): AITierConfig {
  const tier = tierForProvider(provider)
  if (tier === 'agent' && connection === 'disconnected') {
    return { ...AI_TIERS.assistant, label: AI_TIERS.agent.label }
  }
  if (isProviderComingSoon(provider)) {
    return { ...AI_TIERS.none, label: 'Claude' }
  }
  return AI_TIERS[tier]
}
