'use client';

import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { Moon, CheckCircle2, Circle, ArrowRight, Sparkles, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

// ── Component ─────────────────────────────────────────────────────────────────

export function EODReview() {
  const { tasks, habits, updateTask } = usePlannerStore();
  const { isOpen, close, saveLastReviewDate } = useEODStore();
  const userId = usePlannerStore((s) => s.userId);

  const today = todayStr();

  // Partition today's tasks
  const { completedTasks, pendingTasks } = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.startDate === today && t.status !== 'cancelled');
    return {
      completedTasks: todayTasks.filter((t) => t.status === 'completed'),
      pendingTasks: todayTasks.filter((t) => t.status === 'pending'),
    };
  }, [tasks, today]);

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

  // Which pending tasks the user has checked to carry forward
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(pendingTasks.map((t) => t.id))
  );

  // Tasks marked complete during this EOD session
  const [justCompletedIds, setJustCompletedIds] = useState<Set<string>>(new Set());

  const handleMarkDone = (id: string) => {
    updateTask(id, { status: 'completed' });
    setJustCompletedIds((prev) => new Set(prev).add(id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleMoveToTomorrow = () => {
    const tomorrow = tomorrowStr();
    selectedIds.forEach((id) => {
      updateTask(id, { startDate: tomorrow });
    });
    setSelectedIds(new Set());
  };

  const handleDone = async () => {
    await saveLastReviewDate(userId, today);
  };

  const totalToday = completedTasks.length + pendingTasks.length;
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
              <p className="text-xs text-muted-foreground mb-3">
                Check the ones you&apos;d like to move to tomorrow — or leave them here for now.
              </p>
              <ul className="space-y-2">
                {pendingTasks.map((task) => (
                  <li key={task.id} className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors',
                    justCompletedIds.has(task.id) ? 'opacity-50' : ''
                  )}>
                    {/* Mark done button */}
                    <button
                      onClick={() => handleMarkDone(task.id)}
                      disabled={justCompletedIds.has(task.id)}
                      className={cn(
                        'shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors',
                        justCompletedIds.has(task.id)
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-border hover:border-emerald-400 hover:bg-emerald-400/10'
                      )}
                      title="Mark as done"
                    >
                      {justCompletedIds.has(task.id) && <Check className="h-3 w-3" />}
                    </button>

                    {/* Task title */}
                    <span className={cn(
                      'flex-1 text-sm leading-snug',
                      justCompletedIds.has(task.id) ? 'line-through text-muted-foreground' : 'text-foreground'
                    )}>
                      {task.title}
                    </span>

                    {/* Carry forward checkbox — only if not completed */}
                    {!justCompletedIds.has(task.id) && (
                      <Checkbox
                        id={`eod-task-${task.id}`}
                        checked={selectedIds.has(task.id)}
                        onCheckedChange={() => toggleSelected(task.id)}
                        className="shrink-0"
                        title="Carry to tomorrow"
                      />
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground mt-2">
                ○ mark done · ☑ carry to tomorrow
              </p>
              {selectedIds.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs gap-1.5"
                  onClick={handleMoveToTomorrow}
                >
                  <ArrowRight className="h-3 w-3" />
                  Move {selectedIds.size} to tomorrow
                </Button>
              )}
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
        <div className="flex justify-end pt-4 mt-2 border-t border-border shrink-0">
          <Button size="sm" onClick={handleDone}>
            Done for today
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
