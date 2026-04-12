'use client';

import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TodayPortalProps {
  totalTasks: number;
  completedTasks: number;
  selectedDate: Date;
  size: number;
  onExitAtlas: () => void;
}

export function TodayPortal({
  totalTasks,
  completedTasks,
  selectedDate,
  size,
  onExitAtlas,
}: TodayPortalProps) {
  // Smaller portal size since projects are the focus
  const portalSize = Math.min(size * 0.12, 80);
  const progressPercent = totalTasks > 0 
    ? (completedTasks / totalTasks) * 100 
    : 0;
  const circumference = 2 * Math.PI * (portalSize / 2 - 4);
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div
      className="absolute flex flex-col items-center justify-center cursor-pointer group"
      style={{
        width: portalSize,
        height: portalSize,
        left: '50%',
        bottom: `${size * 0.15 - portalSize / 2}px`, // Position at bottom center where arcs emanate
        transform: 'translateX(-50%)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onExitAtlas();
      }}
      role="button"
      aria-label={`Today: ${completedTasks} of ${totalTasks} tasks completed. Click to exit Atlas view.`}
    >
      {/* Outer glow ring */}
      <div
        className="absolute inset-0 rounded-full bg-primary/15 blur-lg group-hover:bg-primary/25 transition-colors"
        style={{ transform: 'scale(1.3)' }}
      />
      
      {/* Progress ring */}
      <svg
        width={portalSize}
        height={portalSize}
        className="absolute inset-0 -rotate-90"
      >
        {/* Background ring */}
        <circle
          cx={portalSize / 2}
          cy={portalSize / 2}
          r={portalSize / 2 - 4}
          fill="none"
          stroke="var(--border)"
          strokeWidth={2}
        />
        {/* Progress arc */}
        <circle
          cx={portalSize / 2}
          cy={portalSize / 2}
          r={portalSize / 2 - 4}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      
      {/* Inner content */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-full',
          'bg-card border border-border shadow-md',
          'group-hover:border-primary/50 group-hover:shadow-primary/20 group-hover:shadow-lg',
          'transition-all duration-200'
        )}
        style={{
          width: portalSize - 8,
          height: portalSize - 8,
        }}
      >
        <span className="text-xs font-semibold text-foreground">
          {format(selectedDate, 'MMM d')}
        </span>
        <span className="text-[10px] font-medium text-primary">
          {completedTasks}/{totalTasks}
        </span>
      </div>
      
      {/* Tooltip on hover */}
      <div className="absolute -bottom-7 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        <span className="text-[10px] text-muted-foreground bg-card px-2 py-1 rounded border border-border shadow-sm">
          Click to exit
        </span>
      </div>
    </div>
  );
}
