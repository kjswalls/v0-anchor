'use client';

import { create } from 'zustand';

// Hierarchy types for atlas view
export type AtlasItemType = 'project' | 'task' | 'subtask';

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

// Ring configuration for displaying hierarchy
export interface RingConfig {
  index: number; // 0 = parent (faded), 1 = current level, 2 = children, 3 = grandchildren, 4 = great-grandchildren (faded)
  label: string; // e.g., "PROJECTS", "TASKS", "SUBTASKS"
  items: AtlasItem[];
  isFaded: boolean; // True for zoom-out (ring 0) and zoom-in (ring 4)
  rotationAngle: number; // Angle to rotate ring to center selected item
}

export interface AtlasState {
  // Data - hierarchical items
  rootItems: AtlasItem[]; // Top-level projects
  
  // Navigation state
  focusPath: string[]; // Stack of selected item IDs showing current "zoom" level
  selectedItemId: string | null; // Currently highlighted item (for showing children connections)
  
  // Computed ring rotation angles (animated)
  ringRotations: number[]; // Rotation angle per ring to center selected items
  
  // Actions
  setRootItems: (items: AtlasItem[]) => void;
  selectItem: (itemId: string | null) => void;
  zoomIn: (itemId: string) => void; // Drill down into item's children
  zoomOut: () => void; // Go back up one level
  zoomToRoot: () => void;
  setRingRotation: (ringIndex: number, angle: number) => void;
  
