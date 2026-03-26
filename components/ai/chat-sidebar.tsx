'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { X, Send, Sparkles, MessageSquarePlus, Trash2 } from 'lucide-react'
import { usePlannerStore } from '@/lib/planner-store'
import { buildAnchorContext } from '@/lib/ai-context'
import { createClient } from '@/lib/supabase'
import { isOnboardingComplete, getUserProfile } from '@/lib/user-profile'
import { OnboardingChat } from './onboarding-chat'
import { useAISettingsStore, PERSONALITY_PROMPTS } from '@/lib/ai-settings-store'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const STORAGE_KEY = 'anchor-chat-sidebar-open'
const ASSISTANT_NAME = 'Beacon'
const OPENCLAW_NAME = 'OpenClaw'

export function ChatSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<string | null>(null)
  const [openclawChatUrl, setOpenclawChatUrl] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const aiProvider = useAISettingsStore((s) => s.provider)
  const displayName = aiProvider === 'openclaw' ? OPENCLAW_NAME : ASSISTANT_NAME

  // Check auth + load profile (don't gate on onboarding completion)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      setUserId(uid)

      // Always load profile if it exists
      const profile = await getUserProfile(uid)
      setUserProfile(profile)

      // Only show onboarding if not complete AND no profile yet
      if (!profile) {
        const done = await isOnboardingComplete(uid)
        if (!done) setShowOnboarding(true)
      }
    })
  }, [])

  const handleOnboardingComplete = (profileMd: string | null) => {
    setShowOnboarding(false)
    setUserProfile(profileMd)
  }

  // Fetch stored OpenClaw chat URL + Anchor API key when provider is openclaw
  useEffect(() => {
    if (aiProvider !== 'openclaw') return
    Promise.all([
      fetch('/api/openclaw/chat-url').then((r) => r.json()),
      fetch('/api/openclaw/apikey').then((r) => r.json()),
    ])
      .then(([chatData, keyData]) => {
        setOpenclawChatUrl(chatData.chatUrl ?? null)
        // Store the Anchor API key so we can use it for auth without the user pasting it
        if (keyData.apiKey) useAISettingsStore.getState().setOpenclawApiKey(keyData.apiKey)
      })
      .catch(() => setOpenclawChatUrl(null))
  }, [aiProvider])

  // Restore open state
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'true') setIsOpen(true)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(isOpen)) } catch { /* ignore */ }
  }, [isOpen])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [input])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMessage: Message = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const { tasks, habits, projects, habitGroups } = usePlannerStore.getState()
      const context = buildAnchorContext({ tasks, habits, projects, habitGroups, userProfile: userProfile ?? undefined })
      const { provider, apiKey, model, personality, systemPrompt, openclawApiKey } =
        useAISettingsStore.getState()
      const effectiveSystemPrompt = personality === 'custom' ? systemPrompt : PERSONALITY_PROMPTS[personality]

      let res: Response

      if (provider === 'openclaw') {
        // Browser-direct: POST straight to the OpenClaw gateway chat endpoint
        if (!openclawChatUrl) {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                role: 'assistant',
                content: 'OpenClaw not connected yet — run `openclaw anchor-context setup` to connect.',
              }
            }
            return next
          })
          setIsLoading(false)
          return
        }

        const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (openclawApiKey) fetchHeaders['Authorization'] = `Bearer ${openclawApiKey}`

        res = await fetch(openclawChatUrl, {
          method: 'POST',
          headers: fetchHeaders,
          body: JSON.stringify({ message: text, sessionKey: 'anchor-chat', context }),
        })
      } else {
        // All other providers go through the /api/chat server route
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages, context, provider, apiKey, model, systemPrompt: effectiveSystemPrompt }),
        })
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') break
          try {
            const { content } = JSON.parse(payload)
            if (content) {
              setMessages((prev) => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + content }
                return next
              })
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.content === '') {
          next[next.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }
        }
        return next
      })
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, userProfile, openclawChatUrl])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <>
      {/* Toggle tab */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Toggle Beacon AI assistant"
        className={[
          'absolute right-0 top-1/2 -translate-y-1/2 z-30',
          'flex items-center gap-1.5 px-1.5 py-3',
          'rounded-l-lg border border-r-0 border-border',
          'bg-card text-foreground shadow-md',
          'hover:bg-accent transition-colors duration-200',
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100',
        ].join(' ')}
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </button>

      {/* Sidebar panel — absolute, scoped to parent (main) height */}
      <div
        className={[
          'absolute right-0 top-0 h-full w-[320px] z-20',
          'flex flex-col',
          'bg-card border-l border-border shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {displayName}
          </span>
          <div className="flex items-center gap-0.5">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setMessages([])}
                title="Clear conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Onboarding */}
        {showOnboarding && userId ? (
          <div className="flex-1 overflow-y-auto">
            <OnboardingChat userId={userId} onComplete={handleOnboardingComplete} />
          </div>
        ) : (
          <>
            {/* Message list — flex-1 + overflow-y-auto keeps it scrollable within fixed panel */}
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
                  <div className="relative">
                    <MessageSquarePlus className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
                    <Sparkles className="h-4 w-4 text-primary/60 absolute -top-1 -right-1" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {aiProvider === 'openclaw' ? `${displayName} is ready` : `Plan with ${displayName}`}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {aiProvider === 'openclaw'
                        ? `Ask anything — ${displayName} knows your tasks, habits, and projects.`
                        : aiProvider === 'none'
                        ? <span>Connect <span className="text-foreground font-medium">OpenClaw</span> in Settings for your personal AI agent, or add an OpenAI key to use Beacon.</span>
                        : 'Ask me to break down tasks, plan your day, or think through what to tackle next.'
                      }
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 px-4 py-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={['flex', msg.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}>
                      <div className={[
                        'max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm',
                      ].join(' ')}>
                        {msg.content || (msg.role === 'assistant' && isLoading && i === messages.length - 1
                          ? <LoadingDots />
                          : null
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2"><LoadingDots /></div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="px-3 pb-3 pt-2 shrink-0">
              <div className="rounded-xl border border-border bg-background focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-colors">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask ${displayName} anything…`}
                  rows={1}
                  className="resize-none min-h-0 text-sm leading-6 py-3 px-3 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                  disabled={isLoading}
                />
                <div className="flex items-center justify-between px-2 pb-2">
                  <span className="text-[10px] text-muted-foreground/50 pl-1">⏎ send · ⇧⏎ newline</span>
                  <Button
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  )
}
