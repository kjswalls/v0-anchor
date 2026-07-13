'use client';

import { Braindump } from '@/components/sidebar/braindump';
import { SidebarDock } from '@/components/sidebar/sidebar-dock';
import { useSidebarStore } from '@/lib/sidebar-store';
import { cn } from '@/lib/utils';

/**
 * Desktop sidebar v2: the Braindump on the warm backdrop (header card + list
 * on paper) over the SidebarDock — one card holding identity, session
 * history, and the omnibar. Chat has no bar of its own; it grows out of the
 * dock when summoned from the omnibar.
 */
export function Sidebar() {
  const {
    leftSidebarOpen,
    leftSidebarHovered,
    leftSidebarHoverEnabled,
    setLeftSidebarHovered,
  } = useSidebarStore();
  const isVisible = leftSidebarOpen || (leftSidebarHoverEnabled && leftSidebarHovered);

  return (
    <div
      data-tour="left-sidebar"
      className="relative flex h-full"
      onMouseLeave={() => leftSidebarHovered && setLeftSidebarHovered(false)}
    >
      <div
        className={cn(
          // pt-[31px] matches the canvas header so the Braindump title row lines
          // up vertically with the date selector (both 43px from window top per
          // Figma). pb-[16px] lifts the bottom dock capsule 28px off the window.
          'flex h-full flex-col gap-3 overflow-hidden pt-[31px] pb-[16px] transition-all duration-300',
          isVisible ? 'w-[406px]' : 'w-0',
          leftSidebarHovered && !leftSidebarOpen && 'absolute left-0 top-0 bottom-0 z-20 rounded-card bg-surface-0 shadow-soft-lg'
        )}
      >
        <Braindump />
        <SidebarDock />
      </div>
    </div>
  );
}
