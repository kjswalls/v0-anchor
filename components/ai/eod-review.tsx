'use client';

import { useState, useMemo, useEffect } from 'react';

import { Moon, CheckCircle2, Circle, ArrowRight, Check, X } from 'lucide-react';
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
import { shouldShowOnDate } from '@/lib/recurrence';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(tz?: string | null) {
  const resolvedTz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date().toLocaleDateString('en-CA', { timeZone: resolvedTz });
}

function tomorrowStr(tz?: string | null) {
  const resolvedTz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Parse today's date parts and add 1 day in UTC to avoid browser-TZ drift
  const [y, m, d] = todayStr(resolvedTz).split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  return tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Build a Date at UTC noon for the given YYYY-MM-DD string — safe for Calendar fromDate. */
function dateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Format a Date as YYYY-MM-DD in the given timezone (avoids browser-TZ drift in Calendar onSelect). */
function formatDateInTz(date: Date, tz?: string | null): string {
  const resolvedTz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return date.toLocaleDateString('en-CA', { timeZone: resolvedTz });
}

function actionLabel(action: TaskAction, userTimezone: string | null | undefined): string {
  if (!action) return '';
  if (action.type === 'dismissed') return 'Moved to sidebar';
  if (action.type === 'moved') {
    const tomorrow = tomorrowStr(userTimezone);
    if (action.to === tomorrow) return 'Moved to tomorrow';
    const [y, m, d] = action.to.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Rescheduled to ${formatted}`;
  }
  return '';
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskAction = { type: 'moved'; to: string } | { type: 'dismissed' } | null;

// ── Component ─────────────────────────────────────────────────────────────────

export function EODReview() {
  const { tasks, habits, updateTask, unscheduleTask } = usePlannerStore();
  const { isOpen, close, saveLastReviewDate } = useEODStore();
  const userId = usePlannerStore((s) => s.userId);
  const userTimezone = usePlannerStore((s) => s.userTimezone);

  const today = todayStr(userTimezone);

  // Partition today's tasks — live view for pending section
  const { pendingTasks: livePendingTasks } = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.startDate === today && t.status !== 'cancelled');
    return {
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

  // Partition today's habits (scoped to habits that should show today)
  const { doneHabits, skippedHabits } = useMemo(() => {
    const resolvedTz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const todayHabits = habits.filter((h) => shouldShowOnDate(h, today, resolvedTz));
    return {
      doneHabits: todayHabits.filter((h) => h.completedDates.includes(today) || h.status === 'done'),
      skippedHabits: todayHabits.filter(
        (h) =>
          h.skippedDates.includes(today) ||
          (h.status === 'skipped' && !h.completedDates.includes(today))
      ),
    };
  }, [habits, today, userTimezone]);

  // Tasks marked complete during this EOD session
  const [justCompletedIds, setJustCompletedIds] = useState<Set<string>>(new Set());

  // Per-task pill actions (replaces selectedIds)
  const [taskActions, setTaskActions] = useState<Map<string, TaskAction>>(new Map());

  // Undo stack: stores previous state before an action was taken
  type UndoEntry = { startDate: string | null | undefined; isScheduled?: boolean; timeBucket?: string; startTime?: string | null };
  const [undoStack, setUndoStack] = useState<Map<string, UndoEntry>>(new Map());

  // Which task's date picker popover is open (desktop only)
  const [datePickerOpenId, setDatePickerOpenId] = useState<string | null>(null);

  // Reset session state when modal closes so stale data doesn't persist into next open
  useEffect(() => {
    if (!isOpen) {
      setTaskActions(new Map());
      setUndoStack(new Map());
      setDatePickerOpenId(null);
    }
  }, [isOpen]);

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
      if (!next.has(id)) next.set(id, { startDate: task?.startDate ?? null, startTime: task?.startTime ?? null });
      return next;
    });
    setTaskActions((prev) => { const next = new Map(prev); next.set(id, { type: 'moved', to: date }); return next; });
    updateTask(id, { startDate: date });
  };

  const handleDismiss = (id: string) => {
    const task = pendingTasks.find((t) => t.id === id);
    setUndoStack((prev) => {
      const next = new Map(prev);
      if (!next.has(id)) next.set(id, { startDate: task?.startDate ?? null, isScheduled: task?.isScheduled, timeBucket: task?.timeBucket, startTime: task?.startTime ?? null });
      return next;
    });
    setTaskActions((prev) => { const next = new Map(prev); next.set(id, { type: 'dismissed' }); return next; });
    unscheduleTask(id);
  };

  const handleUndo = (id: string) => {
    const prev = undoStack.get(id);
    if (!prev) return;
    if (prev.isScheduled !== undefined) {
      updateTask(id, { startDate: prev.startDate ?? undefined, isScheduled: prev.isScheduled, timeBucket: prev.timeBucket as any, startTime: prev.startTime ?? undefined });
    } else {
      updateTask(id, { startDate: prev.startDate ?? undefined, startTime: prev.startTime ?? undefined });
    }
    setTaskActions((s) => { const next = new Map(s); next.delete(id); return next; });
    setUndoStack((s) => { const next = new Map(s); next.delete(id); return next; });
  };

  const handleMoveAllToTomorrow = () => {
    const tomorrow = tomorrowStr(userTimezone);
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
                          /* After action: show action label + Undo link */
                          <button
                            data-testid={`eod-undo-btn-${task.id}`}
                            onClick={() => handleUndo(task.id)}
                            className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {actionLabel(action, userTimezone)} · <span className="underline">Undo</span>
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
                              onClick={() => handleMoveTo(task.id, tomorrowStr(userTimezone))}
                            >
                              Tomorrow
                              <ArrowRight className="h-3 w-3" />
                            </Button>

                            {/* 📅 Date picker — native input overlaid on mobile, Popover on desktop */}
                            <div className="relative">
                              <Popover
                                open={datePickerOpenId === task.id}
                                onOpenChange={(open) => setDatePickerOpenId(open ? task.id : null)}
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
                                    fromDate={dateFromYmd(tomorrowStr(userTimezone))}
                                    onSelect={(date) => {
                                      if (date) {
                                        handleMoveTo(task.id, formatDateInTz(date, userTimezone));
                                        setDatePickerOpenId(null);
                                      }
                                    }}
                                  />
                                </PopoverContent>
                              </Popover>
                              {/* Native date input overlaid on button — reliable tap target on mobile */}
                              <input
                                type="date"
                                min={tomorrowStr(userTimezone)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer sm:hidden"
                                onChange={(e) => {
                                  if (e.target.value) handleMoveTo(task.id, e.target.value);
                                }}
                              />
                            </div>

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
          {pendingTasks.length === 0 &&
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
