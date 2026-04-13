'use client';

import { useMemo, useEffect, useRef } from 'react';
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
// 270 degrees = top center of the arc
const ARC_START_ANGLE = 200; // degrees (lower-left)
const ARC_END_ANGLE = 340; // degrees (lower-right)
const ARC_SPAN = ARC_END_ANGLE - ARC_START_ANGLE; // 140 degrees
const ARC_CENTER_ANGLE = 270; // Top center

// Max visible items per ring to avoid crowding
const MAX_VISIBLE_ITEMS = 7;
// Angle buffer from edges where items start fading
const FADE_BUFFER_ANGLE = 20;

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

// Label arc - draws in opposite direction so text appears right-side up
function describeLabelArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(x, y, radius, startAngle);
  const end = polarToCartesian(x, y, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  // Sweep flag 1 = clockwise, which makes text read left-to-right on bottom half
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 1, end.x, end.y,
  ].join(' ');
}

// Calculate opacity based on how close an angle is to the arc edges
function calculateEdgeFade(angle: number): number {
  const distFromStart = Math.abs(angle - ARC_START_ANGLE);
  const distFromEnd = Math.abs(angle - ARC_END_ANGLE);
  const minDist = Math.min(distFromStart, distFromEnd);
  
  if (minDist < FADE_BUFFER_ANGLE) {
    return minDist / FADE_BUFFER_ANGLE;
  }
  return 1;
}

