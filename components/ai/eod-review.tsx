'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addDays } from 'date-fns';
import { Moon, CheckCircle2, Circle, ArrowRight, Sparkles, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { usePlannerStore } from '@/lib/planner-store';
import { useEODStore } from '@/lib/eod-store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

function tomorrowStr() {
  return format(addDays(new Date(), 1), 'yyyy-MM-dd');
}

function encouragingMessage(completedCount: number, totalCount: number): string {
  if (totalCount === 0) return "A fresh slate today — sometimes that's exactly what you need.";
  if (completedCount === totalCount)
    return "You wrapped up everything on your list today. That's a genuinely great day.";
  if (completedCount === 0)
    return "Some days are for rest and regrouping. What matters is you showed up.";
  const pct = completedCount / totalCount;
  if (pct >= 0.75) return "You got the big stuff done. The rest carries forward with ease.";
  if (pct >= 0.5) return "More than halfway through — that's solid progress worth celebrating.";
  return "Every task you touched today moved things forward. That counts.";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskAction = { type: 'moved'; to: string } | { type: 'dismissed' } | null;

// ── Component ─────────────────────────────────────────────────────────────────

export function EODReview() {
  const { tasks, habits, updateTask } = usePlannerStore();
  const { isOpen, close, saveLastReviewDate } = useEODStore();
  const userId = usePlannerStore((s) => s.userId);

  const today = todayStr();

  // Partition today's tasks — live view for completed section
  const { completedTasks, pendingTasks: livePendingTasks } = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.startDate === today && t.status !== 'cancelled');
    return {
      completedTasks: todayTasks.filter((t) => t.status === 'completed'),
      // Note: recurring tasks won't appear here — their startDate is the series start date,
      // not today, so they're excluded naturally by the startDate === today filter above.
      pendingTasks: todayTasks.filter((t) => t.status === 'pending'),
    };
  }, [tasks, today]);

  // Snapshot pendingTasks at dialog open time so tasks marked done during
  // the session don't disappear from the list (circle stays visible for undo).
  const [pendingTasksSnapshot, setPendingTasksSnapshot] = useState<typeof livePendingTasks>(livePendingTasks);
  useEffect(() => {
    if (isOpen) {
      setPendingTasksSnapshot(livePendingTasks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const pendingTasks = isOpen ? pendingTasksSnapshot : livePendingTasks;

  // Partition today's habits
  const { doneHabits, skippedHabits } = useMemo(() => {
    return {
      doneHabits: habits.filter((h) => h.completedDates.includes(today) || h.status === 'done'),
      skippedHabits: habits.filter(
        (h) =>
          h.skippedDates.includes(today) ||
          (h.status === 'skipped' && !h.completedDates.includes(today))
      ),
    };
  }, [habits, today]);

  // Tasks marked complete during this EOD session
  const [justCompletedIds, setJustCompletedIds] = useState<Set<string>>(new Set());

  // Per-task pill actions (replaces selectedIds)
  const [taskActions, setTaskActions] = useState<Map<string, TaskAction>>(new Map());

  // Undo stack: stores previous startDate before an action was taken
  const [undoStack, setUndoStack] = useState<Map<string, { startDate: string | null }>>(new Map());

  // Which task's date picker popover is open (desktop only)
  const [datePickerOpenId, setDatePickerOpenId] = useState<string | null>(null);

  // Refs to hidden <input type="date"> elements for mobile date picking
  const mobileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const handleMarkDone = (id: string) => {
    updateTask(id, { status: 'completed' });
    setJustCompletedIds((prev) => new Set(prev).add(id));
  };

  const handleUnmarkDone = (id: string) => {
    updateTask(id, { status: 'pending' });
    setJustCompletedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleMoveTo = (id: string, date: string) => {
    const task = pendingTasks.find((t) => t.id === id);
    setUndoStack((prev) => {
      const next = new Map(prev);
      if (!next.has(id)) next.set(id, { startDate: task?.startDate ?? null });
      return next;
    });
    setTaskActions((prev) => { const next = new Map(prev); next.set(id, { type: 'moved', to: date }); return next; });
    updateTask(id, { startDate: date });
  };

  const handleDismiss = (id: string) => {
    const task = pendingTasks.find((t) => t.id === id);
    setUndoStack((prev) => {
      const next = new Map(prev);
      if (!next.has(id)) next.set(id, { startDate: task?.startDate ?? null });
      return next;
    });
    setTaskActions((prev) => { const next = new Map(prev); next.set(id, { type: 'dismissed' }); return next; });
    updateTask(id, { startDate: null });
  };

  const handleUndo = (id: string) => {
    const prev = undoStack.get(id);
    if (!prev) return;
    updateTask(id, { startDate: prev.startDate });
    setTaskActions((s) => { const next = new Map(s); next.delete(id); return next; });
    setUndoStack((s) => { const next = new Map(s); next.delete(id); return next; });
  };

  const handleMoveAllToTomorrow = () => {
    const tomorrow = tomorrowStr();
    pendingTasks
      .filter((t) => !justCompletedIds.has(t.id) && !taskActions.has(t.id))
      .forEach((t) => handleMoveTo(t.id, tomorrow));
  };

  const handleDone = async () => {
    await saveLastReviewDate(userId, today);
  };

  // Count unactioned pending tasks (not completed in session, not in taskActions)
  const unactionedCount = pendingTasks.filter(
    (t) => !justCompletedIds.has(t.id) && !taskActions.has(t.id)
  ).length;

  // Use livePendingTasks for counts so encouragement copy reflects actual state
  const totalToday = completedTasks.length + livePendingTasks.length;
  const message = encouragingMessage(completedTasks.length, totalToday);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[85vh] overflow-hidden flex flex-col gap-0">
        {/* Header */}
        <DialogHeader className="pb-4">
          <DialogTitle className="text-foreground flex items-center gap-2 text-base">
            <Moon className="h-5 w-5 text-indigo-400" />
            End of day
          </DialogTitle>
          <DialogDescription className="sr-only">
            End-of-day review: celebrate wins and carry forward what's unfinished.
          </DialogDescription>
        </DialogHeader>

        {/* Beacon greeting */}
        <div className="mb-5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3">
          <p className="text-sm text-foreground leading-relaxed">
            Hey! It&apos;s end of day — let&apos;s take a quick look at how today went 🌙
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">

          {/* ── Completed tasks ───────────────────────────────── */}
          {completedTasks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Wrapped up today
                </h3>
              </div>
              <ul className="space-y-1.5">
                {completedTasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-sm text-foreground leading-snug">{task.title}</span>
                  </li>
                ))}
              </ul>

              {/* Encouraging message */}
              <p className="mt-3 text-xs text-muted-foreground italic leading-relaxed">
                {message}
              </p>
            </section>
          )}

          {/* ── Done habits ───────────────────────────────────── */}
          {doneHabits.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Habits kept
                </h3>
              </div>
              <ul className="space-y-1.5">
                {doneHabits.map((habit) => (
                  <li key={habit.id} className="flex items-center gap-2">
                    <span className="text-sm text-foreground">{habit.title}</span>
                    {habit.streak > 1 && (
                      <span className="text-xs text-amber-500">🔥 {habit.streak}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Pending tasks (carry forward) ─────────────────── */}
          {pendingTasks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="h-4 w-4 text-sky-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Carrying forward
                </h3>
              </div>
              <ul className="space-y-1">
                {pendingTasks.map((task) => {
                  const isDone = justCompletedIds.has(task.id);
                  const action = taskActions.get(task.id);
                  const hasAction = action !== undefined;

                  return (
                    <li
                      key={task.id}
                      data-testid={`eod-task-row-${task.id}`}
                      className="flex items-center gap-2 py-1"
                    >
                      {/* Done toggle — click filled circle to undo */}
                      <button
                        onClick={() => isDone ? handleUnmarkDone(task.id) : handleMarkDone(task.id)}
                        className={cn(
                          'shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors',
                          isDone
                            ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
                            : 'border-border hover:border-emerald-400 hover:bg-emerald-400/10'
                        )}
                        title={isDone ? 'Undo' : 'Mark as done'}
                      >
                        {isDone && <Check className="h-3 w-3" />}
                      </button>

                      {/* Task title */}
                      <span className={cn(
                        'flex-1 text-sm leading-snug min-w-0 truncate',
                        isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                      )}>
                        {task.title}
                      </span>

                      {/* Action pills — hidden once task is marked done */}
                      {!isDone && (
                        hasAction ? (
                          /* After action: show subtle Undo link */
                          <button
                            data-testid={`eod-undo-btn-${task.id}`}
                            onClick={() => handleUndo(task.id)}
                            className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                          >
                            Undo
                          </button>
                        ) : (
                          /* Unactioned: show pill buttons */
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Tomorrow → */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 px-2"
                              data-testid={`eod-tomorrow-btn-${task.id}`}
                              onClick={() => handleMoveTo(task.id, tomorrowStr())}
                            >
                              Tomorrow
                              <ArrowRight className="h-3 w-3" />
                            </Button>

                            {/* 📅 Date picker — Popover on desktop, native input on mobile */}
                            <Popover
                              open={datePickerOpenId === task.id}
                              onOpenChange={(open) => {
                                if (open && typeof window !== 'undefined' && window.innerWidth <= 640) {
                                  // Mobile: trigger native date input instead of popover
                                  mobileInputRefs.current.get(task.id)?.showPicker?.();
                                } else if (open) {
                                  setDatePickerOpenId(task.id);
                                } else {
                                  setDatePickerOpenId(null);
                                }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  data-testid={`eod-datepicker-btn-${task.id}`}
                                >
                                  📅
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                  mode="single"
                                  fromDate={addDays(new Date(), 1)}
                                  onSelect={(date) => {
                                    if (date) {
                                      handleMoveTo(task.id, format(date, 'yyyy-MM-dd'));
                                      setDatePickerOpenId(null);
                                    }
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                            {/* Hidden native date input — triggered by 📅 button on mobile (≤640px) */}
                            <input
                              type="date"
                              min={tomorrowStr()}
                              className="sr-only"
                              ref={(el) => {
                                if (el) mobileInputRefs.current.set(task.id, el);
                                else mobileInputRefs.current.delete(task.id);
                              }}
                              onChange={(e) => {
                                if (e.target.value) handleMoveTo(task.id, e.target.value);
                              }}
                            />

                            {/* ✕ Dismiss */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2"
                              data-testid={`eod-dismiss-btn-${task.id}`}
                              onClick={() => handleDismiss(task.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── Skipped habits ────────────────────────────────── */}
          {skippedHabits.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Circle className="h-4 w-4 text-muted-foreground/50" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Set aside today
                </h3>
              </div>
              <ul className="space-y-1.5">
                {skippedHabits.map((habit) => (
                  <li key={habit.id} className="text-sm text-muted-foreground">
                    {habit.title}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground italic">
                Tomorrow&apos;s a fresh start.
              </p>
            </section>
          )}

          {/* Empty state */}
          {completedTasks.length === 0 &&
            pendingTasks.length === 0 &&
            doneHabits.length === 0 &&
            skippedHabits.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled today — you kept the day open. That&apos;s valid.
                </p>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-border shrink-0">
          {/* Move all to tomorrow — visible whenever ≥1 unactioned pending task */}
          {unactionedCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              data-testid="eod-move-all-btn"
              onClick={handleMoveAllToTomorrow}
            >
              <ArrowRight className="h-3 w-3" />
              Move all to tomorrow
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={handleDone}>
            Done for today
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