  // Getters
  getFocusedItem: () => AtlasItem | null; // The item we're "zoomed into"
  getVisibleRings: () => RingConfig[]; // Get configured rings for current view
  getBreadcrumbs: () => { id: string; name: string; emoji: string; type: AtlasItemType }[];
  getSelectedItem: () => AtlasItem | null;
  getItemById: (id: string) => AtlasItem | null;
  getLineage: (itemId: string) => AtlasItem[]; // Get full parent chain
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

// Helper to get all items at a specific depth
function getItemsAtDepth(items: AtlasItem[], depth: number): AtlasItem[] {
  if (depth === 0) return items;
  const result: AtlasItem[] = [];
  for (const item of items) {
    result.push(...getItemsAtDepth(item.children, depth - 1));
  }
  return result;
}

// Helper to get label for item type
function getLabelForType(type: AtlasItemType): string {
  switch (type) {
    case 'project': return 'PROJECTS';
    case 'task': return 'TASKS';
    case 'subtask': return 'SUBTASKS';
    default: return 'ITEMS';
  }
}

// Helper to determine item type by depth
function getTypeForDepth(depth: number): AtlasItemType {
  switch (depth) {
    case 0: return 'project';
    case 1: return 'task';
    default: return 'subtask';
  }
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  rootItems: [],
  focusPath: [],
  selectedItemId: null,
  ringRotations: [0, 0, 0, 0, 0],
  
  setRootItems: (items) => set({ rootItems: items }),
  
  selectItem: (itemId) => {
    set({ selectedItemId: itemId });
  },
  
  zoomIn: (itemId) => {
    const item = get().getItemById(itemId);
    if (item && item.children.length > 0) {
      set(state => ({
        focusPath: [...state.focusPath, itemId],
        selectedItemId: null,
        ringRotations: [0, 0, 0, 0, 0], // Reset rotations
      }));
    }
  },
  
  zoomOut: () => {
    set(state => ({
      focusPath: state.focusPath.slice(0, -1),
      selectedItemId: null,
      ringRotations: [0, 0, 0, 0, 0],
    }));
  },
  
  zoomToRoot: () => {
    set({
      focusPath: [],
      selectedItemId: null,
      ringRotations: [0, 0, 0, 0, 0],
    });
  },
  
  setRingRotation: (ringIndex, angle) => {
    set(state => {
      const newRotations = [...state.ringRotations];
      newRotations[ringIndex] = angle;
      return { ringRotations: newRotations };
    });
  },
  
  getFocusedItem: () => {
    const { rootItems, focusPath } = get();
    if (focusPath.length === 0) return null;
    return findItemById(rootItems, focusPath[focusPath.length - 1]);
  },
  
  getVisibleRings: () => {
    const { rootItems, focusPath, selectedItemId, ringRotations } = get();
    const rings: RingConfig[] = [];
    
    // Determine base items for current view
    let baseItems = rootItems;
    let baseDepth = 0;
    
    // Navigate down to focused level
    for (const focusId of focusPath) {
      const item = findItemById(baseItems, focusId);
      if (item) {
        baseItems = item.children;
        baseDepth++;
      }
    }
    
    // Ring 0: Parent level (faded, for zoom out)
    if (focusPath.length > 0) {
      const parentId = focusPath[focusPath.length - 1];
      const parent = findItemById(rootItems, parentId);
      if (parent) {
        // Get siblings of parent (items at same level as parent)
        let parentLevel = rootItems;
        for (let i = 0; i < focusPath.length - 1; i++) {
          const item = findItemById(parentLevel, focusPath[i]);
          if (item) parentLevel = item.children;
        }
        rings.push({
          index: 0,
          label: getLabelForType(getTypeForDepth(baseDepth - 1)),
          items: parentLevel,
          isFaded: true,
          rotationAngle: ringRotations[0] || 0,
        });
      }
    }
    
    // Ring 1: Current focus level (main ring)
    rings.push({
      index: rings.length,
      label: getLabelForType(getTypeForDepth(baseDepth)),
      items: baseItems,
      isFaded: false,
      rotationAngle: ringRotations[1] || 0,
    });
    
    // Ring 2: Children of current level
    const childItems = baseItems.flatMap(item => item.children);
    if (childItems.length > 0) {
      // If an item is selected, filter to show only that item's children prominently
      const filteredChildren = selectedItemId
        ? childItems.filter(c => c.parentId === selectedItemId || 
            baseItems.some(b => b.id === c.parentId))
        : childItems;
      
      rings.push({
        index: rings.length,
        label: getLabelForType(getTypeForDepth(baseDepth + 1)),
        items: filteredChildren,
        isFaded: false,
        rotationAngle: ringRotations[2] || 0,
      });
    }
    
    // Ring 3: Grandchildren
    const grandchildItems = childItems.flatMap(item => item.children);
    if (grandchildItems.length > 0) {
      const filteredGrandchildren = selectedItemId
        ? grandchildItems.filter(g => {
            const parent = findItemById(childItems, g.parentId || '');
            return parent && parent.parentId === selectedItemId;
          })
        : grandchildItems;
      
      if (filteredGrandchildren.length > 0) {
        rings.push({
          index: rings.length,
          label: getLabelForType(getTypeForDepth(baseDepth + 2)),
          items: filteredGrandchildren,
          isFaded: false,
          rotationAngle: ringRotations[3] || 0,
        });
      }
    }
    
    // Ring 4: Great-grandchildren (faded, for zoom in hint)
    const greatGrandchildItems = grandchildItems.flatMap(item => item.children);
    if (greatGrandchildItems.length > 0) {
      rings.push({
        index: rings.length,
        label: '',
        items: greatGrandchildItems.slice(0, 5), // Limit for visual clarity
        isFaded: true,
        rotationAngle: ringRotations[4] || 0,
      });
    }
    
    return rings;
  },
  
  getBreadcrumbs: () => {
    const { rootItems, focusPath, selectedItemId } = get();
    const breadcrumbs: { id: string; name: string; emoji: string; type: AtlasItemType }[] = [
      { id: 'root', name: 'All', emoji: '🏠', type: 'project' }
    ];
    
    let currentItems = rootItems;
    for (const itemId of focusPath) {
      const item = findItemById(currentItems, itemId);
      if (item) {
        breadcrumbs.push({
          id: item.id,
          name: item.name,
          emoji: item.emoji,
          type: item.type,
        });
        currentItems = item.children;
      }
    }
    
    // Add selected item if different from last focus
    if (selectedItemId && selectedItemId !== focusPath[focusPath.length - 1]) {
      const selected = findItemById(rootItems, selectedItemId);
      if (selected) {
        breadcrumbs.push({
          id: selected.id,
          name: selected.name,
          emoji: selected.emoji,
          type: selected.type,
        });
      }
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
}));
