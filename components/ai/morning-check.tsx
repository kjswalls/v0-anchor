'use client';

import { useState, useMemo } from 'react';
import { format, isAfter, parseISO, startOfDay } from 'date-fns';
import { Sun, ChevronDown, ChevronUp, ArrowRight, X, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskItem } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { usePlannerStore } from '@/lib/planner-store';
import { useMorningStore } from '@/lib/morning-store';
import { getItemTypeConfig, itemTypeName } from '@/lib/item-registry';

export function MorningCheck() {
  const { items, updateTask } = usePlannerStore();
  const { morningCheckEnabled, dismiss, isDismissedToday } = useMorningStore();
  const [expanded, setExpanded] = useState(true);
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const overdueTask = useMemo(() => {
    const todayStart = startOfDay(new Date());
    // Carry-forward is a registry capability: habits are date-blind and never
    // roll over (carryForwardEligible: false), which is why they don't appear
    // here. Custom types ARE eligible — they're task-shaped and the task
    // actions operate on any task-like item, so the TaskItem narrowing below
    // is structural, not literal.
    return items.filter((t): t is TaskItem => {
      const config = getItemTypeConfig(itemTypeName(t));
      if (!config.carryForwardEligible || !config.dateAnchored) return false;
      if (t.status !== 'pending') return false;
      if (!('startDate' in t) || !t.startDate) return false;
      if (handledIds.has(t.id)) return false;
      // startDate is before today
      const taskDate = parseISO(t.startDate);
      return isAfter(todayStart, taskDate);
    });
  }, [items, handledIds]);

  // Visibility: enabled + not yet dismissed today (first open of the day)
  if (!morningCheckEnabled) return null;
  if (isDismissedToday()) return null;
  if (overdueTask.length === 0) return null;

  const handleMoveToToday = (id: string) => {
    updateTask(id, { startDate: todayStr });
    setHandledIds((prev) => new Set(prev).add(id));
  };

  const handleDismissTask = (id: string) => {
    // Unschedule fully so the task appears in the sidebar backlog
    updateTask(id, { startDate: undefined, isScheduled: false, timeBucket: undefined, startTime: undefined });
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
    /* canvas-container wrapper, not a margin of its own: the notice sits on the
       same left/right edges as the header capsule and every body view, so it
       reads as an annotation on the day's content rather than a bar spanning
       the whole panel. The gutter has to live on a wrapper — canvas-container's
       padding-inline would otherwise fall inside the box's border. */
    <div className="canvas-container flex-shrink-0 mt-3 mb-1">
      {/* Chip language at bar scale: hairline tinted box, tight 6px radius, and
          a mono, letterspaced header line — the same treatment as the small
          status chips, sized up rather than restyled. Sentence case, not the
          chip's uppercase: this is a sentence, not a label. */}
      <div className="rounded-[6px] border border-ai/35 bg-ai/10 overflow-hidden">
        {/* Header row */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-ai/15 transition-colors"
        >
          <Sun className="h-3.5 w-3.5 text-ai flex-shrink-0" />
          <p className="flex-1 font-num text-xs tracking-[0.04em] text-ai-text">
            Good morning!{' '}
            <span className="font-semibold">
              {n === 1 ? '1 task' : `${n} tasks`} from yesterday
            </span>{' '}
            — carry forward or clear them out?
          </p>
          <div className="flex items-center gap-1 ml-2">
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-ai-text/80" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-ai-text/80" />
            )}
          </div>
        </button>

        {/* Task list */}
        {expanded && (
          <div className="border-t border-ai/35 px-3.5 py-2 space-y-1">
            {overdueTask.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 py-1 group"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-ai flex-shrink-0" />
                {/* Titles keep the content face — they're content, not chrome */}
                <span className="flex-1 truncate font-content text-content text-ai-text/90">
                  {task.title}
                </span>
                {task.startDate && (
                  <span className="font-num text-2xs text-ai-text/80 flex-shrink-0 pr-1">
                    {format(parseISO(task.startDate), 'MMM d')}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMoveToToday(task.id)}
                  className={cn(
                    'h-6 px-2 text-[11px] gap-1 text-ai-text',
                    'hover:bg-ai/15',
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
                    'h-6 w-6 p-0 text-ai-text/80',
                    'hover:bg-ai/15 hover:text-ai-text',
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
                className="h-6 px-2 text-[11px] gap-1.5 text-ai-text hover:bg-ai/15"
              >
                <ChevronsRight className="h-3 w-3" />
                Move all to today
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismiss}
                className="h-6 px-2 text-[11px] text-ai-text/80 hover:bg-ai/15"
              >
                Dismiss for today
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
