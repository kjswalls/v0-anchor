'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ArrowUp, Sparkles, MessageSquarePlus, Copy, Check, Plus, Mic, GripVertical, User } from 'lucide-react'
import { usePlannerStore } from '@/lib/planner-store'
import { buildAnchorContext } from '@/lib/ai-context'
import { createClient } from '@/lib/supabase'
import { isOnboardingComplete } from '@/lib/user-profile'
import { OnboardingChat } from './onboarding-chat'
import { useAISettingsStore } from '@/lib/ai-settings-store'
import { BEACON_SYSTEM_PROMPT } from '@/lib/beacon-system-prompt'
import { useSidebarStore } from '@/lib/sidebar-store'
import { cn } from '@/lib/utils'
import { useTimeFormat } from '@/lib/use-time-format'
import { formatChatTimestamp } from '@/lib/format-chat-timestamp'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { stripReasoningTags } from '@/lib/chat-utils'
import { TypingIndicator } from '@/components/ui/typing-indicator'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}


const HISTORY_KEY = 'anchor-chat-history'
const WIDTH_KEY = 'anchor-chat-sidebar-width'
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000
const ASSISTANT_NAME = 'Beacon'
const OPENCLAW_NAME = 'OpenClaw'
const MIN_WIDTH = 320
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 380

interface ChatSidebarProps {
  onOpenSettings?: () => void;
}

