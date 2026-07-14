'use client';

import { ChevronsRight } from 'lucide-react';
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
export function DesktopShell() {
  const eodStore = useEODStore();
  const { leftSidebarOpen, toggleLeftSidebar, leftSidebarHoverEnabled, setLeftSidebarHovered } = useSidebarStore();

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

        {/* Expand-sidebar affordance when collapsed — absolutely positioned at
            the panel's top-left so it never shifts the header capsule (which
            stays fixed at the canvas-container left edge) and reads as the same
            control that lived in the sidebar header, just flipped. */}
        {!leftSidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-[35px] z-30 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={toggleLeftSidebar}
            aria-label="Expand sidebar"
            title="Expand sidebar (⌘[)"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}

        {/* Canvas header — capsule left, dev triggers right. canvas-container
            shares its left edge with every body view (Figma x=103 align). */}
        <div className="canvas-container flex flex-shrink-0 items-start justify-between pt-[31px] pb-2">
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
          <ViewRouter />
        </div>

      </main>
    </div>
  );
}
