'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePlannerStore } from '@/lib/planner-store';
import { setOnboardingComplete } from '@/lib/user-profile';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import Image from 'next/image';

const SPOTLIGHT_PADDING = 8;

function useSpotlightRect(selector: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) { setRect(null); return; }

    const measure = () => {
      const el = document.querySelector(selector);
      if (el) setRect(el.getBoundingClientRect());
    };

    measure();
    // Re-measure on resize
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [selector]);

  return rect;
}

/**
 * Spotlight overlay using four dark rects surrounding a cutout.
 * Works reliably without clip-path/box-shadow quirks.
 */
function SpotlightOverlay({ rect, onClick }: { rect: DOMRect | null; onClick?: () => void }) {
  if (!rect) {
    return (
      <div
        className="absolute inset-0 bg-black/55 pointer-events-auto"
        onClick={onClick}
      />
    );
  }

  const top = Math.max(0, rect.top - SPOTLIGHT_PADDING);
  const left = Math.max(0, rect.left - SPOTLIGHT_PADDING);
  const right = Math.max(0, window.innerWidth - rect.right - SPOTLIGHT_PADDING);
  const bottom = Math.max(0, window.innerHeight - rect.bottom - SPOTLIGHT_PADDING);
  const holeHeight = rect.height + SPOTLIGHT_PADDING * 2;

  const bg = 'rgba(0,0,0,0.55)';
  const transition = 'all 0.3s ease';

  return (
    <>
      {/* Top */}
      <div className="absolute pointer-events-auto" style={{ top: 0, left: 0, right: 0, height: top, background: bg, transition }} onClick={onClick} />
      {/* Bottom */}
      <div className="absolute pointer-events-auto" style={{ bottom: 0, left: 0, right: 0, height: bottom, background: bg, transition }} onClick={onClick} />
      {/* Left (between top and bottom) */}
      <div className="absolute pointer-events-auto" style={{ top, left: 0, width: left, height: holeHeight, background: bg, transition }} onClick={onClick} />
      {/* Right */}
      <div className="absolute pointer-events-auto" style={{ top, right: 0, width: right, height: holeHeight, background: bg, transition }} onClick={onClick} />
    </>
  );
}

interface OnboardingTourProps {
  userId: string;
  onComplete: () => void;
  onOpenSettings: () => void;
  onExpandChat?: () => void;
  onCollapseChat?: () => void;
  onSetActiveTab?: (tab: string) => void;
}

type Step = 1 | 2 | 3 | 4;

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

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back
    </button>
  );
}

