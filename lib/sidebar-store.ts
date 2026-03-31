import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveSettings } from './settings-service';
import { usePlannerStore } from './planner-store';

interface SidebarState {
  // Open/closed state
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  // Hover state (transient, not persisted)
  leftSidebarHovered: boolean
  rightSidebarHovered: boolean
  // Settings (persisted)
  leftSidebarHoverEnabled: boolean
  rightSidebarHoverEnabled: boolean
  // Actions
  setLeftSidebarOpen: (open: boolean) => void
  setRightSidebarOpen: (open: boolean) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setLeftSidebarHovered: (hovered: boolean) => void
  setRightSidebarHovered: (hovered: boolean) => void
  setLeftSidebarHoverEnabled: (enabled: boolean) => void
  setRightSidebarHoverEnabled: (enabled: boolean) => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      leftSidebarOpen: true,
      rightSidebarOpen: false,
      leftSidebarHovered: false,
      rightSidebarHovered: false,
      leftSidebarHoverEnabled: false,
      rightSidebarHoverEnabled: false,
      setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
      setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
      toggleLeftSidebar: () => set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
      toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
      setLeftSidebarHovered: (hovered) => set({ leftSidebarHovered: hovered }),
      setRightSidebarHovered: (hovered) => set({ rightSidebarHovered: hovered }),
      setLeftSidebarHoverEnabled: (enabled) => {
        set({ leftSidebarHoverEnabled: enabled });
        const userId = usePlannerStore.getState().userId;
        if (userId) saveSettings(userId, { left_sidebar_hover: enabled });
      },
      setRightSidebarHoverEnabled: (enabled) => {
        set({ rightSidebarHoverEnabled: enabled });
        const userId = usePlannerStore.getState().userId;
        if (userId) saveSettings(userId, { right_sidebar_hover: enabled });
      },
    }),
    {
      name: 'anchor-sidebar-settings',
      partialize: (state) => ({
        leftSidebarOpen: state.leftSidebarOpen,
        rightSidebarOpen: state.rightSidebarOpen,
        leftSidebarHoverEnabled: state.leftSidebarHoverEnabled,
        rightSidebarHoverEnabled: state.rightSidebarHoverEnabled,
      }),
    }
  )
)
