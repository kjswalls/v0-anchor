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
  const portalSize = size * 0.22;
  const progressPercent = totalTasks > 0 
    ? (completedTasks / totalTasks) * 100 
    : 0;
  const circumference = 2 * Math.PI * (portalSize / 2 - 8);
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div
      className="absolute flex flex-col items-center justify-center cursor-pointer group"
      style={{
        width: portalSize,
        height: portalSize,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
      onClick={onExitAtlas}
      role="button"
      aria-label={`Today: ${completedTasks} of ${totalTasks} tasks completed. Click to exit Atlas view.`}
    >
      {/* Outer glow ring */}
      <div
        className="absolute inset-0 rounded-full bg-primary/20 blur-xl group-hover:bg-primary/30 transition-colors"
        style={{ transform: 'scale(1.2)' }}
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
          r={portalSize / 2 - 8}
          fill="none"
          stroke="var(--border)"
          strokeWidth={4}
        />
        {/* Progress arc */}
        <circle
          cx={portalSize / 2}
          cy={portalSize / 2}
          r={portalSize / 2 - 8}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={4}
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
          'bg-card border border-border shadow-lg',
          'group-hover:border-primary/50 group-hover:shadow-primary/20 group-hover:shadow-xl',
          'transition-all duration-200'
        )}
        style={{
          width: portalSize - 16,
          height: portalSize - 16,
        }}
      >
        <span className="text-2xl mb-1">
          {progressPercent === 100 ? '✨' : '📍'}
        </span>
        <span className="text-xs font-semibold text-foreground">
          Today
        </span>
        <span className="text-[10px] text-muted-foreground">
          {format(selectedDate, 'MMM d')}
        </span>
        <span className="text-xs font-medium text-primary mt-1">
          {completedTasks}/{totalTasks}
        </span>
      </div>
      
      {/* Tooltip on hover */}
      <div className="absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        <span className="text-[10px] text-muted-foreground bg-card px-2 py-1 rounded border border-border shadow-sm">
          Click to return to Day view
        </span>
      </div>
    </div>
  );
}
