'use client';

import { create } from 'zustand';

export interface AtlasNode {
  id: string;
  name: string;
  emoji: string;
  color: string; // CSS color for glow/accent
  activityLevel: number; // 0-1 for heatmap intensity
  taskCount: number;
  completedCount: number;
  children?: AtlasNode[]; // Sub-projects for drill-down
  parentId?: string;
}

export interface AtlasState {
  // Navigation
  currentPath: string[]; // Array of node IDs representing drill-down path
  selectedNodeId: string | null;
  
  // Data
  nodes: AtlasNode[];
  
  // Actions
  drillDown: (nodeId: string) => void;
  drillUp: () => void;
  drillToRoot: () => void;
  selectNode: (nodeId: string | null) => void;
  
  // Computed
  getCurrentNodes: () => AtlasNode[];
  getBreadcrumbs: () => { id: string; name: string; emoji: string }[];
  getSelectedNode: () => AtlasNode | null;
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  currentPath: [],
  selectedNodeId: null,
  nodes: [], // Will be populated from planner store projects
  
  drillDown: (nodeId: string) => {
    const { nodes, currentPath } = get();
    const currentNodes = getCurrentNodesFromPath(nodes, currentPath);
    const targetNode = currentNodes.find(n => n.id === nodeId);
    
    if (targetNode?.children && targetNode.children.length > 0) {
      set({ 
        currentPath: [...currentPath, nodeId],
        selectedNodeId: null 
      });
    }
  },
  
  drillUp: () => {
    const { currentPath } = get();
    if (currentPath.length > 0) {
      set({ 
        currentPath: currentPath.slice(0, -1),
        selectedNodeId: null 
      });
    }
  },
  
  drillToRoot: () => {
    set({ currentPath: [], selectedNodeId: null });
  },
  
  selectNode: (nodeId: string | null) => {
    set({ selectedNodeId: nodeId });
  },
  
  getCurrentNodes: () => {
    const { nodes, currentPath } = get();
    return getCurrentNodesFromPath(nodes, currentPath);
  },
  
  getBreadcrumbs: () => {
    const { nodes, currentPath } = get();
    const breadcrumbs: { id: string; name: string; emoji: string }[] = [
      { id: 'root', name: 'All Projects', emoji: '🏠' }
    ];
    
    let currentNodes = nodes;
    for (const nodeId of currentPath) {
      const node = currentNodes.find(n => n.id === nodeId);
      if (node) {
        breadcrumbs.push({ id: node.id, name: node.name, emoji: node.emoji });
        currentNodes = node.children || [];
      }
    }
    
    return breadcrumbs;
  },
  
  getSelectedNode: () => {
    const { nodes, currentPath, selectedNodeId } = get();
    if (!selectedNodeId) return null;
    
    const currentNodes = getCurrentNodesFromPath(nodes, currentPath);
    return currentNodes.find(n => n.id === selectedNodeId) || null;
  },
}));

// Helper to traverse the node tree
function getCurrentNodesFromPath(nodes: AtlasNode[], path: string[]): AtlasNode[] {
  let currentNodes = nodes;
  
  for (const nodeId of path) {
    const node = currentNodes.find(n => n.id === nodeId);
    if (node?.children) {
      currentNodes = node.children;
    } else {
      break;
    }
  }
  
  return currentNodes;
}
