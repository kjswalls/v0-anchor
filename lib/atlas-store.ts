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
  // Data - hierarchical items
  rootItems: AtlasItem[];
  
  // Navigation state
  focusPath: string[];
  selectedItemId: string | null;
  
  // Computed ring rotation angles (animated)
  ringRotations: number[];
  
  // Actions
  setRootItems: (items: AtlasItem[]) => void;
  selectItem: (itemId: string | null) => void;
  zoomIn: (itemId: string) => void;
  zoomOut: () => void;
  zoomToRoot: () => void;
  setRingRotation: (ringIndex: number, angle: number) => void;
  
  // Getters
  getFocusedItem: () => AtlasItem | null;
  getVisibleRings: () => RingConfig[];
  getBreadcrumbs: () => { id: string; name: string; emoji: string; type: AtlasItemType }[];
  getSelectedItem: () => AtlasItem | null;
  getItemById: (id: string) => AtlasItem | null;
  getLineage: (itemId: string) => AtlasItem[];
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

// Create placeholder items
function createPlaceholders(count: number, ringType: string): PlaceholderItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `placeholder-${ringType}-${i}`,
    isPlaceholder: true as const,
  }));
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  rootItems: [],
  focusPath: [],
  selectedItemId: null,
  ringRotations: [0, 0, 0, 0, 0],
  
  setRootItems: (items) => set({ rootItems: items }),
  
  selectItem: (itemId) => {
    console.log('[v0] selectItem called with:', itemId);
    set({ selectedItemId: itemId });
  },
  
  zoomIn: (itemId) => {
    const item = get().getItemById(itemId);
    if (item && item.children.length > 0) {
      set(state => ({
        focusPath: [...state.focusPath, itemId],
        selectedItemId: null,
        ringRotations: [0, 0, 0, 0, 0],
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
    
    // Find selected item to determine what children to show
    const selectedItem = selectedItemId ? findItemById(rootItems, selectedItemId) : null;
    
    // Ring 0: Parent level (faded, for zoom out)
    if (focusPath.length > 0) {
      const parentId = focusPath[focusPath.length - 1];
      const parent = findItemById(rootItems, parentId);
      if (parent) {
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
          isPopulated: true,
        });
      }
    }
    
    // Ring 1: Current focus level (main ring) - always populated
    rings.push({
      index: rings.length,
      label: getLabelForType(getTypeForDepth(baseDepth)),
      items: baseItems,
      isFaded: false,
      rotationAngle: ringRotations[1] || 0,
      isPopulated: true,
    });
    
    // Ring 2: Children level (Tasks ring)
    // Shows real items when:
    // - A project is selected (showing project's children)
    // - A task is selected (keep showing siblings - the task's parent's children)
    const isProjectSelected = selectedItem && selectedItem.type === 'project';
    const isTaskSelected = selectedItem && selectedItem.type === 'task';
    const RING_SLOT_COUNT = 6;
    
    // Find the parent of the selected task to show its siblings
    const taskParent = isTaskSelected && selectedItem?.parentId 
      ? findItemById(rootItems, selectedItem.parentId) 
      : null;
    
    let childRingItems: RingItem[];
    let childRingPopulated = false;
    
    if (isProjectSelected && selectedItem && selectedItem.children.length > 0) {
      // Project selected: show project's children (tasks)
      const realItems = selectedItem.children.slice(0, 5);
      const placeholderCount = Math.max(0, RING_SLOT_COUNT - realItems.length);
      childRingItems = [...realItems, ...createPlaceholders(placeholderCount, 'tasks')];
      childRingPopulated = true;
    } else if (isTaskSelected && taskParent && taskParent.children.length > 0) {
      // Task selected: keep showing the task's siblings (parent's children)
      const realItems = taskParent.children.slice(0, 5);
      const placeholderCount = Math.max(0, RING_SLOT_COUNT - realItems.length);
      childRingItems = [...realItems, ...createPlaceholders(placeholderCount, 'tasks')];
      childRingPopulated = true;
    } else {
      // Show only placeholders when nothing relevant is selected
      childRingItems = createPlaceholders(RING_SLOT_COUNT, 'tasks');
    }
    
    rings.push({
      index: rings.length,
      label: getLabelForType(getTypeForDepth(baseDepth + 1)),
      items: childRingItems,
      isFaded: false,
      rotationAngle: ringRotations[2] || 0,
      isPopulated: childRingPopulated,
    });
    
    // Ring 3: Grandchildren level (Subtasks ring)
    // Shows real items when:
    // - A task is selected (showing task's children)
    // - A subtask is selected (keep showing siblings - the subtask's parent's children)
    const isSubtaskSelected = selectedItem && selectedItem.type === 'subtask';
    
    // Find the parent of the selected subtask to show its siblings
    const subtaskParent = isSubtaskSelected && selectedItem?.parentId 
      ? findItemById(rootItems, selectedItem.parentId) 
      : null;
    
    let grandchildRingItems: RingItem[];
    let grandchildRingPopulated = false;
    
    if (isTaskSelected && selectedItem && selectedItem.children.length > 0) {
      // Task selected: show task's children (subtasks)
      const realItems = selectedItem.children.slice(0, 5);
      const placeholderCount = Math.max(0, RING_SLOT_COUNT - realItems.length);
      grandchildRingItems = [...realItems, ...createPlaceholders(placeholderCount, 'subtasks')];
      grandchildRingPopulated = true;
    } else if (isSubtaskSelected && subtaskParent && subtaskParent.children.length > 0) {
      // Subtask selected: keep showing the subtask's siblings (parent's children)
      const realItems = subtaskParent.children.slice(0, 5);
      const placeholderCount = Math.max(0, RING_SLOT_COUNT - realItems.length);
      grandchildRingItems = [...realItems, ...createPlaceholders(placeholderCount, 'subtasks')];
      grandchildRingPopulated = true;
    } else {
      // Show only placeholders when nothing relevant is selected
      grandchildRingItems = createPlaceholders(RING_SLOT_COUNT, 'subtasks');
    }
    
    rings.push({
      index: rings.length,
      label: getLabelForType(getTypeForDepth(baseDepth + 2)),
      items: grandchildRingItems,
      isFaded: false,
      rotationAngle: ringRotations[3] || 0,
      isPopulated: grandchildRingPopulated,
    });
    
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
