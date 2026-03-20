'use client';

import { useState, useEffect } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, Plus, Sun, Moon, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePlannerStore } from '@/lib/planner-store';
import type { ViewMode } from '@/lib/planner-types';
import { useTheme } from 'next-themes';

interface TopNavProps {
  onAddClick: () => void;
  onManageCategories: () => void;
}

export function TopNav({ onAddClick, onManageCategories }: TopNavProps) {
  const { selectedDate, setSelectedDate, viewMode, setViewMode } = usePlannerStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by only rendering date after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const goToToday = () => setSelectedDate(new Date());
  const goPrevious = () => setSelectedDate(subDays(selectedDate, viewMode === 'week' ? 7 : 1));
  const goNext = () => setSelectedDate(addDays(selectedDate, viewMode === 'week' ? 7 : 1));

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-medium text-foreground tracking-tight">Calm Planner</h1>
        
        <div className="flex items-center gap-2 ml-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrevious}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                className="h-8 px-3 text-sm font-medium text-foreground hover:bg-secondary"
              >
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                {mounted ? format(selectedDate, 'EEEE, MMMM d') : <span className="w-32" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={goNext}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            disabled={mounted && isToday(selectedDate)}
            className="h-8 px-3 text-sm ml-2"
          >
            Today
          </Button>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && setViewMode(value as ViewMode)}
          className="bg-secondary rounded-lg p-0.5"
        >
          <ToggleGroupItem
            value="day"
            className="h-7 px-3 text-xs data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm rounded-md"
          >
            Day
          </ToggleGroupItem>
          <ToggleGroupItem
            value="week"
            className="h-7 px-3 text-xs data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm rounded-md"
          >
            Week
          </ToggleGroupItem>
        </ToggleGroup>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onManageCategories}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Manage Projects & Groups"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
        
        <Button
          size="sm"
          onClick={onAddClick}
          className="h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
    </header>
  );
}
