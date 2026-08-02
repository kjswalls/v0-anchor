'use client';

import { useState, useEffect } from 'react';
import { format, isToday } from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FilterPopover } from '@/components/primitives/filter-popover';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import {
  LAYOUT_OPTIONS,
  SCOPE_OPTIONS,
  TYPE_OPTIONS,
  type ViewOption,
} from '@/lib/view-options';
import { goToDate, stepScope } from '@/lib/nav-commands';

/**
 * Floating header capsule at the top of the canvas (Figma view controls
 * #56:51): gray capsule r10; date nav on top (Inter SemiBold 16), then a
 * white pill (401×44 r10, shadow 0 4 4 rgba(0,0,0,.15)) holding three
 * dropdown selectors — type · layout · scope.
 */

function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ViewOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={ariaLabel}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Icon className="h-4 w-4" />
          {current.label}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[144px]">
        {options.map((o) => {
          const OptIcon = o.icon;
          return (
            <DropdownMenuItem
              key={o.value}
              onClick={() => onChange(o.value)}
              className="gap-2 text-sm"
            >
              <OptIcon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{o.label}</span>
              {o.value === value && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HeaderCapsule() {
  const { selectedDate, projects } = usePlannerStore();
  const { scope, layout, typeFilter, canvasFilters, setScope, setLayout, setTypeFilter, setCanvasFilters } =
    useViewStore();
  const [mounted, setMounted] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const goPrevious = () => stepScope(-1);
  const goNext = () => stepScope(1);

  return (
    <div className="inline-flex flex-col gap-1 rounded-[10px] bg-surface-3 p-2 shadow-[var(--shadow-elev-bar)]">
      {/* Row 1 — calendar + date nav */}
      <div className="flex items-center gap-1 px-1">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Open calendar"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) goToDate(date);
                setCalendarOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          onClick={goPrevious}
          className="h-8 w-6 text-muted-foreground hover:text-foreground"
          aria-label="Previous"
          data-testid="header-prev"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <button
          onClick={() => setCalendarOpen(true)}
          title="Open calendar"
          data-testid="header-date"
          // The machine-readable selected date. The visible text is a format
          // string ('EEEE, MMMM d') with no delimiter after the day number, so
          // asserting on it needs an anchored regex — an unanchored one matches
          // 'Fri, Aug 15' for a target of 'Friday, August 1', i.e. a 14-day
          // overshoot reads as success. Also empty before hydration; this
          // attribute is not.
          data-date={mounted ? format(selectedDate, 'yyyy-MM-dd') : ''}
          className="cursor-pointer rounded-md px-1.5 font-sans text-base font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {mounted ? format(selectedDate, 'EEEE, MMMM d') : <span className="inline-block w-44" />}
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={goNext}
          className="h-8 w-6 text-muted-foreground hover:text-foreground"
          aria-label="Next"
          data-testid="header-next"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {mounted && !isToday(selectedDate) && (
          <button
            onClick={() => goToDate(new Date())}
            className="ml-1 inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Go to today"
            data-testid="header-today"
          >
            <span aria-hidden="true" className="inline-block -scale-x-100 font-mono text-[11px] leading-none">
              ↵
            </span>
            Today
          </button>
        )}
      </div>

      {/* Row 2 — white pill: type · layout · scope selectors */}
      <div className="flex items-center rounded-[10px] bg-surface-2 px-1.5 py-1.5 shadow-[var(--shadow-elev-sm)]">
        <SelectMenu
          value={typeFilter}
          options={TYPE_OPTIONS}
          onChange={(v) => setTypeFilter(v)}
          ariaLabel="Filter by type"
        />
        <div className="ml-auto flex items-center">
          <SelectMenu
            value={layout}
            options={LAYOUT_OPTIONS}
            onChange={(v) => setLayout(v)}
            ariaLabel="Layout"
          />
          <SelectMenu
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={(v) => setScope(v)}
            ariaLabel="Scope"
          />
          <div className="mx-1 h-4 w-px bg-border" />
          <FilterPopover value={canvasFilters} onChange={setCanvasFilters} projects={projects} />
        </div>
      </div>
    </div>
  );
}