export function OnboardingTour({ userId, onComplete, onOpenSettings, onExpandChat, onCollapseChat, onSetActiveTab }: OnboardingTourProps) {
  const [step, setStep] = useState<Step>(1);
  const [taskInput, setTaskInput] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopSubStep, setDesktopSubStep] = useState<'A' | 'B' | 'C'>('A');
  const [mobileSubStep, setMobileSubStep] = useState<'A' | 'B'>('A');
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  // Spotlight selector based on current step/sub-step
  const spotlightSelector = (() => {
    if (step === 3) {
      if (!isMobile) {
        if (desktopSubStep === 'A') return '[data-tour="left-sidebar"]';
        if (desktopSubStep === 'B') return '[data-tour="timeline"]';
        if (desktopSubStep === 'C') return '[data-tour="right-sidebar"]';
      } else {
        if (mobileSubStep === 'A') return '[data-tour="tab-tasks"]';
        if (mobileSubStep === 'B') return '[data-tour="tab-schedule"]';
      }
    }
    if (step === 4 && isMobile) return '[data-tour="tab-chat"]';
    return null;
  })();
  const spotlightRect = useSpotlightRect(spotlightSelector);

  const inputRef = useRef<HTMLInputElement>(null);
  const onExpandChatRef = useRef(onExpandChat);
  const onCollapseChatRef = useRef(onCollapseChat);
  const onSetActiveTabRef = useRef(onSetActiveTab);
  useEffect(() => { onExpandChatRef.current = onExpandChat; }, [onExpandChat]);
  useEffect(() => { onCollapseChatRef.current = onCollapseChat; }, [onCollapseChat]);
  useEffect(() => { onSetActiveTabRef.current = onSetActiveTab; }, [onSetActiveTab]);
  const { addTask } = usePlannerStore();

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

  // Auto-expand/collapse chat sidebar based on desktop sub-step C
  useEffect(() => {
    if (step === 3 && !isMobile) {
      if (desktopSubStep === 'C') {
        onExpandChatRef.current?.();
      } else {
        onCollapseChatRef.current?.();
      }
    }
  }, [step, isMobile, desktopSubStep]);

  // Switch to tasks tab when reaching mobile sub-step A (step 3)
  useEffect(() => {
    if (step === 3 && isMobile) {
      if (mobileSubStep === 'A') {
        onSetActiveTabRef.current?.('tasks');
      } else if (mobileSubStep === 'B') {
        onSetActiveTabRef.current?.('schedule');
      }
    }
  }, [step, isMobile, mobileSubStep]);

  // Switch to chat tab when reaching step 4 on mobile
  useEffect(() => {
    if (step === 4 && isMobile) {
      onSetActiveTabRef.current?.('chat');
    }
  }, [step, isMobile]);

  const advanceWithExit = useCallback((fn: () => void) => {
    setIsExiting(true);
    setTimeout(() => {
      setIsExiting(false);
      fn();
    }, 280);
  }, []);

  const handleNext = useCallback(() => {
    if (step === 3 && !isMobile) {
      if (desktopSubStep === 'A') { setDesktopSubStep('B'); return; }
      if (desktopSubStep === 'B') { setDesktopSubStep('C'); return; }
    }
    if (step === 3 && isMobile) {
      if (mobileSubStep === 'A') { setMobileSubStep('B'); return; }
    }
    if (step < 4) {
      setStep((s) => (s + 1) as Step);
    } else if (step === 4) {
      handleComplete();
    }
  }, [step, isMobile, desktopSubStep, mobileSubStep]);

  const handleBack = useCallback(() => {
    if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      if (!isMobile) {
        if (desktopSubStep === 'A') {
          setStep(2);
        } else if (desktopSubStep === 'B') {
          setDesktopSubStep('A');
        } else if (desktopSubStep === 'C') {
          setDesktopSubStep('B');
        }
      } else {
        if (mobileSubStep === 'A') {
          setStep(2);
        } else {
          setMobileSubStep('A');
        }
      }
    } else if (step === 4) {
      setDesktopSubStep('C');
      setMobileSubStep('B');
      setStep(3);
    }
  }, [step, isMobile, desktopSubStep, mobileSubStep]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step === 2) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, handleNext]);

  const handleSkip = async () => {
    onCollapseChatRef.current?.();
    onSetActiveTabRef.current?.('tasks');
    setIsVisible(false);
    await setOnboardingComplete(userId);
    onComplete();
  };

  const handleCreateTask = async () => {
    if (isCreatingTask) return;
    setIsCreatingTask(true);

    if (taskInput.trim()) {
      // Add as unscheduled task (no timeBucket, no startDate) → appears in sidebar
      addTask({ title: taskInput.trim() });
      try {
        confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 }, colors: ['#a855f7', '#6366f1', '#ec4899'] });
      } catch (_) {
        // confetti may fail on some mobile browsers — non-fatal
      }
      advanceWithExit(() => {
        setIsCreatingTask(false);
        setStep(3);
      });
    } else {
      setIsCreatingTask(false);
      setStep(3);
    }
  };

  const handleComplete = async () => {
    onCollapseChatRef.current?.();
    onSetActiveTabRef.current?.('tasks');
    setIsVisible(false);
    toast.success("You're all set ✨ One thing at a time — you've got this.", {
      description: 'Tip: replay this tour anytime from Settings.',
      duration: 5000,
    });
    await setOnboardingComplete(userId);
    onComplete();
  };

  if (!isVisible) return null;

  const exitClass = isExiting ? 'animate-out fade-out zoom-out-95 duration-300' : '';

  // ─── Step 1: Welcome ────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

        <div className={cn('relative z-10 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-300', exitClass)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center gap-6">
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

            <div className="w-full flex items-center justify-between">
              <SkipButton onSkip={handleSkip} />
              <Button
                className="gap-2"
                onClick={() => setStep(2)}
              >
                Let&apos;s go
                <ArrowRight className="h-4 w-4" />
              </Button>
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

        <div className={cn('relative z-10 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-300', exitClass)}>
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
              <BackButton onBack={handleBack} />
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(3)}
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
    // Mobile: two sub-steps (tasks tab, then schedule tab)
    if (isMobile) {
      const mobileContent = {
        A: {
          title: 'Your tasks live here',
          description: "Head to Schedule to plan when you'll do them.",
        },
        B: {
          title: 'Plan your day',
          description: 'Drag tasks here to block time, or tap a time slot to add one.',
        },
      };
      const mc = mobileContent[mobileSubStep];
      const mobileSubIndex = mobileSubStep === 'A' ? 0 : 1;

      return (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          <SpotlightOverlay rect={spotlightRect} onClick={handleNext} />
          <div className="absolute bottom-20 left-4 right-4 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-card border border-border rounded-xl shadow-xl p-4 flex flex-col gap-3">
              <p className="text-sm text-foreground font-medium">{mc.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{mc.description}</p>
              <div className="flex items-center justify-between">
                <BackButton onBack={handleBack} />
                <Button size="sm" onClick={handleNext}>
                  {mobileSubStep === 'B' ? 'Next →' : 'Next'}
                </Button>
              </div>
              <div className="flex justify-center gap-1">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-full transition-all',
                      i === mobileSubIndex ? 'w-3 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-muted-foreground/30'
                    )}
                  />
                ))}
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
      },
      B: {
        title: 'Plan your day',
        description: 'Drag tasks here to plan your day.',
        position: 'left-1/2 -translate-x-1/2 top-24',
      },
      C: {
        title: 'Your AI chat',
        description: 'Your AI chat lives here — more on that next.',
        position: 'right-[340px] top-1/2 -translate-y-1/2',
      },
    };

    const current = subStepContent[desktopSubStep];
    const subStepIndex = desktopSubStep === 'A' ? 0 : desktopSubStep === 'B' ? 1 : 2;

    return (
      <div className="fixed inset-0 z-[100] pointer-events-none">
        <SpotlightOverlay rect={spotlightRect} onClick={handleNext} />
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
              <BackButton onBack={handleBack} />
              <Button size="sm" onClick={handleNext}>
                {desktopSubStep === 'C' ? 'Next →' : 'Next'}
              </Button>
            </div>
            <div className="flex justify-center gap-1">
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
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 4: AI Chat (coach mark) ───────────────────────────────────────────
  if (step === 4) {
    // Mobile: tooltip card above the tab bar (chat tab already active via effect)
    if (isMobile) {
      return (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          <SpotlightOverlay rect={spotlightRect} />
          <div className="absolute bottom-20 left-4 right-4 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-card border border-border rounded-xl shadow-xl p-4 flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground">Your planning buddy ✨</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect OpenClaw or bring your own API key to use Beacon. Configure anytime in Settings.
              </p>
              <div className="flex items-center justify-between">
                <BackButton onBack={handleBack} />
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
                    Settings
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

    // Desktop: non-fullscreen coach mark card to the left of chat sidebar
    return (
      <div className="fixed inset-0 z-[100] pointer-events-none">
        <div
          className="absolute right-[340px] top-1/2 -translate-y-1/2 pointer-events-auto animate-in fade-in zoom-in-95 duration-300"
        >
          <div className="bg-card border border-border rounded-xl shadow-2xl p-4 w-72 flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">Your planning buddy ✨</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Connect OpenClaw or bring your own API key to use Beacon. Configure anytime in Settings.
            </p>
            <div className="flex items-center justify-between">
              <BackButton onBack={handleBack} />
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
                  Settings
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

export type { OnboardingTourProps };
