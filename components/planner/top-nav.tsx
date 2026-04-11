'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, Plus, Sun, Moon, Search, X, CheckCircle2, Flame } from 'lucide-react';
import { UserProfileDropdown } from '@/components/planner/user-profile-dropdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlannerStore } from '@/lib/planner-store';
import type { ViewMode, Task, Habit } from '@/lib/planner-types';
import { useTheme } from 'next-themes';
import { saveSettings } from '@/lib/settings-service';
import { cn } from '@/lib/utils';

interface TopNavProps {
  onAddClick: () => void;
  onManageCategories: () => void;
  onOpenSettings: () => void;
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
}

export function TopNav({ onAddClick, onManageCategories, onOpenSettings, onTaskClick, onHabitClick, searchOpen, onSearchOpenChange }: TopNavProps) {
  const { selectedDate, setSelectedDate, viewMode, setViewMode, tasks, habits, getProjectEmoji, getHabitGroupEmoji, canUndo, canRedo, undo, redo, setNavDirection, userId } = usePlannerStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [internalShowSearch, setInternalShowSearch] = useState(false);
  const showSearch = searchOpen !== undefined ? searchOpen : internalShowSearch;
  const setShowSearch = (v: boolean) => {
    setInternalShowSearch(v);
    onSearchOpenChange?.(v);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [sunsetTime, setSunsetTime] = useState<string | null>(null);
  const [sunriseTime, setSunriseTime] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // Check for Cmd/Ctrl + Z (undo) or Cmd/Ctrl + Shift + Z (redo)
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      // Also support Cmd/Ctrl + Y for redo (Windows convention)
      if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Fetch sunset time on mount
  useEffect(() => {
    const fetchSunsetTime = async () => {
      try {
        // Get user's geolocation (default to New York if not available)
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const { latitude, longitude } = position.coords;
              const response = await fetch(
                `https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&formatted=0`
              );
              const data = await response.json();
              if (data.results?.sunset) {
                const sunsetDate = new Date(data.results.sunset);
                const hours = sunsetDate.getHours().toString().padStart(2, '0');
                const minutes = sunsetDate.getMinutes().toString().padStart(2, '0');
                setSunsetTime(`${hours}:${minutes}`);
              }
              if (data.results?.sunrise) {
                const sunriseDate = new Date(data.results.sunrise);
                const hours = sunriseDate.getHours().toString().padStart(2, '0');
                const minutes = sunriseDate.getMinutes().toString().padStart(2, '0');
                setSunriseTime(`${hours}:${minutes}`);
              }
            },
            () => {
              // Fallback: use default sunset time of 18:00 if geolocation fails
              setSunsetTime('18:00');
              setSunriseTime('06:00');
            }
          );
        } else {
          setSunsetTime('18:00');
          setSunriseTime('06:00');
        }
      } catch (error) {
        // Fallback to default if API fails
        setSunsetTime('18:00');
        setSunriseTime('06:00');
      }
    };
    
    fetchSunsetTime();
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const goToToday = () => setSelectedDate(new Date());
  const goPrevious = () => {
    setNavDirection('right');
    setSelectedDate(subDays(selectedDate, viewMode === 'week' ? 7 : 1));
    setTimeout(() => setNavDirection(null), 600);
  };
  const goNext = () => {
    setNavDirection('left');
    setSelectedDate(addDays(selectedDate, viewMode === 'week' ? 7 : 1));
    setTimeout(() => setNavDirection(null), 600);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setShowSearch(false);
    setShowResults(false);
  };

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { tasks: [], habits: [] };
    
    const query = searchQuery.toLowerCase();
    
    const matchingTasks = tasks.filter(task => 
      task.title.toLowerCase().includes(query) ||
      task.project?.toLowerCase().includes(query)
    );
    
    const matchingHabits = habits.filter(habit =>
      habit.title.toLowerCase().includes(query) ||
      habit.group.toLowerCase().includes(query)
    );
    
    return { tasks: matchingTasks, habits: matchingHabits };
  }, [searchQuery, tasks, habits]);

  const hasResults = searchResults.tasks.length > 0 || searchResults.habits.length > 0;

  const formatScheduleInfo = (task: Task) => {
    const parts: string[] = [];
    if (task.startDate) {
      parts.push(format(new Date(task.startDate), 'MMM d'));
    }
    if (task.timeBucket && task.timeBucket !== 'anytime') {
      parts.push(task.timeBucket);
    }
    if (task.startTime) {
      parts.push(task.startTime);
    }
    if (task.repeatFrequency && task.repeatFrequency !== 'none') {
      parts.push(`repeats ${task.repeatFrequency}`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Unscheduled';
  };

  const formatHabitScheduleInfo = (habit: Habit) => {
    const parts: string[] = [];
    if (habit.timeBucket) {
      parts.push(habit.timeBucket);
    }
    if (habit.startTime) {
      parts.push(habit.startTime);
    }
    if (habit.repeatFrequency && habit.repeatFrequency !== 'none') {
      parts.push(habit.repeatFrequency);
    }
    return parts.length > 0 ? parts.join(' · ') : 'No schedule';
  };

  const handleTaskResultClick = (task: Task) => {
    onTaskClick(task);
    setShowResults(false);
    setSearchQuery('');
    setShowSearch(false);
  };

  const handleHabitResultClick = (habit: Habit) => {
    onHabitClick(habit);
    setShowResults(false);
    setSearchQuery('');
    setShowSearch(false);
  };

  return (
    <header className="flex items-center justify-between px-5 h-16 border-b border-border/50 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {/* Anchor logo mark - bold and prominent */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary flex-shrink-0"
              aria-label="Anchor"
            >
              <circle cx="12" cy="5" r="2" />
              <line x1="12" y1="7" x2="12" y2="22" />
              <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground hidden lg:block">Anchor</span>
        </div>
        
        {/* Date navigation - compact pill design */}
        <div className="flex items-center gap-1 ml-4 bg-secondary/60 rounded-xl p-1">
          <button
            onClick={goPrevious}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="h-8 px-3 flex items-center gap-2 text-sm font-semibold text-foreground hover:bg-background/60 rounded-lg transition-all"
              >
                <Calendar className="h-3.5 w-3.5 text-primary" />
                {mounted ? format(selectedDate, 'EEE, MMM d') : <span className="w-24" />}
              </button>
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
          
          <button
            onClick={goNext}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        
        {/* Today button - accent style */}
        <button
          onClick={goToToday}
          disabled={mounted && isToday(selectedDate)}
          className={cn(
            'h-8 px-3.5 text-xs font-semibold rounded-lg transition-all relative',
            mounted && isToday(selectedDate)
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          {mounted && isToday(selectedDate) && (() => {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const toMinutes = (hhmm: string) => {
              const [h, m] = hhmm.split(':').map(Number);
              return h * 60 + m;
            };
            const sunsetMins = sunsetTime ? toMinutes(sunsetTime) : 20 * 60;
            const isAfterSunset = currentMinutes >= sunsetMins;
            return isAfterSunset ? (
              <Moon className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 text-evening" />
            ) : (
              <Sun className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 text-morning" />
            );
          })()}
          Today
        </button>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Search */}
        <div 
          ref={searchRef}
          className={cn(
            'relative flex items-center transition-all duration-200',
            showSearch ? 'w-72' : 'w-8'
          )}
        >
          {showSearch ? (
            <>
              <div className="relative w-full">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks & habits..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowResults(true);
                  }}
                  onFocus={() => setShowResults(true)}
                  className="h-8 pl-8 pr-8 text-sm bg-background border-border"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearSearch}
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              
              {/* Search Results Dropdown */}
              {showResults && searchQuery.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                  {!hasResults ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No tasks or habits found
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      <div className="py-1">
                        {/* Tasks Section */}
                        {searchResults.tasks.length > 0 && (
                          <div>
                            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                              Tasks ({searchResults.tasks.length})
                            </div>
                            {searchResults.tasks.map((task) => (
                              <button
                                key={task.id}
                                onClick={() => handleTaskResultClick(task)}
                                className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-start gap-2"
                              >
                                <CheckCircle2 className={cn(
                                  'h-4 w-4 mt-0.5 flex-shrink-0',
                                  task.status === 'completed' ? 'text-primary' : 'text-muted-foreground/50'
                                )} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {task.project && (
                                      <span className="text-sm">{getProjectEmoji(task.project)}</span>
                                    )}
                                    <span className={cn(
                                      'text-sm font-medium truncate',
                                      task.status === 'completed' && 'line-through text-muted-foreground'
                                    )}>
                                      {task.title}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {formatScheduleInfo(task)}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        
                        {/* Habits Section */}
                        {searchResults.habits.length > 0 && (
                          <div>
                            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide border-t border-border mt-1 pt-2">
                              Habits ({searchResults.habits.length})
                            </div>
                            {searchResults.habits.map((habit) => (
                              <button
                                key={habit.id}
                                onClick={() => handleHabitResultClick(habit)}
                                className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-start gap-2"
                              >
                                <Flame className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-500" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm">{getHabitGroupEmoji(habit.group)}</span>
                                    <span className="text-sm font-medium truncate">
                                      {habit.title}
                                    </span>
                                    {habit.streak > 0 && (
                                      <span className="text-xs text-orange-500 font-medium">
                                        {habit.streak} day streak
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {formatHabitScheduleInfo(habit)}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSearch(true)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* View toggle - pill style */}
        <div className="bg-secondary/60 rounded-xl p-1 flex">
          <button
            onClick={() => setViewMode('day')}
            className={cn(
              'h-7 px-3.5 text-xs font-semibold rounded-lg transition-all',
              viewMode === 'day'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Day
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={cn(
              'h-7 px-3.5 text-xs font-semibold rounded-lg transition-all',
              viewMode === 'week'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Week
          </button>
        </div>
        
        {/* Theme toggle */}
        <button
          onClick={() => {
            if (!mounted) return;
            const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
            if (userId) saveSettings(userId, { theme: newTheme });
          }}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
        >
          {mounted ? (
            resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
          ) : (
            <span className="h-4 w-4" />
          )}
        </button>

        <UserProfileDropdown onOpenSettings={onOpenSettings} />
        
        {/* Add button - bold primary action */}
        <button
          onClick={onAddClick}
          className="h-9 px-4 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-lg shadow-primary/25"
        >
          <Plus className="h-4 w-4" />
          <span>Add</span>
        </button>
      </div>
    </header>
  );
}
