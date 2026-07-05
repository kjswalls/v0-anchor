'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Search, X, CheckCircle2, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlannerStore } from '@/lib/planner-store';
import { openEditFor } from '@/lib/ui-store';
import type { Task, Habit } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * TEMP (P2→P3): expanding search ported from the retired top-nav so search
 * stays available until the omnibar lands. Deleted in P3 — do not extend.
 */
export function SearchButton({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { tasks, habits, getProjectEmoji, getHabitGroupEmoji } = usePlannerStore();
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onOpenChange]);

  const results = useMemo(() => {
    if (!query.trim()) return { tasks: [] as Task[], habits: [] as Habit[] };
    const q = query.toLowerCase();
    return {
      tasks: tasks.filter(
        (t) => t.title.toLowerCase().includes(q) || t.project?.toLowerCase().includes(q)
      ),
      habits: habits.filter(
        (h) => h.title.toLowerCase().includes(q) || h.group.toLowerCase().includes(q)
      ),
    };
  }, [query, tasks, habits]);

  const hasResults = results.tasks.length > 0 || results.habits.length > 0;

  const pick = (item: Task | Habit, type: 'task' | 'habit') => {
    openEditFor(item, type);
    setQuery('');
    onOpenChange(false);
  };

  const scheduleInfo = (task: Task) => {
    const parts: string[] = [];
    if (task.startDate) parts.push(format(new Date(task.startDate), 'MMM d'));
    if (task.timeBucket && task.timeBucket !== 'anytime') parts.push(task.timeBucket);
    if (task.startTime) parts.push(task.startTime);
    return parts.length ? parts.join(' · ') : 'Unscheduled';
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative flex items-center transition-all duration-200', open ? 'w-72' : 'w-8')}
    >
      {open ? (
        <>
          <div className="relative w-full">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tasks & habits..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 border-border bg-surface-2 pl-8 pr-8 text-sm"
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setQuery('');
                onOpenChange(false);
              }}
              className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          {query.trim() && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-soft-md">
              {!hasResults ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No tasks or habits found
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto py-1">
                  {results.tasks.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                        Tasks ({results.tasks.length})
                      </div>
                      {results.tasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => pick(task, 'task')}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                        >
                          <CheckCircle2
                            className={cn(
                              'mt-0.5 h-4 w-4 flex-shrink-0',
                              task.status === 'completed'
                                ? 'text-success'
                                : 'text-muted-foreground/50'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {task.project && <span className="text-sm">{getProjectEmoji(task.project)}</span>}
                              <span
                                className={cn(
                                  'truncate font-serif text-sm font-medium',
                                  task.status === 'completed' && 'text-muted-foreground line-through'
                                )}
                              >
                                {task.title}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">{scheduleInfo(task)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.habits.length > 0 && (
                    <div>
                      <div className="mt-1 border-t border-border px-3 py-1.5 pt-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                        Habits ({results.habits.length})
                      </div>
                      {results.habits.map((habit) => (
                        <button
                          key={habit.id}
                          onClick={() => pick(habit, 'habit')}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                        >
                          <Flame className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{getHabitGroupEmoji(habit.group)}</span>
                              <span className="truncate font-serif text-sm font-medium">{habit.title}</span>
                              {habit.streak > 0 && (
                                <span className="text-xs font-medium text-warning-text">
                                  {habit.streak} day streak
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(true)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
