import { create } from 'zustand'

interface SidebarState {
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  leftSidebarHovered: boolean
  rightSidebarHovered: boolean
  setLeftSidebarOpen: (open: boolean) => void
  setRightSidebarOpen: (open: boolean) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setLeftSidebarHovered: (hovered: boolean) => void
  setRightSidebarHovered: (hovered: boolean) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  leftSidebarOpen: true,
  rightSidebarOpen: false,
  leftSidebarHovered: false,
  rightSidebarHovered: false,
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  toggleLeftSidebar: () => set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
  toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
  setLeftSidebarHovered: (hovered) => set({ leftSidebarHovered: hovered }),
  setRightSidebarHovered: (hovered) => set({ rightSidebarHovered: hovered }),
}))
