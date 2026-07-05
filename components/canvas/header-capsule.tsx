'use client';

import { useState, useEffect } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  CheckCheck,
  ListTodo,
  Repeat,
  Rows3,
  Clock,
  List,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore, type ViewLayout, type ViewScope, type TypeFilter } from '@/lib/view-store';
import { useSunTimes } from '@/hooks/use-sun-times';
import { cn } from '@/lib/utils';

/**
 * Floating header capsule at the top of the canvas (see
 * design/redesign/desktop_day_bucketView.png): date navigation on top,
 * type filter + layout + scope below.
 */
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
    <div className="inline-flex flex-col gap-1 rounded-panel bg-surface-3 p-2 shadow-soft-sm">
      {/* Row 1 — calendar + date nav */}
      <div className="flex items-center gap-1">
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
            'px-1 font-serif text-lg font-semibold text-foreground',
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

      {/* Row 2 — type filter · layout · scope */}
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={typeFilter}
          onValueChange={(v) => v && setTypeFilter(v as TypeFilter)}
          className="rounded-lg bg-surface-2 p-0.5 shadow-soft-sm"
        >
          <ToggleGroupItem value="all" className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-surface-3">
            <CheckCheck className="h-3.5 w-3.5" />
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="tasks" className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-surface-3">
            <ListTodo className="h-3.5 w-3.5" />
            Tasks
          </ToggleGroupItem>
          <ToggleGroupItem value="habits" className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-surface-3">
            <Repeat className="h-3.5 w-3.5" />
            Habits
          </ToggleGroupItem>
        </ToggleGroup>

        <span className="text-border">·</span>

        <ToggleGroup
          type="single"
          value={layout}
          onValueChange={(v) => v && setLayout(v as ViewLayout)}
          className="rounded-lg bg-surface-2 p-0.5 shadow-soft-sm"
        >
          <ToggleGroupItem value="buckets" className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-surface-3">
            <Rows3 className="h-3.5 w-3.5" />
            Buckets
          </ToggleGroupItem>
          <ToggleGroupItem
            value="schedule"
            className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-surface-3"
          >
            <Clock className="h-3.5 w-3.5" />
            Schedule
          </ToggleGroupItem>
          <ToggleGroupItem
            value="list"
            className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-surface-3"
          >
            <List className="h-3.5 w-3.5" />
            List
          </ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={(v) => v && setScope(v as ViewScope)}
          className="rounded-lg bg-surface-2 p-0.5 shadow-soft-sm"
        >
          <ToggleGroupItem value="day" className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-surface-3">
            <Sun className="h-3.5 w-3.5" />
            Day
          </ToggleGroupItem>
          <ToggleGroupItem value="week" className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-surface-3">
            <CalendarDays className="h-3.5 w-3.5" />
            Week
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