export function AtlasRings({
  rings,
  selectedItemId,
  onSelectItem,
  onZoomIn,
  onZoomOut,
  size,
}: AtlasRingsProps) {
  const { getLineage } = useAtlasStore();
  
  // Center positioned below visible area for rainbow effect
  const centerX = size / 2;
  const centerY = size * 1.1;
  
  // Ring radii
  const maxRadius = size * 1.0;
  const minRadius = size * 0.35;
  const totalRings = rings.length;
  const ringSpacing = totalRings > 1 ? (maxRadius - minRadius) / totalRings : 0;
  
  const getRingRadius = (ringIndex: number, isFaded: boolean) => {
    if (isFaded && ringIndex === 0) return maxRadius + ringSpacing * 0.5;
    if (isFaded && ringIndex === rings.length - 1) return minRadius - ringSpacing * 0.3;
    return maxRadius - ringIndex * ringSpacing;
  };
  
  // Get lineage for selected item
  const selectedLineage = useMemo(() => {
    if (!selectedItemId) return new Set<string>();
    const lineage = getLineage(selectedItemId);
    return new Set(lineage.map(item => item.id));
  }, [selectedItemId, getLineage]);
  
  // Track the last processed selection
  const lastProcessedSelectionRef = useRef<string | null>(null);
  
  // Calculate ring rotations based on selection
  const ringRotations = useMemo(() => {
    const rotations: number[] = rings.map(() => 0);
    
    if (!selectedItemId) return rotations;
    
    rings.forEach((ring, ringIdx) => {
      // Check if this ring contains the selected item
      const selectedIndex = ring.items.findIndex(item => item.id === selectedItemId);
      if (selectedIndex >= 0) {
        // Calculate rotation to center this item
        const visibleCount = Math.min(ring.items.length, MAX_VISIBLE_ITEMS);
        const angleStep = ARC_SPAN / (visibleCount + 1);
        const itemAngle = ARC_START_ANGLE + angleStep * (selectedIndex + 1);
        rotations[ringIdx] = ARC_CENTER_ANGLE - itemAngle;
        return;
      }
      
      // Check if this ring has children of the selected item
      const childIndices = ring.items
        .map((item, idx) => item.parentId === selectedItemId ? idx : -1)
        .filter(idx => idx >= 0);
      
      if (childIndices.length > 0) {
        // Center the middle child
        const middleChildIdx = childIndices[Math.floor(childIndices.length / 2)];
        const visibleCount = Math.min(ring.items.length, MAX_VISIBLE_ITEMS);
        const angleStep = ARC_SPAN / (visibleCount + 1);
        const itemAngle = ARC_START_ANGLE + angleStep * (middleChildIdx + 1);
        rotations[ringIdx] = ARC_CENTER_ANGLE - itemAngle;
      }
    });
    
    return rotations;
  }, [selectedItemId, rings]);
  
  // Update store with rotations
  useEffect(() => {
    if (lastProcessedSelectionRef.current === selectedItemId) {
      return;
    }
    lastProcessedSelectionRef.current = selectedItemId;
    
    const store = useAtlasStore.getState();
    ringRotations.forEach((rotation, idx) => {
      store.setRingRotation(idx, rotation);
    });
  }, [selectedItemId, ringRotations]);
  
  // Calculate node positions with rotation applied
  const ringData = useMemo(() => {
    return rings.map((ring, ringIdx) => {
      const radius = getRingRadius(ringIdx, ring.isFaded);
      const rotation = ringRotations[ringIdx] || 0;
      
      // Limit visible items and space them evenly
      const visibleCount = Math.min(ring.items.length, MAX_VISIBLE_ITEMS);
      const angleStep = ARC_SPAN / (visibleCount + 1);
      
      // Get items to show - prioritize selected item and its siblings
      let itemsToShow = ring.items;
      if (ring.items.length > MAX_VISIBLE_ITEMS) {
        // If there's a selected item in this ring, center around it
        const selectedIdx = ring.items.findIndex(item => item.id === selectedItemId);
        const childOfSelectedIdx = ring.items.findIndex(item => item.parentId === selectedItemId);
        
        let centerIdx = selectedIdx >= 0 ? selectedIdx : childOfSelectedIdx >= 0 ? childOfSelectedIdx : Math.floor(ring.items.length / 2);
        
        const half = Math.floor(MAX_VISIBLE_ITEMS / 2);
        let startIdx = Math.max(0, centerIdx - half);
        let endIdx = startIdx + MAX_VISIBLE_ITEMS;
        
        if (endIdx > ring.items.length) {
          endIdx = ring.items.length;
          startIdx = Math.max(0, endIdx - MAX_VISIBLE_ITEMS);
        }
        
        itemsToShow = ring.items.slice(startIdx, endIdx);
      }
      
      const nodePositions = itemsToShow.map((item, itemIdx) => {
        // Calculate base angle (before rotation)
        const baseAngle = ARC_START_ANGLE + angleStep * (itemIdx + 1);
        // Apply rotation
        const finalAngle = baseAngle + rotation;
        
        // Calculate position using final angle
        const { x, y } = polarToCartesian(centerX, centerY, radius, finalAngle);
        
        // Calculate edge fade
        const edgeFade = calculateEdgeFade(finalAngle);
        
        // Is this item in the selection lineage?
        const isInLineage = selectedLineage.has(item.id) || 
          (selectedItemId && item.parentId === selectedItemId) ||
          selectedLineage.has(item.parentId || '');
        
        return { 
          item, 
          x, 
          y, 
          angle: finalAngle,
          edgeFade,
          isInLineage,
        };
      });
      
      return {
        ring,
        radius,
        rotation,
        path: describeArc(centerX, centerY, radius, ARC_START_ANGLE, ARC_END_ANGLE),
        nodePositions,
      };
    });
  }, [rings, ringRotations, centerX, centerY, selectedLineage, selectedItemId]);
  
  // Connection lines from selected item to children (using rotated positions)
  const connectionLines = useMemo(() => {
    if (!selectedItemId) return [];
    
    const lines: { fromX: number; fromY: number; toX: number; toY: number; color: string }[] = [];
    
    // Find the selected item position (already rotated)
    let selectedPos: { x: number; y: number; color: string } | null = null;
    for (const { nodePositions } of ringData) {
      const found = nodePositions.find(np => np.item.id === selectedItemId);
      if (found) {
        selectedPos = { x: found.x, y: found.y, color: found.item.color };
        break;
      }
    }
    
    if (!selectedPos) return [];
    
    // Find children on subsequent rings
    for (const { nodePositions } of ringData) {
      for (const np of nodePositions) {
        if (np.item.parentId === selectedItemId && np.edgeFade > 0.3) {
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
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="100%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <filter id="connectionGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
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
      
      {/* Ring arcs (static, don't rotate) */}
      {ringData.map(({ ring, radius, path }, ringIdx) => (
        <g key={`ring-${ringIdx}`}>
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
          
          {/* Ring highlight */}
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
          
          {/* Ring label - curved text below the arc, left side */}
          {ring.label && (
            <>
              <defs>
                {/* Path runs BELOW the ring (smaller radius), reversed direction so text reads right-side up */}
                {/* Start from lower angle and go to higher angle for correct text direction */}
                <path
                  id={`labelPath-${ringIdx}`}
                  d={describeLabelArc(centerX, centerY, radius - 16, ARC_START_ANGLE - 8, ARC_START_ANGLE + 30)}
                />
              </defs>
              <text
                fill="var(--muted-foreground)"
                fontSize="9"
                fontWeight="300"
                fontFamily="system-ui, sans-serif"
                letterSpacing="0.15em"
                opacity={ring.isFaded ? 0.2 : 0.5}
              >
                <textPath href={`#labelPath-${ringIdx}`} startOffset="0%">
                  {ring.label.toUpperCase()}
                </textPath>
              </text>
            </>
          )}
        </g>
      ))}
      
      {/* Connection lines */}
      {connectionLines.map((line, idx) => (
        <g key={`connection-${idx}`}>
          <line
            x1={line.fromX}
            y1={line.fromY}
            x2={line.toX}
            y2={line.toY}
            stroke={line.color}
            strokeWidth={6}
            strokeDasharray="8 6"
            opacity={0.2}
            style={{ filter: 'blur(6px)' }}
          />
          <line
            x1={line.fromX}
            y1={line.fromY}
            x2={line.toX}
            y2={line.toY}
            stroke={line.color}
            strokeWidth={2}
            strokeDasharray="8 6"
            opacity={0.7}
          />
        </g>
      ))}
      
      {/* Nodes - rendered with rotated positions */}
      {ringData.map(({ ring, nodePositions }, ringIdx) => (
        <g key={`nodes-${ringIdx}`}>
          {nodePositions.map(({ item, x, y, edgeFade, isInLineage }) => {
            const isSelected = selectedItemId === item.id;
            const shouldFade = selectedItemId && !isInLineage && !isSelected;
            const finalOpacity = edgeFade * (shouldFade ? 0.25 : 1) * (ring.isFaded ? 0.4 : 1);
            
            // Don't render if too faded
            if (finalOpacity < 0.1) return null;
            
            return (
              <g
                key={item.id}
                style={{
                  opacity: finalOpacity,
                  transition: 'opacity 0.3s ease-out',
                }}
              >
                <AtlasNodeComponent
                  node={item}
                  x={x}
                  y={y}
                  isSelected={isSelected}
                  hasChildren={item.children.length > 0}
                  isFaded={ring.isFaded || finalOpacity < 0.5}
                  onClick={() => {
                    if (ring.isFaded && ring.index === 0) {
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
