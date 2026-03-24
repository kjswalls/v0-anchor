'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProvider = 'openclaw' | 'openai' | 'anthropic' | 'none';
export type AIPersonality = 'default' | 'professional' | 'motivational' | 'minimal' | 'custom';

export const PERSONALITY_PROMPTS: Record<AIPersonality, string> = {
  default:
    'You are Guma, a warm and encouraging AI assistant built into Anchor — a daily planner for neurodivergent people. Help users plan their day, break down tasks, stay focused, and reflect on progress. Be concise, never judgmental, and gently celebrate wins.',
  professional:
    'You are a professional productivity assistant in Anchor. Help users plan efficiently, prioritize tasks, and manage their time. Be direct, structured, and focused on outcomes.',
  motivational:
    'You are an enthusiastic coach in Anchor! Help users tackle their day with energy and positivity. Celebrate every win, reframe challenges as opportunities, and keep the momentum going!',
  minimal: 'You are a minimal AI assistant in Anchor. Answer concisely. No fluff.',
  custom: '',
};

interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
  assistantName: string;
  systemPrompt: string;
  personality: AIPersonality;
}

interface AISettingsStore extends AISettings {
  setProvider: (provider: AIProvider) => void;
  setApiKey: (apiKey: string) => void;
  setModel: (model: string) => void;
  setAssistantName: (name: string) => void;
  setSystemPrompt: (prompt: string) => void;
  setPersonality: (personality: AIPersonality) => void;
}

export const useAISettingsStore = create<AISettingsStore>()(
  persist(
    (set) => ({
      provider: 'none',
      apiKey: '',
      model: 'gpt-4o-mini',
      assistantName: 'Guma',
      systemPrompt: '',
      personality: 'default',

      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      setAssistantName: (assistantName) => set({ assistantName }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setPersonality: (personality) => set({ personality }),
    }),
    {
      name: 'anchor-ai-settings',
    }
  )
);
