'use client';

import { useMemo, useEffect } from 'react';
import { AtlasNodeComponent } from './atlas-node';
import { AtlasAnimations } from './atlas-animations';
import type { AtlasItem, RingConfig } from '@/lib/atlas-store';
import { useAtlasStore } from '@/lib/atlas-store';

interface AtlasRingsProps {
  rings: RingConfig[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string | null) => void;
  onZoomIn: (itemId: string) => void;
  onZoomOut: () => void;
  size: number;
}

// Arc configuration - rainbow orientation
const ARC_START_ANGLE = 200; // degrees (lower-left)
const ARC_END_ANGLE = 340; // degrees (lower-right)
const ARC_SPAN = ARC_END_ANGLE - ARC_START_ANGLE;
const ARC_CENTER_ANGLE = (ARC_START_ANGLE + ARC_END_ANGLE) / 2; // 270 = top

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
  ].join(' ');
}

// Calculate angle to rotate ring so a specific item index is at center
function calculateRotationToCenter(
  itemIndex: number,
  totalItems: number
): number {
  if (totalItems <= 1) return 0;
  const angleStep = ARC_SPAN / (totalItems + 1);
  const itemAngle = ARC_START_ANGLE + angleStep * (itemIndex + 1);
  return ARC_CENTER_ANGLE - itemAngle;
}

