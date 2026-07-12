'use client';

import { useState, useEffect } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  CheckCheck,
  ListTodo,
  Repeat,
  Rows3,
  Clock,
  List,
  CalendarDays,
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
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore, type ViewLayout, type ViewScope, type TypeFilter } from '@/lib/view-store';
import { useSunTimes } from '@/hooks/use-sun-times';
import { cn } from '@/lib/utils';

/**
 * Floating header capsule at the top of the canvas (Figma view controls
 * #56:51): gray capsule r10; date nav on top (Inter SemiBold 16), then a
 * white pill (401×44 r10, shadow 0 4 4 rgba(0,0,0,.15)) holding three
 * dropdown selectors — type · layout · scope.
 */

type Opt<T extends string> = {
  value: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Opt<T>[];
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
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-3"
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
              className="gap-2 text-[13px]"
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

const TYPE_OPTS: Opt<TypeFilter>[] = [
  { value: 'all', label: 'All', icon: CheckCheck },
  { value: 'tasks', label: 'Tasks', icon: ListTodo },
  { value: 'habits', label: 'Habits', icon: Repeat },
];
const LAYOUT_OPTS: Opt<ViewLayout>[] = [
  { value: 'buckets', label: 'Buckets', icon: Rows3 },
  { value: 'schedule', label: 'Schedule', icon: Clock },
  { value: 'list', label: 'List', icon: List },
];
const SCOPE_OPTS: Opt<ViewScope>[] = [
  { value: 'day', label: 'Day', icon: Sun },
  { value: 'week', label: 'Week', icon: CalendarDays },
];

export function HeaderCapsule() {
  const { selectedDate, setSelectedDate, setNavDirection } = usePlannerStore();
  const { scope, layout, typeFilter, setScope, setLayout, setTypeFilter } = useViewStore();
  const { isAfterSunset } = useSunTimes();
  const [mounted, setMounted] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const goPrevious = () => {
    setNavDirection('right');
    setSelectedDate(subDays(selectedDate, scope === 'week' ? 7 : 1));
    setTimeout(() => setNavDirection(null), 600);
  };
  const goNext = () => {
    setNavDirection('left');
    setSelectedDate(addDays(selectedDate, scope === 'week' ? 7 : 1));
    setTimeout(() => setNavDirection(null), 600);
  };

  const showToday = mounted && !isToday(selectedDate);

  return (
    <div className="inline-flex flex-col gap-1 rounded-[10px] bg-surface-3 p-2">
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
              {mounted &&
                (isAfterSunset ? (
                  <Moon className="absolute -top-0.5 -right-0.5 h-3 w-3 text-evening" />
                ) : (
                  <Sun className="absolute -top-0.5 -right-0.5 h-3 w-3 text-morning" />
                ))}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) setSelectedDate(date);
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
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <button
          onClick={() => setSelectedDate(new Date())}
          disabled={!showToday}
          title={showToday ? 'Jump to today' : undefined}
          className={cn(
            'px-1 font-sans text-[16px] font-semibold text-foreground',
            showToday && 'cursor-pointer hover:text-primary-foreground/80'
          )}
        >
          {mounted ? format(selectedDate, 'EEEE, MMMM d') : <span className="inline-block w-44" />}
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={goNext}
          className="h-8 w-6 text-muted-foreground hover:text-foreground"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Row 2 — white pill: type · layout · scope selectors */}
      <div className="flex items-center rounded-[10px] bg-surface-2 px-1.5 py-1.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.15)]">
        <SelectMenu
          value={typeFilter}
          options={TYPE_OPTS}
          onChange={(v) => setTypeFilter(v)}
          ariaLabel="Filter by type"
        />
        <div className="ml-auto flex items-center">
          <SelectMenu
            value={layout}
            options={LAYOUT_OPTS}
            onChange={(v) => setLayout(v)}
            ariaLabel="Layout"
          />
          <SelectMenu
            value={scope}
            options={SCOPE_OPTS}
            onChange={(v) => setScope(v)}
            ariaLabel="Scope"
          />
        </div>
      </div>
    </div>
  );
}
