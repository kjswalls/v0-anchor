'use client';

import { ListFilter, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Priority, Project } from '@/lib/planner-types';
import { CategoryIcon } from '@/lib/category-icons';
import { cn } from '@/lib/utils';

/**
 * Reusable controlled filter popover (extracted from the braindump's filter
 * pattern): priority chips, project checkboxes, hide-completed. No group-by
 * section — grouping is owned by each surface separately. The trigger shows
 * a lime dot when any filter is active.
 */

export interface FilterPopoverValue {
  projects: string[];
  priorities: Priority[];
  hideCompleted: boolean;
}

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export function FilterPopover({
  value,
  onChange,
  projects,
}: {
  value: FilterPopoverValue;
  onChange: (value: FilterPopoverValue) => void;
  projects: Project[];
}) {
  const toggle = <T extends string>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((v) => v !== item) : [...list, item];

  const activeCount =
    value.projects.length + value.priorities.length + (value.hideCompleted ? 1 : 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-8 w-8 text-muted-foreground hover:text-foreground',
            activeCount > 0 && 'text-foreground'
          )}
          aria-label={activeCount > 0 ? `Filter (${activeCount} active)` : 'Filter'}
        >
          <ListFilter className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">Priority</div>
        <div className="flex gap-1 pb-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => onChange({ ...value, priorities: toggle(value.priorities, p) })}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs capitalize transition-colors',
                value.priorities.includes(p)
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
                const active = value.projects.includes(project.name);
                return (
                  <button
                    key={project.name}
                    onClick={() =>
                      onChange({ ...value, projects: toggle(value.projects, project.name) })
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
                    <CategoryIcon glyph={project.emoji} name={project.name} />
                    {project.name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          onClick={() => onChange({ ...value, hideCompleted: !value.hideCompleted })}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
        >
          <span
            className={cn(
              'flex h-3.5 w-3.5 items-center justify-center rounded border',
              value.hideCompleted ? 'border-primary bg-primary' : 'border-muted-foreground/40'
            )}
          >
            {value.hideCompleted && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
          </span>
          Hide completed
        </button>

        {activeCount > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => onChange({ projects: [], priorities: [], hideCompleted: false })}
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