export function AtlasRings({
  rings,
  selectedItemId,
  onSelectItem,
  onZoomIn,
  onZoomOut,
  size,
}: AtlasRingsProps) {
  const { setRingRotation, getLineage } = useAtlasStore();
  
  // Center positioned below visible area for rainbow effect
  const centerX = size / 2;
  const centerY = size * 1.1;
  
  // Ring radii - distribute from largest (top) to smallest (bottom)
  const maxRadius = size * 1.0;
  const minRadius = size * 0.35;
  const visibleRingCount = rings.filter(r => !r.isFaded).length;
  const totalRings = rings.length;
  const ringSpacing = totalRings > 1 ? (maxRadius - minRadius) / (totalRings) : 0;
  
  // Calculate radius for each ring
  const getRingRadius = (ringIndex: number, isFaded: boolean) => {
    // Faded rings (zoom out/in hints) are at the extremes
    if (isFaded && ringIndex === 0) return maxRadius + ringSpacing * 0.5; // Parent ring above
    if (isFaded && ringIndex === rings.length - 1) return minRadius - ringSpacing * 0.3; // Child hint below
    return maxRadius - ringIndex * ringSpacing;
  };
  
  // Get lineage for selected item to determine which items to highlight
  const selectedLineage = useMemo(() => {
    if (!selectedItemId) return new Set<string>();
    const lineage = getLineage(selectedItemId);
    return new Set(lineage.map(item => item.id));
  }, [selectedItemId, getLineage]);
  
  // Calculate node positions for each ring
  const ringData = useMemo(() => {
    return rings.map((ring, ringIdx) => {
      const radius = getRingRadius(ringIdx, ring.isFaded);
      const rotation = ring.rotationAngle || 0;
      
      const nodePositions = ring.items.map((item, itemIdx) => {
        const totalItems = ring.items.length;
        const angleStep = ARC_SPAN / Math.max(totalItems + 1, 2);
        const baseAngle = ARC_START_ANGLE + angleStep * (itemIdx + 1);
        const angle = baseAngle + rotation;
        
        const { x, y } = polarToCartesian(centerX, centerY, radius, angle);
        
        // Determine if this item is in the selected lineage
        const isInLineage = selectedLineage.has(item.id) || 
          (selectedItemId && item.parentId === selectedItemId) ||
          selectedLineage.has(item.parentId || '');
        
        return { item, x, y, angle, isInLineage };
      });
      
      return {
        ring,
        radius,
        path: describeArc(centerX, centerY, radius, ARC_START_ANGLE, ARC_END_ANGLE),
        nodePositions,
      };
    });
  }, [rings, centerX, centerY, selectedLineage, selectedItemId]);
  
  // Update ring rotations when an item is selected
  useEffect(() => {
    if (!selectedItemId) {
      // Reset all rotations
      rings.forEach((_, idx) => setRingRotation(idx, 0));
      return;
    }
    
    // Find which ring contains the selected item and rotate it
    rings.forEach((ring, ringIdx) => {
      const itemIndex = ring.items.findIndex(item => item.id === selectedItemId);
      if (itemIndex >= 0) {
        const rotation = calculateRotationToCenter(itemIndex, ring.items.length);
        setRingRotation(ringIdx, rotation);
      }
      
      // Also rotate child rings to center children of selected item
      const childrenOfSelected = ring.items.filter(item => item.parentId === selectedItemId);
      if (childrenOfSelected.length > 0) {
        // Center the middle child
        const firstChildIdx = ring.items.findIndex(item => item.parentId === selectedItemId);
        if (firstChildIdx >= 0) {
          const midChildIdx = firstChildIdx + Math.floor(childrenOfSelected.length / 2);
          const rotation = calculateRotationToCenter(midChildIdx, ring.items.length);
          setRingRotation(ringIdx, rotation);
        }
      }
    });
  }, [selectedItemId, rings, setRingRotation]);
  
  // Find connection lines from selected item to its children across rings
  const connectionLines = useMemo(() => {
    if (!selectedItemId) return [];
    
    const lines: { fromX: number; fromY: number; toX: number; toY: number; color: string }[] = [];
    
    // Find the selected item position
    let selectedPos: { x: number; y: number; color: string } | null = null;
    for (const { nodePositions } of ringData) {
      const found = nodePositions.find(np => np.item.id === selectedItemId);
      if (found) {
        selectedPos = { x: found.x, y: found.y, color: found.item.color };
        break;
      }
    }
    
    if (!selectedPos) return [];
    
    // Find all children of selected item in subsequent rings
    for (const { nodePositions } of ringData) {
      for (const np of nodePositions) {
        if (np.item.parentId === selectedItemId) {
          lines.push({
            fromX: selectedPos.x,
            fromY: selectedPos.y,
            toX: np.x,
            toY: np.y,
            color: selectedPos.color,
          });
        }
      }
    }
    
    return lines;
  }, [selectedItemId, ringData]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="overflow-visible"
    >
      {/* Definitions for gradients and filters */}
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="100%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      {/* Center glow */}
      <ellipse
        cx={centerX}
        cy={size}
        rx={size * 0.4}
        ry={size * 0.2}
        fill="url(#centerGlow)"
      />
      
      {/* Ambient animations */}
      <AtlasAnimations
        size={size}
        centerX={centerX}
        centerY={centerY}
        ringRadii={ringData.map(r => r.radius)}
      />
      
      {/* Ring arcs with labels */}
      {ringData.map(({ ring, radius, path }, ringIdx) => (
        <g 
          key={`ring-${ringIdx}`}
          style={{
            transition: 'transform 0.5s ease-out',
            transformOrigin: `${centerX}px ${centerY}px`,
            transform: `rotate(${ring.rotationAngle || 0}deg)`,
          }}
        >
          {/* Ring arc */}
          <path
            d={path}
            fill="none"
            stroke="var(--border)"
            strokeWidth={ring.isFaded ? 1.5 : 3}
            strokeLinecap="round"
            opacity={ring.isFaded ? 0.25 : 0.6}
            className={!ring.isFaded ? 'atlas-ring-pulse' : undefined}
            style={{ animationDelay: `${ringIdx * 0.5}s` }}
          />
          
          {/* Active ring highlight */}
          {!ring.isFaded && (
            <path
              d={path}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.15}
            />
          )}
          
          {/* Ring label - curved along the left side of the arc */}
          {ring.label && !ring.isFaded && (
            <g style={{ transform: `rotate(${-(ring.rotationAngle || 0)}deg)`, transformOrigin: `${centerX}px ${centerY}px` }}>
              <defs>
                <path
                  id={`labelPath-${ringIdx}`}
                  d={describeArc(centerX, centerY, radius + 12, ARC_START_ANGLE, ARC_START_ANGLE + 30)}
                />
              </defs>
              <text
                fill="var(--muted-foreground)"
                fontSize="10"
                fontWeight="300"
                letterSpacing="0.1em"
                opacity={0.6}
              >
                <textPath href={`#labelPath-${ringIdx}`} startOffset="5%">
                  {ring.label}
                </textPath>
              </text>
            </g>
          )}
        </g>
      ))}
      
      {/* Connection lines from selected item to children */}
      {connectionLines.map((line, idx) => (
        <g key={`connection-${idx}`}>
          {/* Glow effect */}
          <line
            x1={line.fromX}
            y1={line.fromY}
            x2={line.toX}
            y2={line.toY}
            stroke={line.color}
            strokeWidth={4}
            strokeDasharray="6 4"
            opacity={0.3}
            style={{ filter: 'blur(4px)' }}
          />
          {/* Main line */}
          <line
            x1={line.fromX}
            y1={line.fromY}
            x2={line.toX}
            y2={line.toY}
            stroke={line.color}
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.6}
          />
        </g>
      ))}
      
      {/* Nodes - render in separate pass so they're on top */}
      {ringData.map(({ ring, nodePositions }, ringIdx) => (
        <g 
          key={`nodes-${ringIdx}`}
          style={{
            transition: 'transform 0.5s ease-out',
            transformOrigin: `${centerX}px ${centerY}px`,
            transform: `rotate(${ring.rotationAngle || 0}deg)`,
          }}
        >
          {nodePositions.map(({ item, x, y, isInLineage }) => {
            const isSelected = selectedItemId === item.id;
            const shouldFade = selectedItemId && !isInLineage && !isSelected;
            
            return (
              <g
                key={item.id}
                style={{
                  // Counter-rotate node content so labels stay upright
                  transform: `rotate(${-(ring.rotationAngle || 0)}deg)`,
                  transformOrigin: `${x}px ${y}px`,
                  transition: 'opacity 0.3s ease-out',
                  opacity: shouldFade ? 0.3 : 1,
                }}
              >
                <AtlasNodeComponent
                  node={item}
                  x={x}
                  y={y}
                  isSelected={isSelected}
                  hasChildren={item.children.length > 0}
                  isFaded={ring.isFaded}
                  onClick={() => {
                    if (ring.isFaded && ring.index === 0) {
                      // Clicking parent ring zooms out
                      onZoomOut();
                    } else {
                      onSelectItem(isSelected ? null : item.id);
                    }
                  }}
                  onDoubleClick={() => {
                    if (item.children.length > 0) {
                      onZoomIn(item.id);
                    }
                  }}
                />
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
