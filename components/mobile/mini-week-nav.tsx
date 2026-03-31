'use client';

import { useRef, useEffect } from 'react';
import { format, addDays, subDays, startOfWeek, isToday, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlannerStore } from '@/lib/planner-store';
import { cn } from '@/lib/utils';

export function MiniWeekNav() {
  const { selectedDate, setSelectedDate, setNavDirection, weekStartDay } = usePlannerStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get days for 3 weeks: previous, current, next
  const weekStartsOn = weekStartDay === 'monday' ? 1 : weekStartDay === 'saturday' ? 6 : 0;
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: weekStartsOn as 0 | 1 | 6 });
  const days = Array.from({ length: 21 }, (_, i) => addDays(subDays(weekStart, 7), i));

  const goPrevious = () => {
    setNavDirection('right');
    setSelectedDate(subDays(selectedDate, 1));
    setTimeout(() => setNavDirection(null), 600);
  };

  const goNext = () => {
    setNavDirection('left');
    setSelectedDate(addDays(selectedDate, 1));
    setTimeout(() => setNavDirection(null), 600);
  };

  // Scroll to selected date when it changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      const selectedIndex = days.findIndex(d => isSameDay(d, selectedDate));
      if (selectedIndex !== -1) {
        const dayElement = scrollContainerRef.current.children[selectedIndex] as HTMLElement;
        if (dayElement) {
          dayElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }
    }
  }, [selectedDate, days]);

  return (
    <div className="flex items-center gap-1 px-2 py-2 border-b border-border bg-card">
      <Button
        variant="ghost"
        size="icon"
        onClick={goPrevious}
        className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <div 
        ref={scrollContainerRef}
        className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
      >
        {days.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isDayToday = isToday(day);
          
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={cn(
                'flex flex-col items-center justify-center min-w-[44px] h-[52px] rounded-lg transition-colors snap-center',
                isSelected 
                  ? 'bg-primary text-primary-foreground' 
                  : isDayToday
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50'
              )}
            >
              <span className={cn(
                'text-[10px] font-medium uppercase',
                isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
              )}>
                {format(day, 'EEE')}
              </span>
              <span className={cn(
                'text-base font-semibold',
                isSelected && 'text-primary-foreground'
              )}>
                {format(day, 'd')}
              </span>
            </button>
          );
        })}
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={goNext}
        className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
