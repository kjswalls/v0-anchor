'use client';

import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AlignLeft, FolderOpen, Plus, Filter, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TaskRow, type RowItem } from '@/components/primitives/task-row';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore, openAddDialog } from '@/lib/ui-store';
import { useViewStore, type BraindumpGroupBy } from '@/lib/view-store';
import type { Priority } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * The Braindump: every item that has no assigned day — unscheduled tasks
 * (no bucket) and habits with no bucket and no recurrence. Remains the DnD
 * source/target for scheduling ('sidebar' droppable = unschedule, see
 * lib/dnd/CONTRACT.md).
 */

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

function SlashLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-widest text-muted-foreground/70 first:pt-1">
      <span className="mr-1 text-muted-foreground/40">/</span>
      {children}
    </div>
  );
}

function FilterPopover() {
  const { braindumpGroupBy, setBraindumpGroupBy, braindumpFilters, setBraindumpFilters } =
    useViewStore();
  const projects = usePlannerStore((s) => s.projects);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const activeCount =
    braindumpFilters.projects.length +
    braindumpFilters.priorities.length +
    (braindumpFilters.hideCompleted ? 1 : 0);

  const groupOptions: { value: BraindumpGroupBy; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'type', label: 'Type' },
    { value: 'project', label: 'Project' },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-6 w-6 text-muted-foreground hover:text-foreground', activeCount > 0 && 'text-primary-foreground')}
          aria-label="Filter and group"
        >
          <Filter className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Group by</div>
        <div className="flex gap-1 pb-2">
          {groupOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBraindumpGroupBy(opt.value)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
                braindumpGroupBy === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Priority</div>
        <div className="flex gap-1 pb-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() =>
                setBraindumpFilters({
                  ...braindumpFilters,
                  priorities: toggle(braindumpFilters.priorities, p),
                })
              }
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs capitalize transition-colors',
                braindumpFilters.priorities.includes(p)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <>
            <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Project</div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto pb-2">
              {projects.map((project) => {
                const active = braindumpFilters.projects.includes(project.name);
                return (
                  <button
                    key={project.name}
                    onClick={() =>
                      setBraindumpFilters({
                        ...braindumpFilters,
                        projects: toggle(braindumpFilters.projects, project.name),
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                  >
                    <span
                      className={cn(
                        'flex h-3.5 w-3.5 items-center justify-center rounded border',
                        active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      )}
                    >
                      {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    {project.emoji} {project.name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          onClick={() =>
            setBraindumpFilters({ ...braindumpFilters, hideCompleted: !braindumpFilters.hideCompleted })
          }
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
        >
          <span
            className={cn(
              'flex h-3.5 w-3.5 items-center justify-center rounded border',
              braindumpFilters.hideCompleted ? 'border-primary bg-primary' : 'border-muted-foreground/40'
            )}
          >
            {braindumpFilters.hideCompleted && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
          </span>
          Hide completed
        </button>

        {activeCount > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={() =>
                setBraindumpFilters({ projects: [], priorities: [], hideCompleted: false })
              }
            >
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function Braindump() {
  const { tasks, habits } = usePlannerStore();
  const { openDialog } = useUIStore();
  const { braindumpGroupBy, braindumpFilters } = useViewStore();

  const { isOver, setNodeRef } = useDroppable({ id: 'sidebar' });

  const rows: RowItem[] = useMemo(() => {
    const unscheduledTasks = tasks.filter((task) => {
      if (task.isScheduled || task.timeBucket) return false;
      if (braindumpFilters.hideCompleted && task.status === 'completed') return false;
      if (braindumpFilters.priorities.length && (!task.priority || !braindumpFilters.priorities.includes(task.priority)))
        return false;
      if (braindumpFilters.projects.length && (!task.project || !braindumpFilters.projects.includes(task.project)))
        return false;
      return true;
    });

    // Habits belong in the braindump when nothing places them on a day:
    // no bucket and no recurrence.
    const unscheduledHabits =
      braindumpFilters.priorities.length || braindumpFilters.projects.length
        ? []
        : habits.filter((habit) => {
            if (habit.timeBucket) return false;
            if (habit.repeatFrequency && habit.repeatFrequency !== 'none') return false;
            if (braindumpFilters.hideCompleted && habit.status === 'done') return false;
            return true;
          });

    return [
      ...unscheduledTasks.map((task) => ({ itemType: 'task' as const, item: task })),
      ...unscheduledHabits.map((habit) => ({ itemType: 'habit' as const, item: habit })),
    ];
  }, [tasks, habits, braindumpFilters]);

  const grouped: [string, RowItem[]][] = useMemo(() => {
    if (braindumpGroupBy === 'none') return [['', rows]];
    const groups = new Map<string, RowItem[]>();
    for (const row of rows) {
      const key =
        braindumpGroupBy === 'type'
          ? row.itemType === 'task'
            ? 'Tasks'
            : 'Habits'
          : (row.itemType === 'task' && row.item.project) || 'No project';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return [...groups.entries()];
  }, [rows, braindumpGroupBy]);

  return (
    <section
      ref={setNodeRef}
      data-dnd-id="sidebar"
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      {/* Header — gray capsule (flat) framing a shadowed white row-pill.
          Exact dims from Figma: gray 406×50 r10; pill 385×37 r10, inset
          (10,6), shadow 0 4 4 rgba(0,0,0,.15); title Inter Medium 16 #222. */}
      <div className="rounded-[10px] bg-surface-3 px-[10px] py-[6px]">
        <div className="flex h-[37px] items-center gap-2 rounded-[10px] bg-surface-2 px-[15px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.15)]">
          <AlignLeft className="h-4 w-4 text-muted-foreground" />
          <h2 className="flex-1 font-sans text-[16px] font-medium leading-none text-foreground">
            Braindump
          </h2>
          <FilterPopover />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => openDialog({ type: 'manage-categories' })}
            aria-label="Manage projects & groups"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => openAddDialog('task')}
            aria-label="Add task"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* List — sits directly on the paper backdrop, no card */}
      <ScrollArea
        className={cn(
          'min-h-0 flex-1 rounded-card transition-colors',
          isOver && 'ring-2 ring-ring/60'
        )}
      >
        <div className="px-[14px] py-3">
          {grouped.map(([label, groupRows]) => (
            <div key={label || 'all'}>
              {label && <SlashLabel>{label}</SlashLabel>}
              <div className="space-y-0.5">
                {groupRows.map((row) => (
                  <TaskRow key={row.item.id} row={row} context="braindump" />
                ))}
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="font-serif text-base italic text-muted-foreground">
                A clear head. Drop stray thoughts here.
              </p>
              <button
                onClick={() => openAddDialog('task')}
                className="text-xs text-success-text hover:underline underline-offset-2"
              >
                + Add something
              </button>
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
