'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AISettingsStore {
  provider: 'openai'
  apiKey: string
  model: string
  assistantName: string
  personality: string
  systemPrompt: string
  setProvider: (provider: 'openai') => void
  setApiKey: (key: string) => void
  setModel: (model: string) => void
  setAssistantName: (name: string) => void
  setPersonality: (personality: string) => void
  setSystemPrompt: (prompt: string) => void
}

const DEFAULT_SYSTEM_PROMPT =
  'You are Beacon, a warm and encouraging AI assistant built into Anchor — a daily planner for neurodivergent people. ' +
  'You have full visibility into the user\'s current tasks, habits, and projects. ' +
  'Help them plan their day, break down overwhelming tasks, celebrate progress, and stay focused. ' +
  'Be concise, warm, and never judgmental. When you reference their tasks or habits, be specific — you can see exactly what they\'re working on.'

export const useAISettingsStore = create<AISettingsStore>()(
  persist(
    (set) => ({
      provider: 'openai',
      apiKey: '',
      model: 'gpt-4o-mini',
      assistantName: 'Beacon',
      personality: 'warm',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      setAssistantName: (assistantName) => set({ assistantName }),
      setPersonality: (personality) => set({ personality }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
    }),
    { name: 'anchor-ai-settings' }
  )
)
