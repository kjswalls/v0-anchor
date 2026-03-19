'use client';

import { Flame, Check, Minus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePlannerStore } from '@/lib/planner-store';
import type { HabitStatus, HabitGroup } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

const groupColors: Record<HabitGroup, { bg: string; text: string; border: string }> = {
  wellness: {
    bg: 'bg-habit-wellness/10',
    text: 'text-habit-wellness',
    border: 'border-habit-wellness/30',
  },
  work: {
    bg: 'bg-habit-work/10',
    text: 'text-habit-work',
    border: 'border-habit-work/30',
  },
  personal: {
    bg: 'bg-habit-personal/10',
    text: 'text-habit-personal',
    border: 'border-habit-personal/30',
  },
};

const groupLabels: Record<HabitGroup, string> = {
  wellness: 'Wellness',
  work: 'Work',
  personal: 'Personal',
};

export function HabitsSection() {
  const { habits, toggleHabitStatus } = usePlannerStore();

  if (habits.length === 0) {
    return null;
  }

  const getNextStatus = (currentStatus: HabitStatus): HabitStatus => {
    switch (currentStatus) {
      case 'pending':
        return 'done';
      case 'done':
        return 'skipped';
      case 'skipped':
        return 'pending';
    }
  };

  const completedCount = habits.filter((h) => h.status === 'done').length;

  return (
    <section className="border-b border-border bg-card/50">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-foreground">Daily Habits</h2>
            <Badge variant="secondary" className="text-xs h-5 px-2">
              {completedCount}/{habits.length}
            </Badge>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          {habits.map((habit) => {
            const colors = groupColors[habit.group];
            
            return (
              <div
                key={habit.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all',
                  colors.bg,
                  colors.border,
                  habit.status === 'done' && 'ring-1 ring-primary/20'
                )}
              >
                <button
                  onClick={() => toggleHabitStatus(habit.id, getNextStatus(habit.status))}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                    habit.status === 'done' && 'bg-primary border-primary',
                    habit.status === 'skipped' && 'bg-muted border-muted-foreground/30',
                    habit.status === 'pending' && 'border-muted-foreground/40 hover:border-primary'
                  )}
                >
                  {habit.status === 'done' && (
                    <Check className="h-3.5 w-3.5 text-primary-foreground" />
                  )}
                  {habit.status === 'skipped' && (
                    <Minus className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
                
                <div className="flex flex-col">
                  <span
                    className={cn(
                      'text-sm font-medium text-foreground',
                      habit.status === 'done' && 'line-through text-muted-foreground',
                      habit.status === 'skipped' && 'line-through text-muted-foreground'
                    )}
                  >
                    {habit.title}
                  </span>
                  <span className={cn('text-xs', colors.text)}>
                    {groupLabels[habit.group]}
                  </span>
                </div>
                
                {habit.streak > 0 && (
                  <div className="flex items-center gap-1 ml-2">
                    <Flame className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-medium text-orange-500">
                      {habit.streak}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
