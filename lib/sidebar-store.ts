import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveSettings } from './settings-service';
import { usePlannerStore } from './planner-store';

interface SidebarState {
  // Open/closed state
  leftSidebarOpen: boolean
  /** Chat panel inside the sidebar (replaced the old right sidebar in P4). */
  chatExpanded: boolean
  // Hover state (transient, not persisted)
  leftSidebarHovered: boolean
  // Settings (persisted)
  leftSidebarHoverEnabled: boolean
  // Actions
  setLeftSidebarOpen: (open: boolean) => void
  toggleLeftSidebar: () => void
  setChatExpanded: (expanded: boolean) => void
  toggleChat: () => void
  setLeftSidebarHovered: (hovered: boolean) => void
  setLeftSidebarHoverEnabled: (enabled: boolean) => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      leftSidebarOpen: true,
      chatExpanded: false,
      leftSidebarHovered: false,
      leftSidebarHoverEnabled: false,
      setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
      toggleLeftSidebar: () => set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
      setChatExpanded: (expanded) => set({ chatExpanded: expanded }),
      toggleChat: () => set((state) => ({ chatExpanded: !state.chatExpanded })),
      setLeftSidebarHovered: (hovered) => set({ leftSidebarHovered: hovered }),
      setLeftSidebarHoverEnabled: (enabled) => {
        set({ leftSidebarHoverEnabled: enabled });
        const userId = usePlannerStore.getState().userId;
        if (userId) saveSettings(userId, { left_sidebar_hover: enabled });
      },
    }),
    {
      name: 'anchor-sidebar-settings',
      version: 2,
      migrate: (persisted) => {
        // v1 → v2: right sidebar became the in-sidebar chat panel
        const state = (persisted ?? {}) as Record<string, unknown>;
        return {
          leftSidebarOpen: (state.leftSidebarOpen as boolean) ?? true,
          chatExpanded: (state.rightSidebarOpen as boolean) ?? false,
          leftSidebarHoverEnabled: (state.leftSidebarHoverEnabled as boolean) ?? false,
        };
      },
      partialize: (state) => ({
        leftSidebarOpen: state.leftSidebarOpen,
        chatExpanded: state.chatExpanded,
        leftSidebarHoverEnabled: state.leftSidebarHoverEnabled,
      }),
    }
  )
)
