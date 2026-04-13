'use client';

import { useEffect, useMemo, useCallback, useState } from 'react';
import { useAtlasStore } from '@/lib/atlas-store';
import { generateMockAtlasItems, getMockTasksForItem } from '@/lib/atlas-mock-data';
import { AtlasRings } from './atlas-rings';
import { TodayPortal } from './today-portal';
import { AtlasBreadcrumbs } from './atlas-breadcrumbs';
import { AtlasTaskPanel } from './atlas-task-panel';
import { AtlasNavControls } from './atlas-nav-controls';
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
    focusPath,
    selectedItemId,
    setRootItems,
    selectItem,
    zoomOut,
    zoomToRoot,
    navigateUp,
    navigateDown,
    getVisibleRings,
    getBreadcrumbs,
    getSelectedItem,
    canNavigateUp,
    canNavigateDown,
    getNavigationLabels,
  } = useAtlasStore();
  
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Initialize data from mock (in production, derive from planner store)
  useEffect(() => {
    const mockItems = generateMockAtlasItems();
    setRootItems(mockItems);
  }, [setRootItems]);
  
  // Measure container size
  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isMobile = width < 768;
      const availableWidth = width;
      const availableHeight = isMobile 
        ? height - 56 - 48 - 60
        : height - 56 - 48 - 200;
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
        if (selectedItemId) {
          selectItem(null);
        } else if (focusPath.length > 0) {
          zoomOut();
        } else {
          onExitAtlas();
        }
      }
      if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey) {
        if (document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault();
        if (focusPath.length > 0) {
          zoomOut();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemId, focusPath, selectItem, zoomOut, onExitAtlas]);
  
  const visibleRings = getVisibleRings();
  const breadcrumbs = getBreadcrumbs();
  const selectedItem = getSelectedItem();
  const canGoUp = canNavigateUp();
  const canGoDown = canNavigateDown();
  const navLabels = getNavigationLabels();
  
  // Calculate total progress for today portal
  const todayTasks = useMemo(() => {
    return tasks.filter(t => t.startDate === selectedDate.toISOString().split('T')[0]);
  }, [tasks, selectedDate]);
  
  // Get all items from first visible ring for total count
  const mainRingItems = visibleRings.find(r => !r.isFaded)?.items || [];
  const totalTasks = todayTasks.length || mainRingItems.reduce((sum, n) => sum + n.taskCount, 0);
  const completedTasks = todayTasks.filter(t => t.status === 'completed').length || 
    mainRingItems.reduce((sum, n) => sum + n.completedCount, 0);
  
  // Get tasks for selected item
  const selectedTasks = useMemo(() => {
    return getMockTasksForItem(selectedItem);
  }, [selectedItem]);
  
  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback((index: number) => {
    if (index === 0) {
      zoomToRoot();
    } else {
      // Navigate to specific level
      const targetPath = breadcrumbs.slice(1, index + 1).map(b => b.id);
      useAtlasStore.setState({ focusPath: targetPath, selectedItemId: null });
    }
  }, [breadcrumbs, zoomToRoot]);
  
  // Ring size
  const ringSize = Math.min(
    containerSize.width * 0.95, 
    containerSize.height * 0.95, 
    900
  );
  
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Breadcrumbs - shows lineage path */}
      <AtlasBreadcrumbs
        breadcrumbs={breadcrumbs}
        onNavigate={handleBreadcrumbNavigate}
        onBack={zoomOut}
        canGoBack={focusPath.length > 0}
      />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Atlas visualization */}
        <div
          className="flex-1 flex items-start justify-center pt-4 relative overflow-hidden"
          onClick={() => selectItem(null)}
        >
          {ringSize > 0 && (
            <div className="relative" style={{ width: ringSize, height: ringSize }}>
              <AtlasRings
                rings={visibleRings}
                selectedItemId={selectedItemId}
                onSelectItem={selectItem}
                onZoomOut={navigateUp}
                onZoomIn={navigateDown}
                size={ringSize}
                canNavigateUp={canGoUp}
                canNavigateDown={canGoDown}
                upLabel={navLabels.upLabel}
                downLabel={navLabels.downLabel}
              />
              
              {/* Today portal at bottom center */}
              <TodayPortal
                totalTasks={totalTasks}
                completedTasks={completedTasks}
                selectedDate={selectedDate}
                size={ringSize}
                onExitAtlas={onExitAtlas}
              />
              
              {/* Navigation controls */}
              <AtlasNavControls
                canNavigateUp={canGoUp}
                canNavigateDown={canGoDown}
                upLabel={navLabels.upLabel}
                downLabel={navLabels.downLabel}
                onNavigateUp={navigateUp}
                onNavigateDown={navigateDown}
              />
            </div>
          )}
        </div>
        
        {/* Desktop: Bottom task panel */}
        <div className="hidden md:block h-48 border-t border-border bg-card shrink-0">
          <AtlasTaskPanel
            selectedNode={selectedItem}
            tasks={selectedTasks}
            onClose={() => selectItem(null)}
            layout="horizontal"
          />
        </div>
      </div>
      
      {/* Mobile: Bottom drawer */}
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
              {selectedItem ? (
                <span className="flex items-center gap-1">
                  <span>{selectedItem.emoji}</span>
                  {selectedItem.name}
                  <span className="text-muted-foreground ml-1">
                    ({selectedItem.completedCount}/{selectedItem.taskCount})
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Select an item to view details
                </span>
              )}
            </button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[70vh]">
            <div className="h-[50vh]">
              <AtlasTaskPanel
                selectedNode={selectedItem}
                tasks={selectedTasks}
                onClose={() => {
                  selectItem(null);
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
