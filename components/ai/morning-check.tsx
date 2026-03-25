'use client';

import { useState, useMemo } from 'react';
import { format, isAfter, parseISO, startOfDay } from 'date-fns';
import { Sun, ChevronDown, ChevronUp, ArrowRight, X, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePlannerStore } from '@/lib/planner-store';
import { useMorningStore } from '@/lib/morning-store';

export function MorningCheck() {
  const { tasks, updateTask } = usePlannerStore();
  const { morningCheckEnabled, morningCheckTime, dismiss, isDismissedToday } = useMorningStore();
  const [expanded, setExpanded] = useState(true);
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const now = new Date();
  const [checkHour, checkMinute] = (morningCheckTime ?? '08:00').split(':').map(Number);
  const checkTime = new Date(); checkTime.setHours(checkHour, checkMinute, 0, 0);
  const endTime = new Date(); endTime.setHours(12, 0, 0, 0);
  const isMorningWindow = now >= checkTime && now < endTime;

  const overdueTask = useMemo(() => {
    const todayStart = startOfDay(new Date());
    return tasks.filter((t) => {
      if (t.status !== 'pending') return false;
      if (!t.startDate) return false;
      if (handledIds.has(t.id)) return false;
      // startDate is before today
      const taskDate = parseISO(t.startDate);
      return isAfter(todayStart, taskDate);
    });
  }, [tasks, handledIds]);

  // Visibility conditions
  if (!morningCheckEnabled) return null;
  if (!isMorningWindow) return null;
  if (isDismissedToday()) return null;
  if (overdueTask.length === 0) return null;

  const handleMoveToToday = (id: string) => {
    updateTask(id, { startDate: todayStr });
    setHandledIds((prev) => new Set(prev).add(id));
  };

  const handleDismissTask = (id: string) => {
    updateTask(id, { startDate: undefined });
    setHandledIds((prev) => new Set(prev).add(id));
  };

  const handleMoveAll = () => {
    overdueTask.forEach((t) => {
      updateTask(t.id, { startDate: todayStr });
    });
    setHandledIds((prev) => {
      const next = new Set(prev);
      overdueTask.forEach((t) => next.add(t.id));
      return next;
    });
  };

  const n = overdueTask.length;

  return (
    <div className="flex-shrink-0 mx-4 mt-3 mb-1 rounded-xl border border-amber-200/60 bg-amber-50/80 dark:border-amber-800/40 dark:bg-amber-950/30 overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
      >
        <Sun className="h-4 w-4 text-amber-500 flex-shrink-0" />
        <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
          Good morning!{' '}
          <span className="font-medium">
            {n === 1 ? '1 task' : `${n} tasks`} from yesterday
          </span>{' '}
          — carry forward or clear them out?
        </p>
        <div className="flex items-center gap-1 ml-2">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-amber-600/70 dark:text-amber-400/70" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-amber-600/70 dark:text-amber-400/70" />
          )}
        </div>
      </button>

      {/* Task list */}
      {expanded && (
        <div className="border-t border-amber-200/50 dark:border-amber-800/30 px-4 py-2 space-y-1">
          {overdueTask.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1 group"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-amber-400/80 flex-shrink-0" />
              <span className="flex-1 text-sm text-amber-900/90 dark:text-amber-200/90 truncate">
                {task.title}
              </span>
              {task.startDate && (
                <span className="text-[11px] text-amber-600/60 dark:text-amber-400/50 flex-shrink-0 pr-1">
                  {format(parseISO(task.startDate), 'MMM d')}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleMoveToToday(task.id)}
                className={cn(
                  'h-6 px-2 text-[11px] gap-1 text-amber-700 dark:text-amber-300',
                  'hover:bg-amber-200/60 dark:hover:bg-amber-800/40',
                  'opacity-0 group-hover:opacity-100 transition-opacity'
                )}
              >
                <ArrowRight className="h-3 w-3" />
                Today
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDismissTask(task.id)}
                className={cn(
                  'h-6 w-6 p-0 text-amber-600/60 dark:text-amber-400/50',
                  'hover:bg-amber-200/60 dark:hover:bg-amber-800/40 hover:text-amber-700',
                  'opacity-0 group-hover:opacity-100 transition-opacity'
                )}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-1.5 pb-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMoveAll}
              className="h-6 px-2 text-[11px] gap-1.5 text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-800/40"
            >
              <ChevronsRight className="h-3 w-3" />
              Move all to today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismiss}
              className="h-6 px-2 text-[11px] text-amber-600/70 dark:text-amber-400/60 hover:bg-amber-200/60 dark:hover:bg-amber-800/40"
            >
              Dismiss for today
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
