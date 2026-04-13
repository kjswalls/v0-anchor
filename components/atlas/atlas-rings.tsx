'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import { AtlasNodeComponent } from './atlas-node';
import { AtlasAnimations } from './atlas-animations';
import type { AtlasItem, RingConfig, RingItem } from '@/lib/atlas-store';
import { useAtlasStore, isPlaceholder } from '@/lib/atlas-store';

interface AtlasRingsProps {
  rings: RingConfig[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string | null) => void;
  onZoomIn: (itemId: string) => void;
  onZoomOut: () => void;
  size: number;
}

// Arc configuration - rainbow orientation
const ARC_START_ANGLE = 200;
const ARC_END_ANGLE = 340;
const ARC_SPAN = ARC_END_ANGLE - ARC_START_ANGLE;
const ARC_CENTER_ANGLE = 270;

// Max visible items per ring
const MAX_VISIBLE_ITEMS = 7;
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
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 1, end.x, end.y,
  ].join(' ');
}

function calculateEdgeFadeForAngle(baseAngle: number, rotation: number): number {
  const rotatedAngle = baseAngle + rotation;
  const distFromStart = rotatedAngle - ARC_START_ANGLE;
  const distFromEnd = ARC_END_ANGLE - rotatedAngle;
  const minDist = Math.min(distFromStart, distFromEnd);
  
  if (minDist < 0) return 0;
  if (minDist < FADE_BUFFER_ANGLE) {
    return minDist / FADE_BUFFER_ANGLE;
  }
  return 1;
}

