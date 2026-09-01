'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProvider = 'openclaw' | 'openai' | 'anthropic' | 'none';

interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
  assistantName: string;
  systemPrompt: string;
}

/**
 * Every field here belongs to the ACCOUNT, not the browser — and one of them is
 * a credential.
 *
 * `dsul-ai-settings` is a browser-global localStorage key, so on a shared
 * browser this blob is whoever signed in last. `apiKey` in particular is a
 * secret the next person to sign in could read out of devtools and edit through
 * the settings UI, which is why this store is in the clear registry
 * (lib/local-state.ts) rather than merely being overwritten on the next sign-in.
 *
 * There is no server copy to restore from: unlike the reminder channels, whose
 * credentials live in `user_secrets` (service-role only, and
 * /api/reminders/secrets will say which keys are SET and never what they are),
 * the Beacon key has only ever lived here. Clearing therefore loses it and the
 * user re-enters it. See the note in lib/local-state.ts — this key wants moving
 * to `user_secrets`, which is a bigger change than a clear-on-sign-out.
 */
const USER_SCOPED_DEFAULTS: AISettings = {
  provider: 'openclaw',
  apiKey: '',
  model: 'gpt-4o-mini',
  assistantName: 'Beacon',
  systemPrompt: '',
};

export interface AISettingsStore extends AISettings {
  setProvider: (provider: AIProvider) => void;
  setApiKey: (apiKey: string) => void;
  setModel: (model: string) => void;
  setAssistantName: (name: string) => void;
  setSystemPrompt: (prompt: string) => void;
  /** Drop this account's Beacon settings — see lib/local-state.ts. */
  clearUserScopedState: () => void;
}

export const useAISettingsStore = create<AISettingsStore>()(
  persist(
    (set) => ({
      ...USER_SCOPED_DEFAULTS,
      clearUserScopedState: () => set({ ...USER_SCOPED_DEFAULTS }),
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      setAssistantName: (assistantName) => set({ assistantName }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
    }),
    {
      name: 'dsul-ai-settings',
      partialize: (state) => ({
        provider: state.provider,
        apiKey: state.apiKey,
        model: state.model,
        assistantName: state.assistantName,
        systemPrompt: state.systemPrompt,
      }),
    }
  )
);
