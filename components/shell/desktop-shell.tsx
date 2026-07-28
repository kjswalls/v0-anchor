'use client';

import { ChevronsRight } from 'lucide-react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ViewRouter } from '@/components/views/view-router';
import { MorningCheck } from '@/components/ai/morning-check';
import { HeaderCapsule } from '@/components/canvas/header-capsule';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/lib/sidebar-store';

/**
 * Desktop layout: sidebar v2 (braindump + chat + omnibar) + canvas panel on
 * the warm backdrop. The views live behind ViewRouter (P5).
 */
export function DesktopShell() {
  const { leftSidebarOpen, toggleLeftSidebar, leftSidebarHoverEnabled, setLeftSidebarHovered } = useSidebarStore();

  return (
    <div className="hidden h-[100dvh] gap-3 bg-surface-0 p-3 md:flex">
      <Sidebar />

      {/* Body panel: a big card floating over the backdrop/sidebar field. The
          hairline border does the close-range work (it survives on top of the
          shadow at the panel's edge, which is what reads as "lifted" in dark
          mode where a black drop barely registers); shadow-elev-panel adds the
          leftward cast onto the sidebar plus a left-edge light-catch, which the
          vertical-only elev family couldn't give it. */}
      <main className="relative flex flex-1 flex-col overflow-hidden rounded-[30px] border border-border bg-canvas shadow-[var(--shadow-elev-panel)]">
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

        {/* Canvas header. canvas-container shares its left edge with every body
            view (Figma x=103 align).

            The two [DEV] emoji triggers that used to sit on the right are gone:
            "Show overdue tasks" and "Start end-of-day review" are real commands
            in the palette now, and the morning one no longer pokes store state
            (which left the server-side dismissal in place, so the reset died on
            the next reload). */}
        <div className="canvas-container flex flex-shrink-0 items-start pt-[31px] pb-2">
          <HeaderCapsule />
        </div>

        {/* Past-due bar. CONTRACT: 50px in flow at every task count, forever —
            the list lives in a portaled Popover and costs this column zero
            layout pixels. lib/use-fit-hour-px.ts derives the schedule grid's
            hour height from the space left below this element, so anything that
            makes this bar's height depend on content (a list rendered in flow, a
            height derived from line-height) drives hourPx to its MIN_HOUR_PX
            floor and destroys the fit-to-height contract. Nothing else in the
            tree says so, which is why it's said here. */}
        <MorningCheck />

        {/* min-h-0 is explicit rather than relying on overflow-hidden to zero the
            automatic minimum size of a flex item: this column is what
            use-fit-hour-px measures into. */}
        <div data-tour="timeline" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ViewRouter />
        </div>

      </main>
    </div>
  );
}
