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

export interface AISettingsStore extends AISettings {
  setProvider: (provider: AIProvider) => void;
  setApiKey: (apiKey: string) => void;
  setModel: (model: string) => void;
  setAssistantName: (name: string) => void;
  setSystemPrompt: (prompt: string) => void;
}

export const useAISettingsStore = create<AISettingsStore>()(
  persist(
    (set) => ({
      provider: 'openclaw',
      apiKey: '',
      model: 'gpt-4o-mini',
      assistantName: 'Beacon',
      systemPrompt: '',
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      setAssistantName: (assistantName) => set({ assistantName }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
    }),
    {
      name: 'anchor-ai-settings',
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
