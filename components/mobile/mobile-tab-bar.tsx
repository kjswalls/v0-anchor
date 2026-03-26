'use client';

import { ListTodo, CalendarDays, Sparkles } from 'lucide-react';
import { useMobileNavStore, type MobileTab } from '@/lib/mobile-nav-store';
import { cn } from '@/lib/utils';

const tabs: { id: MobileTab; label: string; icon: typeof ListTodo }[] = [
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'chat', label: 'Beacon', icon: Sparkles },
];

export function MobileTabBar() {
  const { activeTab, setActiveTab } = useMobileNavStore();

  return (
    <nav className="flex items-center justify-around border-t border-border bg-card pb-safe">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-2 px-6 min-w-[72px] transition-colors',
              isActive 
                ? 'text-primary' 
                : 'text-muted-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
            <span className={cn(
              'text-[10px] font-medium',
              isActive && 'font-semibold'
            )}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
