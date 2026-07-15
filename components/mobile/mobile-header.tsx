'use client';

import { useState, useEffect } from 'react';
import { format, isToday } from 'date-fns';
import { Calendar, Rows3, List, Clock, Check, ChevronDown } from 'lucide-react';
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

interface MobileHeaderProps {
  onOpenSettings: () => void;
}

/** Mobile layouts that ship on small screens (subset of the desktop capsule). */
const LAYOUTS: { value: ViewLayout; label: string; icon: typeof Rows3 }[] = [
  { value: 'buckets', label: 'Buckets', icon: Rows3 },
  { value: 'list', label: 'List', icon: List },
  { value: 'schedule', label: 'Schedule', icon: Clock },
];

/**
 * Mobile header: user menu + date on the left, layout picker on the right.
 * No logo (the user menu takes that slot) and no add button (the always-present
 * omnibar strip handles capture). pt-safe lives on the outer element so the
 * content row keeps symmetric vertical padding (stays centered) under the notch.
 */
export function MobileHeader({ onOpenSettings }: MobileHeaderProps) {
  const { selectedDate, setSelectedDate } = usePlannerStore();
  const { layout, setLayout } = useViewStore();
  const [mounted, setMounted] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const currentLayout = LAYOUTS.find((l) => l.value === layout) ?? LAYOUTS[0];
  const LayoutIcon = currentLayout.icon;

  return (
    <header className="pt-safe">
      {/* A shadowed white pill floating on the paper backdrop (desktop's
          white-pill recipe: surface-2 + surface-3 hairline + hard shadow that
          still reads in light mode). pt-safe on the header, mt-2 on the pill —
          separate elements, so the safe inset and the top gap don't collide. */}
      <div className="mx-3 mt-2 flex items-center justify-between rounded-[16px] border border-surface-3 bg-surface-2 px-2 py-1.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.15)]">
        <div className="flex items-center gap-1">
          <UserProfileDropdown onOpenSettings={onOpenSettings} />
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 gap-1.5 px-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                <Calendar className="h-4 w-4 text-muted-foreground" />
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-1.5 px-2.5 text-sm font-medium text-foreground hover:bg-secondary"
              aria-label="Layout"
            >
              <LayoutIcon className="h-4 w-4 text-muted-foreground" />
              {currentLayout.label}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[150px]">
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
      </div>
    </header>
  );
}
