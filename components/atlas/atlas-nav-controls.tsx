'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AtlasNavControlsProps {
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  upLabel: string | null;
  downLabel: string | null;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
}

export function AtlasNavControls({
  canNavigateUp,
  canNavigateDown,
  upLabel,
  downLabel,
  onNavigateUp,
  onNavigateDown,
}: AtlasNavControlsProps) {
  if (!canNavigateUp && !canNavigateDown) return null;
  
  return (
    <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10">
      {/* Navigate Up Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigateUp();
        }}
        disabled={!canNavigateUp}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'text-xs font-medium transition-all duration-200',
          'border border-border/50 backdrop-blur-sm',
          canNavigateUp
            ? 'bg-card/80 text-foreground hover:bg-card hover:border-border cursor-pointer'
            : 'bg-card/30 text-muted-foreground/50 cursor-not-allowed'
        )}
      >
        <ChevronUp className="h-4 w-4" />
        {upLabel && canNavigateUp && (
          <span className="text-muted-foreground">{upLabel}</span>
        )}
        {!canNavigateUp && (
          <span className="text-muted-foreground/50">Top level</span>
        )}
      </button>
      
      {/* Navigate Down Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigateDown();
        }}
        disabled={!canNavigateDown}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'text-xs font-medium transition-all duration-200',
          'border border-border/50 backdrop-blur-sm',
          canNavigateDown
            ? 'bg-card/80 text-foreground hover:bg-card hover:border-border cursor-pointer'
            : 'bg-card/30 text-muted-foreground/50 cursor-not-allowed'
        )}
      >
        <ChevronDown className="h-4 w-4" />
        {downLabel && canNavigateDown && (
          <span className="text-muted-foreground">{downLabel}</span>
        )}
        {!canNavigateDown && (
          <span className="text-muted-foreground/50">Select item</span>
        )}
      </button>
    </div>
  );
}
