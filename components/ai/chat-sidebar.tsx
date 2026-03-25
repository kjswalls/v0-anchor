'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { X, Send, Sparkles } from 'lucide-react'
import { usePlannerStore } from '@/lib/planner-store'
import { buildAnchorContext } from '@/lib/ai-context'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const STORAGE_KEY = 'anchor-chat-sidebar-open'

export function ChatSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Restore open state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'true') setIsOpen(true)
    } catch {
      // ignore
    }
  }, [])

  // Persist open state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isOpen))
    } catch {
      // ignore
    }
  }, [isOpen])

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const lineHeight = 24
    const maxHeight = lineHeight * 3 + 16 // 3 lines + padding
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px'
  }, [input])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMessage: Message = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    // Placeholder for streaming assistant message
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const { tasks, habits, projects, habitGroups } = usePlannerStore.getState()
      const context = buildAnchorContext({ tasks, habits, projects, habitGroups })

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, context }),
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
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + content }
                }
                return next
              })
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (err) {
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
  }, [input, isLoading, messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Toggle button — fixed to right edge */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Toggle Beacon AI assistant"
        className={[
          'fixed right-0 top-1/2 -translate-y-1/2 z-50',
          'flex items-center gap-1.5 px-2 py-3',
          'rounded-l-xl border border-r-0 border-border',
          'bg-card text-foreground shadow-md',
          'hover:bg-accent transition-colors duration-200',
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100',
        ].join(' ')}
      >
        <Sparkles className="h-4 w-4 text-primary" />
      </button>

      {/* Sidebar panel */}
      <div
        className={[
          'fixed right-0 top-0 h-full w-80 z-40',
          'flex flex-col',
          'bg-card border-l border-border shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Beacon ✨</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Message list */}
        <ScrollArea className="flex-1 px-3 py-3" ref={scrollRef}>
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-8 px-4 leading-relaxed">
              Hi! I&apos;m Beacon, your AI planning assistant. Ask me to help break down tasks, plan your day, or just think out loud. 🌿
            </p>
          )}

          <div className="flex flex-col gap-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={[
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                ].join(' ')}
              >
                <div
                  className={[
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm',
                  ].join(' ')}
                >
                  {msg.content || (msg.role === 'assistant' && isLoading && i === messages.length - 1
                    ? <LoadingDots />
                    : null
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator when no placeholder yet */}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <LoadingDots />
                </div>
              </div>
            )}
          </div>

          <div ref={bottomRef} />
        </ScrollArea>

        {/* Input area */}
        <div className="px-3 py-3 border-t border-border shrink-0">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Beacon anything…"
              rows={1}
              className="resize-none min-h-0 text-sm leading-6 py-2 flex-1"
              disabled={isLoading}
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>

      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}