export function ChatSidebar({ onOpenSettings }: ChatSidebarProps) {
  const { rightSidebarOpen: isOpen, rightSidebarHovered, rightSidebarHoverEnabled, setRightSidebarOpen: setIsOpen, toggleRightSidebar, setRightSidebarHovered } = useSidebarStore()
  const isVisible = isOpen || (rightSidebarHoverEnabled && rightSidebarHovered)
  const timeFormatStr = useTimeFormat()
  const userTimezone = usePlannerStore((s) => s.userTimezone)
  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [openclawChatUrl, setOpenclawChatUrl] = useState<string | null>(null)
  const [openclawAgentIdDisplay, setOpenclawAgentIdDisplay] = useState<string | null>(null)
  const [openclawAnchorApiKey, setOpenclawAnchorApiKey] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const aiProvider = useAISettingsStore((s) => s.provider)
  const aiApiKey = useAISettingsStore((s) => s.apiKey)
  const prevAiProviderRef = useRef(aiProvider)
  const displayName = aiProvider === 'openclaw' ? OPENCLAW_NAME : ASSISTANT_NAME

  // Check auth + onboarding status
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      setUserId(uid)
      const done = await isOnboardingComplete(uid)
      if (!done) setShowOnboarding(true)
    })
  }, [])

  const handleOnboardingComplete = (_profileMd: string | null) => {
    setShowOnboarding(false)
  }

  // Fetch plugin chat URL, agent id, and Anchor API key when OpenClaw is selected
  useEffect(() => {
    if (aiProvider !== 'openclaw') {
      setOpenclawChatUrl(null)
      setOpenclawAgentIdDisplay(null)
      setOpenclawAnchorApiKey(null)
      return
    }
    fetch('/api/agent/chat-url')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((chatData) => {
        setOpenclawChatUrl(chatData.chatUrl ?? null)
        setOpenclawAgentIdDisplay(chatData.agentId ?? null)
        setOpenclawAnchorApiKey(chatData.anchorApiKey ?? null)
      })
      .catch(() => {
        setOpenclawChatUrl(null)
        setOpenclawAgentIdDisplay(null)
        setOpenclawAnchorApiKey(null)
      })
  }, [aiProvider])

  // New provider → fresh transcript (avoid mixing Beacon / OpenClaw threads)
  useEffect(() => {
    if (prevAiProviderRef.current !== aiProvider) {
      setMessages([])
      try {
        localStorage.removeItem(HISTORY_KEY)
      } catch { /* ignore */ }
    }
    prevAiProviderRef.current = aiProvider
  }, [aiProvider])

  // Load chat history and width from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.savedAt && Date.now() - parsed.savedAt < HISTORY_TTL_MS && Array.isArray(parsed.messages)) {
          setMessages(parsed.messages)
        } else {
          localStorage.removeItem(HISTORY_KEY)
        }
      }
      const savedWidth = localStorage.getItem(WIDTH_KEY)
      if (savedWidth) {
        const w = parseInt(savedWidth, 10)
        if (w >= MIN_WIDTH && w <= MAX_WIDTH) setSidebarWidth(w)
      }
    } catch { localStorage.removeItem(HISTORY_KEY) }
  }, [])

  // Save chat history
  useEffect(() => {
    if (messages.length === 0) return
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify({ messages, savedAt: Date.now() }))
    } catch { /* ignore */ }
  }, [messages])

  // Save width
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(sidebarWidth))
    } catch { /* ignore */ }
  }, [sidebarWidth])

  // Mark as mounted
  useEffect(() => {
    setMounted(true)
  }, [])

  // Abort any in-flight OpenClaw request on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // Focus input when sidebar opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen])

  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom — scroll within container, not the whole page
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages, isLoading, isTyping])

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [input])

  // Resize handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return
      const containerRight = sidebarRef.current.getBoundingClientRect().right
      const newWidth = containerRight - e.clientX
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const copyMessage = useCallback((content: string, index: number) => {
    navigator.clipboard.writeText(content)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMessage: Message = { role: 'user', content: text, timestamp: Date.now() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)
    setMessages((prev) => [...prev, { role: 'assistant', content: '', timestamp: Date.now() }])

    try {
      const { tasks, habits, projects, habitGroups } = usePlannerStore.getState()
      const context = buildAnchorContext({ tasks, habits, projects, habitGroups })
      // Intentionally reading fresh values via getState() to avoid stale closures.
      const { provider, apiKey, model, systemPrompt } = useAISettingsStore.getState()
      const effectiveSystemPrompt = systemPrompt || BEACON_SYSTEM_PROMPT



      if (provider === 'openclaw') {
        if (!openclawChatUrl) {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                role: 'assistant',
                content:
                  'OpenClaw not connected yet — run `openclaw anchor-context setup` and set publicUrl in openclaw.json.',
                timestamp: Date.now(),
              }
            }
            return next
          })
          setIsLoading(false)
          return
        }
        setIsTyping(true)
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        try {
          const res = await fetch(openclawChatUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(openclawAnchorApiKey ? { Authorization: `Bearer ${openclawAnchorApiKey}` } : {}),
            },
            signal: controller.signal,
            body: JSON.stringify({ message: text, sessionKey: 'anchor-chat', context }),
          })
          if (!res.body) throw new Error('No response body')
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let accumulated = ''
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
                const parsed = JSON.parse(payload)
                if (parsed.error) {
                  // Don't clobber existing content; only set error if nothing received yet
                  if (!accumulated) accumulated = `Error: ${parsed.error}`
                  break
                } else if (parsed.content) {
                  accumulated += parsed.content
                }
              } catch { /* skip malformed */ }
            }
          }
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: stripReasoningTags(accumulated) || 'No response received.', timestamp: Date.now() }
            return next
          })
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          const msg = err instanceof Error ? err.message : 'Unknown error'
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: `Could not reach plugin: ${msg}`, timestamp: Date.now() }
            return next
          })
        } finally {
          if (abortRef.current === controller) abortRef.current = null
          setIsTyping(false)
          setIsLoading(false)
        }
        return
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, context, provider, apiKey, model, systemPrompt: effectiveSystemPrompt }),
      })

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
          next[next.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: Date.now() }
        }
        return next
      })
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, openclawChatUrl, openclawAnchorApiKey])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  if (!mounted) return null

  return (
    <TooltipProvider delayDuration={300}>
      {/* Toggle tab - always visible, positions at sidebar edge when open */}
      <button
        onClick={toggleRightSidebar}
        aria-label="Toggle AI assistant"
        title={isOpen ? 'Collapse chat (Cmd+])' : 'Expand chat (Cmd+])'}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-30',
          'flex items-center gap-1.5 px-1.5 py-3',
          'rounded-l-lg border border-r-0 border-border',
          'bg-card text-foreground shadow-md',
          'hover:bg-accent transition-colors duration-200',
        )}
        style={{ right: isVisible ? sidebarWidth : 0 }}
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </button>

      {/* Sidebar panel */}
      {isVisible && (
        <div
          ref={sidebarRef}
          data-tour="right-sidebar"
          className={cn(
            'absolute right-0 top-0 h-full max-h-full min-h-0 z-20 flex transition-all duration-200',
            rightSidebarHovered && !isOpen && 'shadow-xl'
          )}
          style={{ width: sidebarWidth }}
          onMouseLeave={() => rightSidebarHovered && setRightSidebarHovered(false)}
        >
          {/* Resize handle */}
          <div
            className={cn(
              'w-1 hover:w-1.5 cursor-col-resize flex items-center justify-center group transition-all',
              'hover:bg-primary/20',
              isResizing && 'w-1.5 bg-primary/30'
            )}
            onMouseDown={handleMouseDown}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
          </div>

          {/* Main panel */}
          <div className="flex-1 flex flex-col min-h-0 max-h-full bg-background border-l border-border shadow-2xl overflow-hidden">
            {/* Onboarding */}
            {showOnboarding && userId ? (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <OnboardingChat userId={userId} onComplete={handleOnboardingComplete} />
              </div>
            ) : (
              <>
                <div className="shrink-0 px-3 py-2 border-b border-border bg-background">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {aiProvider === 'openclaw'
                      ? openclawAgentIdDisplay
                        ? `OpenClaw · ${openclawAgentIdDisplay}`
                        : 'OpenClaw'
                      : 'Beacon'}
                  </p>
                </div>
                {/* Messages with fade at top */}
                <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto relative">
                  {/* Gradient fade at top */}
                  <div className="sticky top-0 h-12 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />

                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-0 flex-1 py-8 px-6 text-center gap-3">
                      <div className="relative">
                        <MessageSquarePlus className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
                        <Sparkles className="h-4 w-4 text-primary/60 absolute -top-1 -right-1" />
                      </div>
                      {aiProvider === 'openai' && !aiApiKey ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">API key needed</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Beacon needs an API key to get started.
                          </p>
                          {onOpenSettings && (
                            <button
                              onClick={onOpenSettings}
                              className="text-xs text-primary hover:underline"
                            >
                              → Go to Settings
                            </button>
                          )}
                        </div>
                      ) : (
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
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 px-4 pb-4 -mt-8">
                      {messages.map((msg, i) => (
                        <div key={i} className="group">
                          {msg.role === 'user' ? (
                            // User message - right aligned with avatar
                            <div className="flex items-start gap-3 justify-end">
                              <div className="flex flex-col items-end gap-1 max-w-[85%]">
                                <div className="bg-zinc-200 dark:bg-zinc-800 text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                                  {msg.content}
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {msg.timestamp && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {formatChatTimestamp(msg.timestamp, timeFormatStr, userTimezone)}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => copyMessage(msg.content, i)}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    {copiedIndex === i ? (
                                      <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          ) : (
// Assistant message - left aligned, no bubble, with markdown
                          <div className="flex flex-col gap-1">
                            <div className="text-sm leading-relaxed text-foreground break-words prose prose-sm dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:bg-zinc-800 prose-code:text-cyan-400 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-zinc-900 prose-pre:p-3 prose-pre:rounded-lg prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground max-w-none">
                              {msg.content ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripReasoningTags(msg.content).replace(/^\[\[reply_to[^\]]*\]\]\s*/i, '')}</ReactMarkdown>
                              ) : (isTyping && i === messages.length - 1 ? <TypingIndicator /> : (isLoading && i === messages.length - 1 ? <LoadingDots /> : null))}
                            </div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {msg.timestamp && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatChatTimestamp(msg.timestamp, timeFormatStr, userTimezone)}
                                  </span>
                                )}
                                {msg.content && (
                                  <button
                                    onClick={() => copyMessage(msg.content, i)}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    {copiedIndex === i ? (
                                      <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                        <div className="text-sm text-foreground">
                          <LoadingDots />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Input area */}
                <div className="px-3 pb-3 pt-2 shrink-0">
                  <div className="rounded-2xl border border-border bg-muted/30 focus-within:border-border focus-within:bg-muted/50 transition-colors">
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message ${displayName}...`}
                      rows={1}
                      className="resize-none min-h-0 text-sm leading-6 py-3 px-4 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none placeholder:text-muted-foreground/60"
                      disabled={isLoading}
                    />
                    <div className="flex items-center justify-between px-2 pb-2">
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                              disabled
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Attach files (coming soon)</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-1">
                        {input.trim() ? (
                          <Button
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={sendMessage}
                            disabled={isLoading}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                                disabled
                              >
                                <Mic className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Voice input (coming soon)</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </TooltipProvider>
  )
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground opacity-60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  )
}
