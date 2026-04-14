'use client';

import { create } from 'zustand';

// Hierarchy types for atlas view
// Levels: meta_project (0) -> project (1) -> task (2) -> subtask (3)
export type AtlasItemType = 'meta_project' | 'project' | 'task' | 'subtask';

export interface AtlasItem {
  id: string;
  name: string;
  emoji: string;
  color: string;
  type: AtlasItemType;
  activityLevel: number; // 0-1 for heatmap intensity
  taskCount: number;
  completedCount: number;
  parentId: string | null;
  children: AtlasItem[];
}

// Placeholder item for unpopulated rings
export interface PlaceholderItem {
  id: string;
  isPlaceholder: true;
}

export type RingItem = AtlasItem | PlaceholderItem;

export function isPlaceholder(item: RingItem): item is PlaceholderItem {
  return 'isPlaceholder' in item && item.isPlaceholder === true;
}

// Ring configuration for displaying hierarchy
export interface RingConfig {
  index: number;
  label: string;
  items: RingItem[];
  isFaded: boolean;
  rotationAngle: number;
  isPopulated: boolean; // Whether this ring shows real items or placeholders
}

export interface AtlasState {
  // Data - hierarchical items (rootItems are meta_projects containing projects)
  rootItems: AtlasItem[];
  
  // Navigation state
  // viewLevel determines which 3 levels are shown:
  // viewLevel 0: meta_projects (ring1), projects (ring2), tasks (ring3)
  // viewLevel 1: projects (ring1), tasks (ring2), subtasks (ring3)
  viewLevel: number;
  maxViewLevel: number; // Calculated based on data depth
  selectedItemId: string | null;
  
  // Computed ring rotation angles (animated)
  ringRotations: number[];
  
  // Animation state
  navigationDirection: 'up' | 'down' | null;
  
  // Actions
  setRootItems: (items: AtlasItem[]) => void;
  selectItem: (itemId: string | null) => void;
  setRingRotation: (ringIndex: number, angle: number) => void;
  navigateUp: () => void;
  navigateDown: () => void;
  
  // Getters
  getVisibleRings: () => RingConfig[];
  getBreadcrumbs: () => { id: string; name: string; emoji: string; type: AtlasItemType }[];
  getSelectedItem: () => AtlasItem | null;
  getItemById: (id: string) => AtlasItem | null;
  getLineage: (itemId: string) => AtlasItem[];
  canNavigateUp: () => boolean;
  canNavigateDown: () => boolean;
  getNavigationLabels: () => { upLabel: string | null; downLabel: string | null };
  getLevelLabel: (level: number) => string;
}

