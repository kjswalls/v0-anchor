'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, Plus, Sun, Moon } from 'lucide-react';
import { UserProfileDropdown } from '@/components/planner/user-profile-dropdown';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePlannerStore } from '@/lib/planner-store';
import { useTheme } from 'next-themes';

interface MobileHeaderProps {
  onAddClick: () => void;
  onOpenSettings: () => void;
}

export function MobileHeader({ onAddClick, onOpenSettings }: MobileHeaderProps) {
  const { selectedDate, setSelectedDate } = usePlannerStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        {/* Anchor logo mark */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground flex-shrink-0"
          aria-label="Anchor"
        >
          <circle cx="12" cy="5" r="2" />
          <line x1="12" y1="7" x2="12" y2="22" />
          <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
        </svg>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              className="h-8 px-2 text-sm font-medium text-foreground hover:bg-secondary"
            >
              <Calendar className="h-4 w-4 mr-1.5 text-muted-foreground" />
              {mounted ? format(selectedDate, 'EEE, MMM d') : <span className="w-16" />}
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
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (!mounted) return;
            setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          }}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {mounted ? (
            resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
          ) : (
            <span className="h-4 w-4" />
          )}
        </Button>

        <UserProfileDropdown onOpenSettings={onOpenSettings} />
        
        <Button
          size="sm"
          onClick={onAddClick}
          className="h-8 w-8 p-0 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
