'use client';

import { AlignLeft, Sun, Sparkles } from 'lucide-react';
import { useMobileNavStore, MOBILE_TAB_ORDER, type MobileTab } from '@/lib/mobile-nav-store';
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

  const labels: Record<MobileTab, string> = {
    braindump: 'Braindump',
    today: 'Today',
    chat: getAITabLabel(provider),
  };
  const icons: Record<MobileTab, typeof AlignLeft> = {
    braindump: AlignLeft,
    today: Sun,
    chat: Sparkles,
  };

  return (
    <nav className="flex items-center justify-around border-t border-border bg-card pb-safe">
      {MOBILE_TAB_ORDER.map((id) => {
        const Icon = icons[id];
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            data-tour={`tab-${id}`}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex min-w-[72px] flex-col items-center justify-center gap-1 px-6 py-2 transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
            <span className={cn('text-[10px] font-medium', isActive && 'font-semibold')}>
              {labels[id]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
