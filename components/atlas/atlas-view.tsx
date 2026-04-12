'use client';

import { useEffect, useMemo, useCallback, useState } from 'react';
import { useAtlasStore, type AtlasNode } from '@/lib/atlas-store';
import { generateMockAtlasNodes, getMockTasksForProject } from '@/lib/atlas-mock-data';
import { AtlasRings } from './atlas-rings';
import { TodayPortal } from './today-portal';
import { AtlasBreadcrumbs } from './atlas-breadcrumbs';
import { AtlasTaskPanel } from './atlas-task-panel';
import { usePlannerStore } from '@/lib/planner-store';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AtlasViewProps {
  onExitAtlas: () => void;
}

export function AtlasView({ onExitAtlas }: AtlasViewProps) {
  const { tasks, selectedDate } = usePlannerStore();
  const {
    currentPath,
    selectedNodeId,
    drillDown,
    drillUp,
    drillToRoot,
    selectNode,
    getCurrentNodes,
    getBreadcrumbs,
    getSelectedNode,
  } = useAtlasStore();
  
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Initialize nodes from mock data (in production, derive from planner store)
  useEffect(() => {
    const mockNodes = generateMockAtlasNodes();
    useAtlasStore.setState({ nodes: mockNodes });
  }, []);
  
  // Measure container size for fullscreen experience
  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isMobile = width < 768;
      // Full width since sidebars are hidden in Atlas mode
      // Height minus header (56px), breadcrumbs (~40px), and bottom panel (~200px on desktop)
      const availableWidth = width;
      const availableHeight = isMobile 
        ? height - 56 - 40 - 60 // Mobile: header + breadcrumbs + drawer trigger
        : height - 56 - 40 - 200; // Desktop: header + breadcrumbs + bottom panel
      setContainerSize({
        width: availableWidth,
        height: availableHeight,
      });
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNodeId) {
          selectNode(null);
        } else if (currentPath.length > 0) {
          drillUp();
        } else {
          onExitAtlas();
        }
      }
      if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey) {
        // Prevent if focused on input
        if (document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault();
        if (currentPath.length > 0) {
          drillUp();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, currentPath, selectNode, drillUp, onExitAtlas]);
  
  const currentNodes = getCurrentNodes();
  const breadcrumbs = getBreadcrumbs();
  const selectedNode = getSelectedNode();
  
  // Calculate total progress for today portal
  const todayTasks = useMemo(() => {
    return tasks.filter(t => t.startDate === selectedDate.toISOString().split('T')[0]);
  }, [tasks, selectedDate]);
  
  const totalTasks = todayTasks.length || currentNodes.reduce((sum, n) => sum + n.taskCount, 0);
  const completedTasks = todayTasks.filter(t => t.status === 'completed').length || 
    currentNodes.reduce((sum, n) => sum + n.completedCount, 0);
  
  // Get mock tasks for selected project
  const selectedTasks = useMemo(() => {
    if (!selectedNodeId) return [];
    return getMockTasksForProject(selectedNodeId);
  }, [selectedNodeId]);
  
  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback((index: number) => {
    if (index === 0) {
      drillToRoot();
    } else {
      // Navigate to specific level
      const targetPath = breadcrumbs.slice(1, index + 1).map(b => b.id);
      useAtlasStore.setState({ currentPath: targetPath, selectedNodeId: null });
    }
  }, [breadcrumbs, drillToRoot]);
  
  // Ring size - make it bigger to fill most of the container
  const ringSize = Math.min(
    containerSize.width * 0.95, 
    containerSize.height * 0.95, 
    900 // Max size
  );
  
  // Determine ring count based on viewport
  const ringCount = containerSize.width < 768 ? 2 : 3;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Breadcrumbs */}
      <AtlasBreadcrumbs
        breadcrumbs={breadcrumbs}
        onNavigate={handleBreadcrumbNavigate}
        onBack={drillUp}
        canGoBack={currentPath.length > 0}
      />
      
      {/* Main content - vertical layout with rings on top, panel below */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Atlas visualization - takes most of the space */}
        <div
          className="flex-1 flex items-start justify-center pt-4 relative overflow-hidden"
          onClick={() => selectNode(null)}
        >
          {ringSize > 0 && (
            <div className="relative" style={{ width: ringSize, height: ringSize }}>
              <AtlasRings
                nodes={currentNodes}
                selectedNodeId={selectedNodeId}
                onSelectNode={selectNode}
                onDrillDown={drillDown}
                ringCount={ringCount}
                size={ringSize}
              />
              
              {/* Today portal - positioned at bottom center of the rings */}
              <TodayPortal
                totalTasks={totalTasks}
                completedTasks={completedTasks}
                selectedDate={selectedDate}
                size={ringSize}
                onExitAtlas={onExitAtlas}
              />
            </div>
          )}
        </div>
        
        {/* Desktop: Bottom task panel */}
        <div className="hidden md:block h-48 border-t border-border bg-card shrink-0">
          <AtlasTaskPanel
            selectedNode={selectedNode}
            tasks={selectedTasks}
            onClose={() => selectNode(null)}
            layout="horizontal"
          />
        </div>
      </div>
      
      {/* Mobile: Bottom drawer for tasks */}
      <div className="md:hidden shrink-0">
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <button
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 px-4',
                'bg-card border-t border-border',
                'text-sm font-medium text-foreground',
                'transition-colors hover:bg-secondary/50'
              )}
            >
              <ChevronUp className={cn(
                'h-4 w-4 transition-transform',
                drawerOpen && 'rotate-180'
              )} />
              {selectedNode ? (
                <span className="flex items-center gap-1">
                  <span>{selectedNode.emoji}</span>
                  {selectedNode.name}
                  <span className="text-muted-foreground ml-1">
                    ({selectedNode.completedCount}/{selectedNode.taskCount})
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Select a project to view tasks
                </span>
              )}
            </button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[70vh]">
            <div className="h-[50vh]">
              <AtlasTaskPanel
                selectedNode={selectedNode}
                tasks={selectedTasks}
                onClose={() => {
                  selectNode(null);
                  setDrawerOpen(false);
                }}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}
