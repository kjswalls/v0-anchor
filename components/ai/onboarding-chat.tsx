'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles, Send } from 'lucide-react'
import { saveUserProfile, setOnboardingComplete } from '@/lib/user-profile'

interface OnboardingChatProps {
  userId: string
  onComplete: (profileMd: string | null) => void
}

const QUESTIONS = [
  "What should I call you?",
  "What kind of work or projects do you focus on in Anchor?",
  "Any goals you are working toward right now?",
]

interface Message {
  role: 'beacon' | 'user'
  content: string
}

export function OnboardingChat({ userId, onComplete }: OnboardingChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'beacon',
      content: "Hey! I'm Beacon, your AI planning assistant. I'd love to learn a bit about you so I can give you more personalized help. " + QUESTIONS[0],
    },
  ])
  const [input, setInput] = useState('')
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const handleSend = async () => {
    const text = input.trim()
    if (!text || saving) return

    const newAnswers = [...answers, text]
    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setInput('')

    if (step < QUESTIONS.length - 1) {
      const nextStep = step + 1
      newMessages.push({ role: 'beacon', content: QUESTIONS[nextStep] })
      setMessages(newMessages)
      setAnswers(newAnswers)
      setStep(nextStep)
    } else {
      // All answers collected
      setSaving(true)
      newMessages.push({
        role: 'beacon',
        content: `Thanks, ${newAnswers[0]}! I've got everything I need. I'll use this to make your planning experience more personal. Let's get to work! 🌿`,
      })
      setMessages(newMessages)

      const profileMd = `Name: ${newAnswers[0]}\nFocus: ${newAnswers[1]}\nGoals: ${newAnswers[2]}`
      await saveUserProfile(userId, profileMd)
      await setOnboardingComplete(userId)
      setSaving(false)
      setTimeout(() => onComplete(profileMd), 1200)
    }
  }

  const handleSkip = async () => {
    setSaving(true)
    await setOnboardingComplete(userId)
    setSaving(false)
    onComplete(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const done = step >= QUESTIONS.length

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      {/* Message bubbles */}
      <div className="flex flex-col gap-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={['flex', msg.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}
          >
            {msg.role === 'beacon' && (
              <Sparkles className="h-3 w-3 text-primary mt-1.5 mr-1.5 shrink-0" />
            )}
            <div
              className={[
                'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm',
              ].join(' ')}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      {!done && (
        <div className="flex items-end gap-2 mt-1">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer…"
            rows={1}
            className="resize-none min-h-0 text-xs leading-5 py-1.5 flex-1"
            disabled={saving}
          />
          <Button
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || saving}
            aria-label="Send"
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Skip */}
      {!done && (
        <button
          onClick={handleSkip}
          disabled={saving}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors text-center mt-0.5"
        >
          Skip for now
        </button>
      )}
    </div>
  )
}