// Helper to find item by ID in tree
function findItemById(items: AtlasItem[], id: string): AtlasItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children.length > 0) {
      const found = findItemById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Helper to get label for hierarchy level
function getLabelForLevel(level: number): string {
  switch (level) {
    case 0: return 'META PROJECTS';
    case 1: return 'PROJECTS';
    case 2: return 'TASKS';
    case 3: return 'SUBTASKS';
    default: return 'ITEMS';
  }
}

// Helper to determine item type by level
function getTypeForLevel(level: number): AtlasItemType {
  switch (level) {
    case 0: return 'meta_project';
    case 1: return 'project';
    case 2: return 'task';
    default: return 'subtask';
  }
}

// Create placeholder items
function createPlaceholders(count: number, ringType: string): PlaceholderItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `placeholder-${ringType}-${i}`,
    isPlaceholder: true as const,
  }));
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  rootItems: [],
  viewLevel: 0, // Start showing meta_projects, projects, tasks
  maxViewLevel: 1, // Can shift down to show projects, tasks, subtasks
  selectedItemId: null,
  ringRotations: [0, 0, 0, 0, 0],
  navigationDirection: null as 'up' | 'down' | null,
  
  setRootItems: (items) => set({ rootItems: items }),
  
  selectItem: (itemId) => {
    set({ selectedItemId: itemId });
  },
  
  navigateUp: () => {
    // Shift view window up one level
    const { viewLevel } = get();
    if (viewLevel > 0) {
      set({
        viewLevel: viewLevel - 1,
        selectedItemId: null,
        ringRotations: [0, 0, 0, 0, 0],
        navigationDirection: 'up',
      });
      // Clear direction after animation completes
      setTimeout(() => set({ navigationDirection: null }), 400);
    }
  },
  
  navigateDown: () => {
    // Shift view window down one level
    const { viewLevel, maxViewLevel } = get();
    if (viewLevel < maxViewLevel) {
      set({
        viewLevel: viewLevel + 1,
        selectedItemId: null,
        ringRotations: [0, 0, 0, 0, 0],
        navigationDirection: 'down',
      });
      // Clear direction after animation completes
      setTimeout(() => set({ navigationDirection: null }), 400);
    }
  },
  
  setRingRotation: (ringIndex, angle) => {
    set(state => {
      const newRotations = [...state.ringRotations];
      newRotations[ringIndex] = angle;
      return { ringRotations: newRotations };
    });
  },
  
  getVisibleRings: () => {
    const { rootItems, viewLevel, selectedItemId, ringRotations } = get();
    const rings: RingConfig[] = [];
    const RING_SLOT_COUNT = 6;
    
    // Helper to get items at a specific hierarchy level
    // Level 0 = rootItems (meta_projects), Level 1 = their children (projects), etc.
    const getItemsAtLevel = (level: number): AtlasItem[] => {
      if (level === 0) return rootItems;
      
      // Collect all items at the target level by traversing the tree
      const collectAtLevel = (items: AtlasItem[], currentLevel: number): AtlasItem[] => {
        if (currentLevel === level) return items;
        return items.flatMap(item => collectAtLevel(item.children, currentLevel + 1));
      };
      
      return collectAtLevel(rootItems, 0);
    };
    
    // Helper to get children of a specific item type from selected ancestry
    const getChildrenForRing = (ringLevel: number): { items: RingItem[]; populated: boolean } => {
      const selectedItem = selectedItemId ? findItemById(rootItems, selectedItemId) : null;
      
      if (!selectedItem) {
        return { items: createPlaceholders(RING_SLOT_COUNT, `level-${ringLevel}`), populated: false };
      }
      
      // Build ancestry chain
      const ancestry: AtlasItem[] = [];
      let current: AtlasItem | null = selectedItem;
      while (current) {
        ancestry.unshift(current);
        current = current.parentId ? findItemById(rootItems, current.parentId) : null;
      }
      
      // Determine which item in the ancestry is at the ring's parent level
      const parentLevel = ringLevel - 1;
      const parentLevelIndex = parentLevel - viewLevel;
      
      // Find the relevant parent from the ancestry
      if (parentLevelIndex >= 0 && parentLevelIndex < ancestry.length) {
        const parentItem = ancestry[parentLevelIndex];
        if (parentItem.children.length > 0) {
          const realItems = parentItem.children.slice(0, 5);
          const placeholderCount = Math.max(0, RING_SLOT_COUNT - realItems.length);
          return {
            items: [...realItems, ...createPlaceholders(placeholderCount, `level-${ringLevel}`)],
            populated: true,
          };
        }
      }
      
      // If selected item is at this ring's level, show siblings
      const selectedLevelIndex = ancestry.length - 1;
      const thisRingLevelIndex = ringLevel - viewLevel;
      if (selectedLevelIndex === thisRingLevelIndex && ancestry.length > 1) {
        const parent = ancestry[ancestry.length - 2];
        if (parent.children.length > 0) {
          const realItems = parent.children.slice(0, 5);
          const placeholderCount = Math.max(0, RING_SLOT_COUNT - realItems.length);
          return {
            items: [...realItems, ...createPlaceholders(placeholderCount, `level-${ringLevel}`)],
            populated: true,
          };
        }
      }
      
      return { items: createPlaceholders(RING_SLOT_COUNT, `level-${ringLevel}`), populated: false };
    };
    
    // Ring 1: Top visible level (viewLevel)
    const ring1Level = viewLevel;
    const ring1Items = getItemsAtLevel(ring1Level);
    rings.push({
      index: 0,
      label: getLabelForLevel(ring1Level),
      items: ring1Items.length > 0 ? ring1Items : createPlaceholders(RING_SLOT_COUNT, `level-${ring1Level}`),
      isFaded: false,
      rotationAngle: ringRotations[0] || 0,
      isPopulated: ring1Items.length > 0,
    });
    
    // Ring 2: Middle level (viewLevel + 1)
    const ring2Level = viewLevel + 1;
    const ring2Data = getChildrenForRing(ring2Level);
    rings.push({
      index: 1,
      label: getLabelForLevel(ring2Level),
      items: ring2Data.items,
      isFaded: false,
      rotationAngle: ringRotations[1] || 0,
      isPopulated: ring2Data.populated,
    });
    
    // Ring 3: Bottom level (viewLevel + 2)
    const ring3Level = viewLevel + 2;
    const ring3Data = getChildrenForRing(ring3Level);
    rings.push({
      index: 2,
      label: getLabelForLevel(ring3Level),
      items: ring3Data.items,
      isFaded: false,
      rotationAngle: ringRotations[2] || 0,
      isPopulated: ring3Data.populated,
    });
    
    return rings;
  },
  
  getBreadcrumbs: () => {
    const { rootItems, selectedItemId } = get();
    const breadcrumbs: { id: string; name: string; emoji: string; type: AtlasItemType }[] = [
      { id: 'root', name: 'All', emoji: '🏠', type: 'project' }
    ];
    
    // Build the full ancestry chain by walking up through parentId
    if (selectedItemId) {
      const ancestry: { id: string; name: string; emoji: string; type: AtlasItemType }[] = [];
      let currentItem = findItemById(rootItems, selectedItemId);
      
      // Walk up the tree collecting ancestors
      while (currentItem) {
        ancestry.unshift({
          id: currentItem.id,
          name: currentItem.name,
          emoji: currentItem.emoji,
          type: currentItem.type,
        });
        
        if (currentItem.parentId) {
          currentItem = findItemById(rootItems, currentItem.parentId);
        } else {
          break;
        }
      }
      
      // Add ancestry to breadcrumbs
      breadcrumbs.push(...ancestry);
    }
    
    return breadcrumbs;
  },
  
  getSelectedItem: () => {
    const { rootItems, selectedItemId } = get();
    if (!selectedItemId) return null;
    return findItemById(rootItems, selectedItemId);
  },
  
  getItemById: (id) => {
    return findItemById(get().rootItems, id);
  },
  
  getLineage: (itemId) => {
    const { rootItems } = get();
    const lineage: AtlasItem[] = [];
    
    function findPath(items: AtlasItem[], targetId: string, path: AtlasItem[]): boolean {
      for (const item of items) {
        if (item.id === targetId) {
          lineage.push(...path, item);
          return true;
        }
        if (item.children.length > 0) {
          if (findPath(item.children, targetId, [...path, item])) {
            return true;
          }
        }
      }
      return false;
    }
    
    findPath(rootItems, itemId, []);
    return lineage;
  },
  
  canNavigateUp: () => {
    const { viewLevel } = get();
    return viewLevel > 0;
  },
  
  canNavigateDown: () => {
    const { viewLevel, maxViewLevel } = get();
    return viewLevel < maxViewLevel;
  },
  
  getNavigationLabels: () => {
    const { viewLevel, maxViewLevel } = get();
    
    // Up label: the level that would become visible at the top
    const upLabel = viewLevel > 0 ? getLabelForLevel(viewLevel - 1) : null;
    
    // Down label: the level that would become visible at the bottom
    const downLabel = viewLevel < maxViewLevel ? getLabelForLevel(viewLevel + 3) : null;
    
    return { upLabel, downLabel };
  },
  
  getLevelLabel: (level: number) => {
    return getLabelForLevel(level);
  },
}));
