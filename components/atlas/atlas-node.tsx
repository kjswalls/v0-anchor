'use client';

import { cn } from '@/lib/utils';
import type { AtlasItem } from '@/lib/atlas-store';

interface AtlasNodeProps {
  node: AtlasItem;
  x: number;
  y: number;
  isSelected: boolean;
  hasChildren: boolean;
  isFaded?: boolean; // For zoom hint rings
  onClick: () => void;
  onDoubleClick: () => void;
}

export function AtlasNodeComponent({
  node,
  x,
  y,
  isSelected,
  hasChildren,
  isFaded = false,
  onClick,
  onDoubleClick,
}: AtlasNodeProps) {
  const nodeSize = isFaded ? 40 : 56;
  const glowIntensity = node.activityLevel;
  const progressPercent = node.taskCount > 0 
    ? (node.completedCount / node.taskCount) * 100 
    : 0;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      className="cursor-pointer atlas-node-hover atlas-node-transform"
      role="button"
      aria-label={`${node.name}: ${node.completedCount} of ${node.taskCount} tasks completed`}
      style={{ opacity: isFaded ? 0.4 : 1 }}
    >
      {/* Glow effect based on activity level */}
      {!isFaded && (
        <circle
          cx={0}
          cy={0}
          r={nodeSize / 2 + 8}
          fill={node.color}
          opacity={glowIntensity * 0.4}
          className="atlas-node-glow"
          style={{
            filter: `blur(${4 + glowIntensity * 8}px)`,
          }}
        />
      )}
      
      {/* Progress ring background */}
      <circle
        cx={0}
        cy={0}
        r={nodeSize / 2 + 2}
        fill="none"
        stroke="var(--border)"
        strokeWidth={isFaded ? 2 : 3}
        opacity={0.5}
      />
      
      {/* Progress ring */}
      {!isFaded && (
        <circle
          cx={0}
          cy={0}
          r={nodeSize / 2 + 2}
          fill="none"
          stroke={node.color}
          strokeWidth={3}
          strokeDasharray={`${(progressPercent / 100) * Math.PI * (nodeSize + 4)} ${Math.PI * (nodeSize + 4)}`}
          strokeLinecap="round"
          transform="rotate(-90)"
          className="transition-all duration-300"
        />
      )}
      
      {/* Node background */}
      <circle
        cx={0}
        cy={0}
        r={nodeSize / 2}
        className={cn(
          'transition-all duration-200',
          isSelected 
            ? 'fill-primary stroke-primary-foreground' 
            : 'fill-card stroke-border'
        )}
        strokeWidth={isSelected ? 2 : 1}
      />
      
      {/* Selection ring */}
      {isSelected && !isFaded && (
        <circle
          cx={0}
          cy={0}
          r={nodeSize / 2 + 6}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeDasharray="4 4"
          className="animate-spin"
          style={{ animationDuration: '8s' }}
        />
      )}
      
      {/* Emoji */}
      <text
        x={0}
        y={2}
        textAnchor="middle"
        dominantBaseline="middle"
        className="select-none pointer-events-none"
        style={{ fontSize: isFaded ? '16px' : '24px' }}
      >
        {node.emoji}
      </text>
      
      {/* Drill-down indicator */}
      {hasChildren && !isFaded && (
        <circle
          cx={nodeSize / 2 - 4}
          cy={-nodeSize / 2 + 4}
          r={6}
          className="fill-primary"
        >
          <title>Contains children</title>
        </circle>
      )}
      
      {/* Label below node */}
      <text
        x={0}
        y={nodeSize / 2 + 14}
        textAnchor="middle"
        className={cn(
          'text-xs font-medium select-none pointer-events-none',
          isSelected ? 'fill-foreground' : 'fill-muted-foreground'
        )}
        style={{ fontSize: isFaded ? '9px' : '11px' }}
      >
        {node.name.length > 12 ? node.name.slice(0, 10) + '...' : node.name}
      </text>
      
      {/* Task count badge */}
      {!isFaded && (
        <text
          x={0}
          y={nodeSize / 2 + 26}
          textAnchor="middle"
          className="fill-muted-foreground select-none pointer-events-none"
          style={{ fontSize: '9px' }}
        >
          {node.completedCount}/{node.taskCount}
        </text>
      )}
    </g>
  );
}
