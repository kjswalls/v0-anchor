'use client';

import { useState, useEffect } from 'react';
import { format, isToday } from 'date-fns';
import { Calendar, Plus, Rows3, List, Clock, Check, ChevronDown } from 'lucide-react';
import { UserProfileDropdown } from '@/components/planner/user-profile-dropdown';
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
import { useViewStore, type ViewLayout } from '@/lib/view-store';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  onAddClick: () => void;
  onOpenSettings: () => void;
}

/** Mobile layouts that ship on small screens (subset of the desktop capsule). */
const LAYOUTS: { value: ViewLayout; label: string; icon: typeof Rows3 }[] = [
  { value: 'buckets', label: 'Buckets', icon: Rows3 },
  { value: 'list', label: 'List', icon: List },
  { value: 'schedule', label: 'Schedule', icon: Clock },
];

export function MobileHeader({ onAddClick, onOpenSettings }: MobileHeaderProps) {
  const { selectedDate, setSelectedDate } = usePlannerStore();
  const { layout, setLayout } = useViewStore();
  const [mounted, setMounted] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const currentLayout = LAYOUTS.find((l) => l.value === layout) ?? LAYOUTS[0];
  const LayoutIcon = currentLayout.icon;

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 pt-safe">
      <div className="flex items-center gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0 text-foreground"
          aria-label="Anchor"
        >
          <circle cx="12" cy="5" r="2" />
          <line x1="12" y1="7" x2="12" y2="22" />
          <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
        </svg>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="h-8 px-2 text-sm font-medium text-foreground hover:bg-secondary">
              <Calendar className="mr-1.5 h-4 w-4 text-muted-foreground" />
              {mounted ? (isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEE, MMM d')) : <span className="w-16" />}
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
      </div>

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 gap-1.5 px-2 text-sm font-medium text-foreground hover:bg-secondary" aria-label="Layout">
              <LayoutIcon className="h-4 w-4" />
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            {LAYOUTS.map((l) => {
              const Icon = l.icon;
              return (
                <DropdownMenuItem key={l.value} onClick={() => setLayout(l.value)} className="gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{l.label}</span>
                  {l.value === layout && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <UserProfileDropdown onOpenSettings={onOpenSettings} />

        <Button
          size="sm"
          onClick={onAddClick}
          className="h-8 w-8 bg-primary p-0 text-primary-foreground hover:bg-primary/90"
          aria-label="Add"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
