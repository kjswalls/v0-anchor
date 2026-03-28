'use client';

import { ListTodo, CalendarDays, Sparkles } from 'lucide-react';
import { useMobileNavStore, type MobileTab } from '@/lib/mobile-nav-store';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { cn } from '@/lib/utils';

function getAITabLabel(provider: string): string {
  if (provider === 'openclaw') return 'OpenClaw';
  if (provider === 'none') return 'AI Magic';
  return 'Beacon';
}

export function MobileTabBar() {
  const { activeTab, setActiveTab } = useMobileNavStore();
  const { provider } = useAISettingsStore();

  const tabs: { id: MobileTab; label: string; icon: typeof ListTodo }[] = [
    { id: 'tasks', label: 'To Do', icon: ListTodo },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays },
    { id: 'chat', label: getAITabLabel(provider), icon: Sparkles },
  ];

  return (
    <nav className="flex items-center justify-around border-t border-border bg-card pb-safe">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            data-tour={`tab-${tab.id}`}
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
