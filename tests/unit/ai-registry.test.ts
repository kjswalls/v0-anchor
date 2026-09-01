import { describe, it, expect } from 'vitest';
import {
  AI_TIERS,
  isProviderComingSoon,
  resolveAICapabilities,
  tierForProvider,
} from '@/lib/ai-registry';

/**
 * The AI capability registry is the single answer to "what can the assistant do
 * right now" — the sibling of lib/item-registry.ts. These tests exist mostly to
 * stop the failure mode it was built to prevent: a surface offering an action
 * the configured provider cannot actually perform.
 */

describe('tierForProvider', () => {
  it('maps a gateway to the agent tier and BYOK to assistant', () => {
    expect(tierForProvider('openclaw')).toBe('agent');
    expect(tierForProvider('openai')).toBe('assistant');
    expect(tierForProvider('none')).toBe('none');
  });

  it('keeps not-yet-implemented providers out of a capable tier', () => {
    // Anthropic is selectable in settings but has no transport. If it resolved
    // to the assistant tier, surfaces would offer "ask for a plan", and the
    // route would answer with an error string.
    expect(isProviderComingSoon('anthropic')).toBe(true);
    expect(tierForProvider('anthropic')).toBe('none');
  });
});

describe('resolveAICapabilities', () => {
  it('gives the agent tier delegation and background work', () => {
    const caps = resolveAICapabilities('openclaw', 'connected');
    expect(caps).toMatchObject({
      canChat: true,
      canPropose: true,
      canDelegate: true,
      canRunBackground: true,
      hasServerSessions: true,
    });
  });

  it('never offers delegation on the assistant tier', () => {
    // Faking background work on a bare completions API would mean rebuilding a
    // tool loop and a task queue inside dsul — explicitly not the plan.
    const caps = resolveAICapabilities('openai', 'connected');
    expect(caps.canPropose).toBe(true);
    expect(caps.canDelegate).toBe(false);
    expect(caps.canRunBackground).toBe(false);
  });

  it('degrades an unreachable gateway to assistant capabilities', () => {
    const caps = resolveAICapabilities('openclaw', 'disconnected');
    expect(caps.canDelegate).toBe(false);
    // Still named for what the user configured, so the UI can say it's offline
    // rather than silently pretending to be a different assistant.
    expect(caps.label).toBe(AI_TIERS.agent.label);
  });

  it('stays optimistic while the connection is still unknown', () => {
    // Hydration must not flicker capabilities off and back on.
    expect(resolveAICapabilities('openclaw', 'unknown').canDelegate).toBe(true);
    expect(resolveAICapabilities('openclaw').canDelegate).toBe(true);
  });

  it('turns everything off for a coming-soon provider', () => {
    const caps = resolveAICapabilities('anthropic', 'connected');
    expect(caps.canChat).toBe(false);
    expect(caps.canPropose).toBe(false);
    expect(caps.canDelegate).toBe(false);
  });

  it('turns everything off when no AI is configured', () => {
    const caps = resolveAICapabilities('none');
    expect(Object.values(caps).some((v) => v === true)).toBe(false);
  });
});
