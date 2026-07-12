'use client';

import { Sidebar } from '@/components/sidebar/sidebar';
import { ViewRouter } from '@/components/views/view-router';
import { MorningCheck } from '@/components/ai/morning-check';
import { HeaderCapsule } from '@/components/canvas/header-capsule';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useEODStore } from '@/lib/eod-store';
import { useMorningStore } from '@/lib/morning-store';

/**
 * Desktop layout: sidebar v2 (braindump + chat + omnibar) + canvas panel on
 * the warm backdrop. The views live behind ViewRouter (P5).
 */
export function DesktopShell({ activeId }: { activeId: string | null }) {
  const eodStore = useEODStore();
  const { leftSidebarOpen, leftSidebarHoverEnabled, setLeftSidebarHovered } = useSidebarStore();

  return (
    <div className="hidden h-[100dvh] gap-3 bg-surface-0 p-3 md:flex">
      <Sidebar />

      <main className="relative flex flex-1 flex-col overflow-hidden rounded-[30px] bg-canvas shadow-[-2px_2px_4.8px_0px_rgba(0,0,0,0.1)]">
        {/* Left hover zone - shows sidebar when collapsed (if enabled) */}
        {!leftSidebarOpen && leftSidebarHoverEnabled && (
          <div
            className="absolute left-0 top-0 bottom-0 z-40 w-3 cursor-pointer transition-colors hover:bg-primary/10"
            onMouseEnter={() => setLeftSidebarHovered(true)}
          />
        )}

        {/* Canvas header — capsule left, dev triggers right */}
        <div className="flex flex-shrink-0 items-start justify-between px-6 pt-[31px] pb-2">
          <HeaderCapsule />
          <div className="flex items-center gap-2">
            {/* DEV: manual trigger buttons for testing — remove before launch */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => useMorningStore.setState({ morningCheckDismissedDate: null })}
              title="[DEV] Reset morning check (clears dismissed state)"
            >
              ☀️
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => eodStore.open()}
              title="[DEV] Trigger EOD review"
            >
              🌙
            </Button>
          </div>
        </div>

        <MorningCheck />

        <div data-tour="timeline" className="flex flex-1 flex-col overflow-hidden">
          <ViewRouter activeId={activeId} />
        </div>

      </main>
    </div>
  );
}
