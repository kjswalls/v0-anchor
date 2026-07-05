'use client';

import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { Braindump } from '@/components/sidebar/braindump';
import { UserCard } from '@/components/sidebar/user-card';
import { Omnibar } from '@/components/sidebar/omnibar';
import { useSidebarStore } from '@/lib/sidebar-store';
import { cn } from '@/lib/utils';

/**
 * Desktop sidebar v2: a column of floating cards on the warm backdrop —
 * Braindump on top, identity + history + omnibar pinned at the bottom.
 * The collapsible chat panel slots in between in P4.
 */
export function Sidebar() {
  const {
    leftSidebarOpen,
    leftSidebarHovered,
    leftSidebarHoverEnabled,
    toggleLeftSidebar,
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
          'flex h-full flex-col gap-3 overflow-hidden transition-all duration-300',
          isVisible ? 'w-[300px]' : 'w-0',
          leftSidebarHovered && !leftSidebarOpen && 'absolute left-0 top-0 bottom-0 z-20 rounded-card bg-surface-0 shadow-soft-lg'
        )}
      >
        <Braindump />
        <div className="flex flex-col gap-1.5">
          <UserCard />
          <Omnibar />
        </div>
      </div>

      {/* Collapse toggle — outside the column so it stays visible */}
      <button
        onClick={toggleLeftSidebar}
        className={cn(
          'absolute top-1/2 z-30 -translate-y-1/2',
          'flex items-center px-1 py-3',
          'rounded-r-lg border border-l-0 border-border bg-card shadow-soft-sm',
          'transition-colors duration-200 hover:bg-accent',
          isVisible ? 'left-[300px]' : '-left-3'
        )}
        title={leftSidebarOpen ? 'Collapse sidebar (⌘[)' : 'Expand sidebar (⌘[)'}
      >
        {leftSidebarOpen ? (
          <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <PanelLeft className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
