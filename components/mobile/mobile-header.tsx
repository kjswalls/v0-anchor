'use client';

import { useState, useEffect } from 'react';
import { format, isToday } from 'date-fns';
import { Calendar, Rows3, List, Clock, Check, ChevronDown, MessageSquarePlus } from 'lucide-react';
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
import { DisplayMenu } from '@/components/primitives/display-menu';
import { usePlannerStore } from '@/lib/planner-store';
import { useMobileNavStore } from '@/lib/mobile-nav-store';
import { useViewStore, type ViewLayout } from '@/lib/view-store';

interface MobileHeaderProps {
  onOpenSettings: () => void;
  /**
   * Opens the bug-report/feature-request dialog. Temporary dogfooding
   * affordance for #196, in the header slot the manual morning/EOD trigger
   * buttons used to occupy.
   */
  onOpenBugReport: () => void;
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
export function MobileHeader({ onOpenSettings, onOpenBugReport }: MobileHeaderProps) {
  const { selectedDate, setSelectedDate } = usePlannerStore();
  const { layout, setLayout } = useViewStore();
  const activeTab = useMobileNavStore((s) => s.activeTab);
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
      <div className="mx-3 mt-2 flex items-center justify-between rounded-[16px] border border-surface-3 bg-surface-2 px-2 py-1.5 shadow-[var(--shadow-elev-sm)]">
        <div className="flex items-center gap-1">
          <UserProfileDropdown onOpenSettings={onOpenSettings} />
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                data-testid="header-date"
                // Same machine-readable date as the desktop capsule, so one
                // navigation helper works across both shells. Mobile also
                // renders the literal 'Today' instead of a date, which no
                // format-string assertion can match.
                data-date={mounted ? format(selectedDate, 'yyyy-MM-dd') : ''}
                className="h-9 gap-1.5 px-2 text-sm font-medium text-foreground hover:bg-accent"
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

        <div className="flex items-center gap-1">
          {/* Temporary dogfooding affordance (#196), reusing the shared
              bug-report/feature-request dialog rather than building a
              mobile-only one. Icon sized to match the other icon glyphs in
              this header (h-4 w-4). */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenBugReport}
            aria-label="Report a bug or request a feature"
            title="Report a bug or request a feature"
            className="h-9 w-9 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>

          {/* Three of the seven surfaces exist on a phone, and until now none of
              them had any filter affordance at all — the command palette was the
              only path, on a device with no keyboard to open it with. The icon
              trigger costs 24px.

              Today ONLY. MobileShell renders this header above every activeTab
              guard (mobile-shell.tsx:55), so an ungated mount rides all three
              tabs: on Braindump it would be a second, pixel-identical trigger
              beside the braindump's own, writing canvasFilters while the list
              below reads braindumpFilters; on Chat it would configure a canvas
              nobody is looking at.

              `scope="day"` because this shell IS day-only — MobileViewRouter
              reads `layout` and hardcodes data-view-scope="day". Without it a
              stale `scope: 'week'` in the persisted blob reports Grouping as
              unavailable on a surface that honours it, and nothing here can
              correct it: the only writers of scope are the desktop capsule and
              two palette commands hidden on mobile. */}
          {activeTab === 'today' && <DisplayMenu surface="canvas" trigger="icon" scope="day" />}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 gap-1.5 px-2.5 text-sm font-medium text-foreground hover:bg-accent"
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
                    {/* Inherited colour — `text-primary-foreground` is --lime-ink,
                        meant to sit ON a lime fill, not on the popover ground. */}
                    {l.value === layout && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