// Placeholder circle component
function PlaceholderNode({ x, y, size = 16 }: { x: number; y: number; size?: number }) {
  return (
    <g>
      {/* Outer glow for visibility */}
      <circle
        cx={x}
        cy={y}
        r={size + 4}
        fill="var(--muted-foreground)"
        opacity={0.08}
      />
      {/* Main placeholder circle */}
      <circle
        cx={x}
        cy={y}
        r={size}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1.5}
        strokeDasharray="4 4"
        opacity={0.35}
      />
    </g>
  );
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
  
  const centerX = size / 2;
  const centerY = size * 1.1;
  
  const maxRadius = size * 1.0;
  const minRadius = size * 0.35;
  const totalRings = rings.length;
  const ringSpacing = totalRings > 1 ? (maxRadius - minRadius) / totalRings : 0;
  
  const getRingRadius = (ringIndex: number, isFaded: boolean) => {
    if (isFaded && ringIndex === 0) return maxRadius + ringSpacing * 0.5;
    if (isFaded && ringIndex === rings.length - 1) return minRadius - ringSpacing * 0.3;
    return maxRadius - ringIndex * ringSpacing;
  };
  
  const selectedLineage = useMemo(() => {
    if (!selectedItemId) return new Set<string>();
    const lineage = getLineage(selectedItemId);
    return new Set(lineage.map(item => item.id));
  }, [selectedItemId, getLineage]);
  
  const lastProcessedSelectionRef = useRef<string | null>(null);
  
  // Track previous population state to trigger rotation animation
  const prevPopulatedRef = useRef<boolean[]>([]);
  
  // Track which rings just got populated (for bloom animation)
  const [bloomingRings, setBloomingRings] = useState<Set<number>>(new Set());
  
  // Track which rings are shrinking (items leaving)
  const [shrinkingRings, setShrinkingRings] = useState<Set<number>>(new Set());
  
  // Store previous items for rings that are shrinking so we can animate them out
  const prevItemsRef = useRef<Map<number, RingItem[]>>(new Map());
  
  // Calculate ring rotations based on selection
  const ringRotations = useMemo(() => {
    const rotations: number[] = rings.map(() => 0);
    
    rings.forEach((ring, ringIdx) => {
      const visibleCount = Math.min(ring.items.length, MAX_VISIBLE_ITEMS);
      if (visibleCount === 0) return;
      
      const angleStep = ARC_SPAN / (visibleCount + 1);
      
      // When a ring just got populated, add a small rotation animation for style
      const wasPopulated = prevPopulatedRef.current[ringIdx];
      const nowPopulated = ring.isPopulated;
      
      if (!wasPopulated && nowPopulated) {
        // Newly populated - start with a slight offset and animate to center
        rotations[ringIdx] = 15; // Will animate from this to 0 or centered position
      }
      
      if (!selectedItemId) return;
      
      // Check if this ring contains the selected item
      for (let i = 0; i < ring.items.length && i < visibleCount; i++) {
        const item = ring.items[i];
        if (!isPlaceholder(item) && item.id === selectedItemId) {
          const baseAngle = ARC_START_ANGLE + angleStep * (i + 1);
          rotations[ringIdx] = ARC_CENTER_ANGLE - baseAngle;
          return;
        }
      }
      
      // Check if this ring has children of the selected item
      if (ring.isPopulated) {
        const childIndices: number[] = [];
        for (let i = 0; i < ring.items.length && i < visibleCount; i++) {
          const item = ring.items[i];
          if (!isPlaceholder(item) && item.parentId === selectedItemId) {
            childIndices.push(i);
          }
        }
        
        if (childIndices.length > 0) {
          const middleIdx = childIndices[Math.floor(childIndices.length / 2)];
          const baseAngle = ARC_START_ANGLE + angleStep * (middleIdx + 1);
          rotations[ringIdx] = ARC_CENTER_ANGLE - baseAngle;
        }
      }
    });
    
    return rotations;
  }, [selectedItemId, rings]);
  
  // Update population tracking after render and trigger bloom/shrink animations
  useEffect(() => {
    const newBloomingRings = new Set<number>();
    const newShrinkingRings = new Set<number>();
    
    rings.forEach((ring, idx) => {
      const wasPopulated = prevPopulatedRef.current[idx];
      const nowPopulated = ring.isPopulated;
      
      // If this ring just got populated, mark it for blooming
      if (!wasPopulated && nowPopulated) {
        newBloomingRings.add(idx);
      }
      
      // If this ring just got depopulated, mark it for shrinking
      // and store the previous items so we can animate them out
      if (wasPopulated && !nowPopulated) {
        newShrinkingRings.add(idx);
        // Store previous items from the prevItemsRef if we have them
        // We need to capture items before they change
      }
    });
    
    // Store current populated items for future shrink animations
    rings.forEach((ring, idx) => {
      if (ring.isPopulated && ring.items.some(i => !isPlaceholder(i))) {
        prevItemsRef.current.set(idx, [...ring.items]);
      }
    });
    
    if (newBloomingRings.size > 0) {
      setBloomingRings(newBloomingRings);
      const timer = setTimeout(() => {
        setBloomingRings(new Set());
      }, 500);
      return () => clearTimeout(timer);
    }
    
    if (newShrinkingRings.size > 0) {
      setShrinkingRings(newShrinkingRings);
      const timer = setTimeout(() => {
        setShrinkingRings(new Set());
        // Clear stored items after animation
        newShrinkingRings.forEach(idx => prevItemsRef.current.delete(idx));
      }, 400);
      return () => clearTimeout(timer);
    }
    
    prevPopulatedRef.current = rings.map(r => r.isPopulated);
  }, [rings]);
  
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
  
  // Calculate ring data
  const ringData = useMemo(() => {
    return rings.map((ring, ringIdx) => {
      const radius = getRingRadius(ringIdx, ring.isFaded);
      const rotation = ringRotations[ringIdx] || 0;
      
      const visibleCount = Math.min(ring.items.length, MAX_VISIBLE_ITEMS);
      const angleStep = visibleCount > 0 ? ARC_SPAN / (visibleCount + 1) : 0;
      
      const nodePositions = ring.items.slice(0, visibleCount).map((item, itemIdx) => {
        const baseAngle = ARC_START_ANGLE + angleStep * (itemIdx + 1);
        const { x, y } = polarToCartesian(centerX, centerY, radius, baseAngle);
        const edgeFade = calculateEdgeFadeForAngle(baseAngle, rotation);
        
        const isInLineage = !isPlaceholder(item) && (
          selectedLineage.has(item.id) || 
          (selectedItemId && item.parentId === selectedItemId) ||
          selectedLineage.has(item.parentId || '')
        );
        
        return { 
          item, 
          x, 
          y, 
          baseAngle,
          edgeFade,
          isInLineage,
        };
      });
      
      return {
        ring,
        ringIdx,
        radius,
        rotation,
        path: describeArc(centerX, centerY, radius, ARC_START_ANGLE, ARC_END_ANGLE),
        nodePositions,
      };
    });
  }, [rings, ringRotations, centerX, centerY, selectedLineage, selectedItemId]);
  
  // Connection lines
  const connectionLines = useMemo(() => {
    if (!selectedItemId) return [];
    
    const lines: { fromX: number; fromY: number; toX: number; toY: number; color: string }[] = [];
    
    let selectedPos: { x: number; y: number; color: string } | null = null;
    for (const { nodePositions, rotation, radius } of ringData) {
      for (const np of nodePositions) {
        if (!isPlaceholder(np.item) && np.item.id === selectedItemId) {
          const finalAngle = np.baseAngle + rotation;
          const pos = polarToCartesian(centerX, centerY, radius, finalAngle);
          selectedPos = { x: pos.x, y: pos.y, color: np.item.color };
          break;
        }
      }
      if (selectedPos) break;
    }
    
    if (!selectedPos) return [];
    
    for (const { nodePositions, rotation, radius } of ringData) {
      for (const np of nodePositions) {
        if (!isPlaceholder(np.item) && np.item.parentId === selectedItemId && np.edgeFade > 0.3) {
          const finalAngle = np.baseAngle + rotation;
          const childPos = polarToCartesian(centerX, centerY, radius, finalAngle);
          lines.push({
            fromX: selectedPos.x,
            fromY: selectedPos.y,
            toX: childPos.x,
            toY: childPos.y,
            color: selectedPos.color,
          });
        }
      }
    }
    
    return lines;
  }, [selectedItemId, ringData, centerX, centerY]);

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
      
      {/* Ring arcs */}
      {ringData.map(({ ring, radius, path }, ringIdx) => (
        <g key={`ring-arc-${ringIdx}`}>
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
          
          {/* Ring label */}
          {ring.label && (
            <>
              <defs>
                <path
                  id={`labelPath-${ringIdx}`}
                  d={describeLabelArc(centerX, centerY, radius - 14, ARC_START_ANGLE, ARC_START_ANGLE + 45)}
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
      <g className="atlas-connection-lines" style={{ transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}>
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
      </g>
      
      {/* Nodes - grouped by ring with rotation */}
      {ringData.map(({ ring, rotation, nodePositions, radius }, ringIdx) => (
        <g 
          key={`nodes-${ringIdx}`}
          className="atlas-ring-nodes"
          style={{
            transformOrigin: `${centerX}px ${centerY}px`,
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {nodePositions.map(({ item, x, y, edgeFade, isInLineage }) => {
            // Render placeholder
            if (isPlaceholder(item)) {
              return (
                <g
                  key={item.id}
                  style={{
                    opacity: Math.max(edgeFade * 0.6, 0.2), // Ensure minimum visibility
                    transition: 'opacity 0.3s ease-out',
                    transformOrigin: `${x}px ${y}px`,
                    transform: `rotate(${-rotation}deg)`,
                  }}
                >
                  <PlaceholderNode x={x} y={y} />
                </g>
              );
            }
            
            // Render actual item
            const isSelected = selectedItemId === item.id;
            const isInactive = selectedItemId !== null && !isInLineage && !isSelected;
            const baseOpacity = ring.isFaded ? 0.4 : 1;
            const finalOpacity = edgeFade * baseOpacity;
            const isBlooming = bloomingRings.has(ringIdx);
            const isShrinking = shrinkingRings.has(ringIdx);
            
            if (finalOpacity < 0.1) return null;
            
            // Determine animation class
            let animationClass = '';
            if (isBlooming) animationClass = 'atlas-node-bloom';
            else if (isShrinking) animationClass = 'atlas-node-shrink';
            
            return (
              <g
                key={item.id}
                className={animationClass}
                style={{
                  opacity: finalOpacity,
                  filter: isInactive ? 'saturate(0.3) brightness(0.8)' : 'none',
                  transition: 'opacity 0.3s ease-out, filter 0.3s ease-out',
                  transformOrigin: `${x}px ${y}px`,
                  transform: `rotate(${-rotation}deg)`,
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
