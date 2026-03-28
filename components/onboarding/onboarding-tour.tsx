'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ArrowRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePlannerStore } from '@/lib/planner-store';
import { setOnboardingComplete } from '@/lib/user-profile';
import { toast } from 'sonner';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';
import Image from 'next/image';

interface OnboardingTourProps {
  userId: string;
  onComplete: () => void;
  onOpenSettings: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i + 1 === current
              ? 'w-4 h-1.5 bg-primary'
              : 'w-1.5 h-1.5 bg-muted-foreground/30'
          )}
        />
      ))}
    </div>
  );
}

function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      onClick={onSkip}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <X className="h-3.5 w-3.5" />
      Skip tour
    </button>
  );
}

export function OnboardingTour({ userId, onComplete, onOpenSettings }: OnboardingTourProps) {
  const [step, setStep] = useState<Step>(1);
  const [taskInput, setTaskInput] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopSubStep, setDesktopSubStep] = useState<'A' | 'B' | 'C'>('A');
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [addTaskPulse, setAddTaskPulse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addTask, selectedDate } = usePlannerStore();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-focus input in step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [step]);

  // Tab advances steps (except in step 2 where Tab is used in the input)
  const handleNext = useCallback(() => {
    if (step === 3 && !isMobile) {
      if (desktopSubStep === 'A') { setDesktopSubStep('B'); return; }
      if (desktopSubStep === 'B') { setDesktopSubStep('C'); return; }
    }
    if (step < 4) {
      setStep((s) => (s + 1) as Step);
    } else if (step === 4) {
      handleComplete();
    }
  }, [step, isMobile, desktopSubStep]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step === 2) return; // Let input handle its own keys
      if (e.key === 'Tab') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, handleNext]);

  const handleSkip = async () => {
    setIsVisible(false);
    await setOnboardingComplete(userId);
    onComplete();
  };

  const handleCreateTask = async () => {
    if (isCreatingTask) return;
    setIsCreatingTask(true);

    if (taskInput.trim()) {
      const today = format(selectedDate || new Date(), 'yyyy-MM-dd');
      addTask({
        title: taskInput.trim(),
        timeBucket: 'anytime',
        startDate: today,
      });
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 }, colors: ['#a855f7', '#6366f1', '#ec4899'] });
      setTimeout(() => {
        setIsCreatingTask(false);
        setStep(3);
      }, 700);
    } else {
      // Skipped: pulse the add task button
      setIsCreatingTask(false);
      setAddTaskPulse(true);
      setTimeout(() => setAddTaskPulse(false), 3000);
      setStep(3);
    }
  };

  const handleComplete = async () => {
    setIsVisible(false);
    toast.success("You're all set ✨ One thing at a time — you've got this.", {
      duration: 4000,
    });
    await setOnboardingComplete(userId);
    onComplete();
  };

  if (!isVisible) return null;

  // ─── Step 1: Welcome ────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Blurred backdrop */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

        <div className="relative z-10 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center gap-6">
            {/* App icon */}
            <div className="relative">
              <Image
                src="/icons/icon-192.png"
                alt="Anchor"
                width={80}
                height={80}
                className="rounded-2xl shadow-lg"
              />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">Welcome to Anchor ⚓</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Your calm space to plan the day.
                <br />
                Takes a few seconds to get started.
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full">
              <Button
                className="w-full gap-2"
                onClick={() => setStep(2)}
              >
                Let&apos;s go
                <ArrowRight className="h-4 w-4" />
              </Button>
              <SkipButton onSkip={handleSkip} />
            </div>

            <ProgressDots current={1} total={4} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 2: First Task ─────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

        <div className="relative z-10 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 flex flex-col gap-6">
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-foreground">
                What&apos;s one thing you want to do today?
              </h2>
              <p className="text-xs text-muted-foreground">Just one — we&apos;ll build from there.</p>
            </div>

            <Input
              ref={inputRef}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Walk the dog, call the dentist, anything..."
              className="text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTask();
              }}
              disabled={isCreatingTask}
            />

            <div className="flex items-center justify-between">
              <SkipButton onSkip={handleSkip} />
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAddTaskPulse(true);
                    setTimeout(() => setAddTaskPulse(false), 3000);
                    setStep(3);
                  }}
                  disabled={isCreatingTask}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateTask}
                  disabled={isCreatingTask}
                >
                  {isCreatingTask ? 'Adding...' : 'Add task →'}
                </Button>
              </div>
            </div>

            <div className="flex justify-center">
              <ProgressDots current={2} total={4} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 3: Tour Layout ────────────────────────────────────────────────────
  if (step === 3) {
    // Mobile: single step spotlighting bottom tab bar
    if (isMobile) {
      return (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          {/* Dim everything except tab bar */}
          <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={() => handleNext()} />
          {/* Spotlight cutout at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-transparent" />
          {/* Tooltip card above tab bar */}
          <div className="absolute bottom-20 left-4 right-4 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-card border border-border rounded-xl shadow-xl p-4 flex flex-col gap-3">
              <p className="text-sm text-foreground font-medium">Navigate your day</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Three views — your tasks, your schedule, and your AI chat. Tap or swipe to switch.
              </p>
              <div className="flex items-center justify-between">
                <SkipButton onSkip={handleSkip} />
                <div className="flex items-center gap-2">
                  <ProgressDots current={3} total={4} />
                  <Button size="sm" onClick={handleNext}>
                    Next →
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Desktop: 3 sub-steps
    const subStepContent = {
      A: {
        title: 'Your tasks & habits',
        description: 'Your tasks and habits live here. Drag them to the timeline to plan your day.',
        position: 'left-[320px] top-1/2 -translate-y-1/2',
        arrow: 'left',
      },
      B: {
        title: 'Plan your day',
        description: 'Drag tasks here to plan your day. Press ⌘ / to see keyboard shortcuts.',
        position: 'left-1/2 -translate-x-1/2 top-24',
        arrow: 'top',
      },
      C: {
        title: 'Your AI chat',
        description: 'Your AI chat lives here — more on that next.',
        position: 'right-[340px] top-1/2 -translate-y-1/2',
        arrow: 'right',
      },
    };

    const current = subStepContent[desktopSubStep];
    const subStepIndex = desktopSubStep === 'A' ? 0 : desktopSubStep === 'B' ? 1 : 2;

    return (
      <div className="fixed inset-0 z-[100] pointer-events-none">
        <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={handleNext} />
        <div
          className={cn(
            'absolute pointer-events-auto animate-in fade-in zoom-in-95 duration-200',
            current.position
          )}
        >
          <div className="bg-card border border-border rounded-xl shadow-2xl p-4 w-64 flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">{current.title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{current.description}</p>
            <div className="flex items-center justify-between">
              <SkipButton onSkip={handleSkip} />
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-full transition-all',
                        i === subStepIndex ? 'w-3 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-muted-foreground/30'
                      )}
                    />
                  ))}
                </div>
                <Button size="sm" onClick={handleNext}>
                  {desktopSubStep === 'C' ? 'Next →' : 'Next'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 4: AI Chat ────────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

        <div className="relative z-10 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 flex flex-col gap-6">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-foreground">Your planning buddy ✨</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Connect OpenClaw or bring your own API key to use Beacon. Configure anytime in Settings.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <SkipButton onSkip={handleSkip} />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleComplete();
                    setTimeout(() => onOpenSettings(), 300);
                  }}
                  className="gap-1.5"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Open Settings
                </Button>
                <Button size="sm" onClick={handleComplete}>
                  Got it →
                </Button>
              </div>
            </div>

            <div className="flex justify-center">
              <ProgressDots current={4} total={4} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Export the add-task pulse state so page.tsx can pass it to the add button
export type { OnboardingTourProps };
