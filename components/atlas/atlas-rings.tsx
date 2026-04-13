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
  // Initialize with null to detect first render vs actual state changes
  const prevPopulatedRef = useRef<boolean[] | null>(null);
  const isFirstRenderRef = useRef(true);
  
  // Track which rings just got populated (for fade-in animation)
  const [fadingInRings, setFadingInRings] = useState<Set<number>>(new Set());
  
  // Track items that are exiting per ring (for fade-out animation) - stores base positions
  type ExitingNode = { id: string; item: RingItem; x: number; y: number };
  type StoredNodePosition = { item: RingItem; x: number; y: number; ringIdx: number };
  const [exitingNodesByRing, setExitingNodesByRing] = useState<Map<number, ExitingNode[]>>(new Map());
  
  // Store real item base positions for exit animation (before rotation applied)
  const prevNodePositionsRef = useRef<Map<string, StoredNodePosition>>(new Map());
  
  // Calculate ring rotations based on selection
  const ringRotations = useMemo(() => {
    const rotations: number[] = rings.map(() => 0);
    
    rings.forEach((ring, ringIdx) => {
      const visibleCount = Math.min(ring.items.length, MAX_VISIBLE_ITEMS);
      if (visibleCount === 0) return;
      
      const angleStep = ARC_SPAN / (visibleCount + 1);
      
      // When a ring just got populated, add a small rotation animation for style
      const wasPopulated = prevPopulatedRef.current?.[ringIdx] ?? false;
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
  
  // Update population tracking after render and trigger fade-in/fade-out animations
  useEffect(() => {
    // Skip on first render - just initialize tracking
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevPopulatedRef.current = rings.map(r => r.isPopulated);
      return;
    }
    
    const newFadingInRings = new Set<number>();
    
    rings.forEach((ring, idx) => {
      const wasPopulated = prevPopulatedRef.current?.[idx] ?? false;
      const nowPopulated = ring.isPopulated;
      
      // If this ring just got populated (was falsy, now truthy), mark it for fade-in
      if (!wasPopulated && nowPopulated) {
        newFadingInRings.add(idx);
      }
      
      // If this ring just got depopulated, collect exiting nodes from our stored positions
      if (wasPopulated && !nowPopulated) {
        const exitingFromRing: ExitingNode[] = [];
        prevNodePositionsRef.current.forEach((pos, id) => {
          if (pos.ringIdx === idx) {
            // x,y are base positions (before rotation) so they can follow ring rotation
            exitingFromRing.push({ id, item: pos.item, x: pos.x, y: pos.y });
          }
        });
        
        if (exitingFromRing.length > 0) {
          setExitingNodesByRing(prev => {
            const newMap = new Map(prev);
            newMap.set(idx, exitingFromRing);
            return newMap;
          });
          setTimeout(() => {
            setExitingNodesByRing(prev => {
              const newMap = new Map(prev);
              newMap.delete(idx);
              return newMap;
            });
          }, 400);
        }
        
        // Clear stored positions for this ring
        prevNodePositionsRef.current.forEach((_, id) => {
          const pos = prevNodePositionsRef.current.get(id);
          if (pos?.ringIdx === idx) {
            prevNodePositionsRef.current.delete(id);
          }
        });
      }
    });
    
    // Update previous state
    prevPopulatedRef.current = rings.map(r => r.isPopulated);
    
    if (newFadingInRings.size > 0) {
      setFadingInRings(newFadingInRings);
      const timer = setTimeout(() => {
        setFadingInRings(new Set());
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [rings, centerX, centerY]);
  
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
  
  // Connection data ref - stores stable positions once calculated for a selection
  type ConnectionDataType = {
    parentPos: { x: number; y: number; color: string };
    centerChild: { x: number; y: number };
    childRingRadius: number;
    arcStartAngle: number;
    arcEndAngle: number;
    hasMultipleChildren: boolean;
    lineLength: number;
    arcLength: number;
  } | null;
  
  const connectionDataRef = useRef<{ selectionId: string | null; data: ConnectionDataType }>({ 
    selectionId: null, 
    data: null 
  });
  
  // Calculate connection data only when selection changes, using final rotation positions
  const connectionData = useMemo(() => {
    // If selection hasn't changed and we have data, return cached version
    if (connectionDataRef.current.selectionId === selectedItemId && connectionDataRef.current.data !== null) {
      console.log('[v0] connectionData: returning cached data for', selectedItemId);
      return connectionDataRef.current.data;
    }
    console.log('[v0] connectionData: recalculating for', selectedItemId, 'prev was', connectionDataRef.current.selectionId);
    
    if (!selectedItemId) {
      connectionDataRef.current = { selectionId: null, data: null };
      return null;
    }
    
    // Find selected item - use CENTER position (270 degrees) since that's where it will rotate to
    let selectedPos: { x: number; y: number; color: string } | null = null;
    let selectedRingRadius = 0;
    
    for (const { nodePositions, radius } of ringData) {
      for (const np of nodePositions) {
        if (!isPlaceholder(np.item) && np.item.id === selectedItemId) {
          // Selected item will be at center (270 degrees)
          const pos = polarToCartesian(centerX, centerY, radius, ARC_CENTER_ANGLE);
          selectedPos = { x: pos.x, y: pos.y, color: np.item.color };
          selectedRingRadius = radius;
          break;
        }
      }
      if (selectedPos) break;
    }
    
    if (!selectedPos) {
      connectionDataRef.current = { selectionId: selectedItemId, data: null };
      return null;
    }
    
    // Find all children - calculate their FINAL positions after rotation
    const children: { finalAngle: number; idx: number }[] = [];
    let childRingRadius = 0;
    let childRingIdx = -1;
    
    for (const { ring, nodePositions, radius, ringIdx } of ringData) {
      if (!ring.isPopulated) continue;
      
      const realChildren = nodePositions.filter(np => 
        !isPlaceholder(np.item) && np.item.parentId === selectedItemId
      );
      
      if (realChildren.length > 0) {
        childRingRadius = radius;
        childRingIdx = ringIdx;
        
        // Calculate the rotation that will be applied to center the children
        const visibleCount = Math.min(ring.items.length, MAX_VISIBLE_ITEMS);
        const angleStep = ARC_SPAN / (visibleCount + 1);
        const middleChildIdx = Math.floor(realChildren.length / 2);
        const middleChildBaseAngle = realChildren[middleChildIdx].baseAngle;
        const rotation = ARC_CENTER_ANGLE - middleChildBaseAngle;
        
        realChildren.forEach((np, idx) => {
          const finalAngle = np.baseAngle + rotation;
          children.push({ finalAngle, idx });
        });
        break;
      }
    }
    
    if (children.length === 0) {
      connectionDataRef.current = { selectionId: selectedItemId, data: null };
      return null;
    }
    
    // Sort children by angle to find the range
    const sortedByAngle = [...children].sort((a, b) => a.finalAngle - b.finalAngle);
    const minAngle = sortedByAngle[0].finalAngle;
    const maxAngle = sortedByAngle[sortedByAngle.length - 1].finalAngle;
    
    // Center child will be at 270 degrees
    const centerChildPos = polarToCartesian(centerX, centerY, childRingRadius, ARC_CENTER_ANGLE);
    
    // Calculate line length
    const dx = centerChildPos.x - selectedPos.x;
    const dy = centerChildPos.y - selectedPos.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate arc length
    const arcAngleSpan = Math.abs(maxAngle - minAngle);
    const arcLength = (arcAngleSpan * Math.PI / 180) * childRingRadius;
    
    const data: ConnectionDataType = {
      parentPos: selectedPos,
      centerChild: centerChildPos,
      childRingRadius,
      arcStartAngle: minAngle,
      arcEndAngle: maxAngle,
      hasMultipleChildren: children.length > 1,
      lineLength,
      arcLength,
    };
    
    connectionDataRef.current = { selectionId: selectedItemId, data };
    return data;
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
      
      {/* Connection lines - straight line to center child + arc along children */}
      {connectionData && (() => {
        console.log('[v0] Rendering connection lines for', selectedItemId);
        return (
        <g key={`connection-${selectedItemId}`} className="atlas-connection-lines">
          {/* Straight line from parent to center child - draws downward */}
          <g>
            <line
              x1={connectionData.parentPos.x}
              y1={connectionData.parentPos.y}
              x2={connectionData.centerChild.x}
              y2={connectionData.centerChild.y}
              stroke={connectionData.parentPos.color}
              strokeWidth={6}
              opacity={0.2}
              style={{ 
                filter: 'blur(6px)',
                strokeDasharray: connectionData.lineLength,
                strokeDashoffset: connectionData.lineLength,
                animation: 'atlas-line-draw 0.5s ease-out forwards',
              }}
            />
            <line
              x1={connectionData.parentPos.x}
              y1={connectionData.parentPos.y}
              x2={connectionData.centerChild.x}
              y2={connectionData.centerChild.y}
              stroke={connectionData.parentPos.color}
              strokeWidth={2}
              opacity={0.7}
              style={{ 
                strokeDasharray: connectionData.lineLength,
                strokeDashoffset: connectionData.lineLength,
                animation: 'atlas-line-draw 0.5s ease-out forwards',
              }}
            />
          </g>
          
          {/* Arc line connecting children along the ring - spreads from center */}
          {connectionData.hasMultipleChildren && (
            <g>
              <path
                d={describeArc(
                  centerX,
                  centerY,
                  connectionData.childRingRadius,
                  connectionData.arcStartAngle,
                  connectionData.arcEndAngle
                )}
                fill="none"
                stroke={connectionData.parentPos.color}
                strokeWidth={6}
                strokeLinecap="round"
                opacity={0.2}
                style={{ 
                  filter: 'blur(6px)',
                  strokeDasharray: connectionData.arcLength,
                  strokeDashoffset: connectionData.arcLength,
                  animation: 'atlas-line-draw 0.4s ease-out 0.35s forwards',
                }}
              />
              <path
                d={describeArc(
                  centerX,
                  centerY,
                  connectionData.childRingRadius,
                  connectionData.arcStartAngle,
                  connectionData.arcEndAngle
                )}
                fill="none"
                stroke={connectionData.parentPos.color}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.7}
                style={{ 
                  strokeDasharray: connectionData.arcLength,
                  strokeDashoffset: connectionData.arcLength,
                  animation: 'atlas-line-draw 0.4s ease-out 0.35s forwards',
                }}
              />
            </g>
          )}
        </g>
        );
      })()}
      
      
      
      {/* Nodes - grouped by ring with rotation */}
      {ringData.map(({ ring, rotation, nodePositions }, ringIdx) => {
        const ringExitingNodes = exitingNodesByRing.get(ringIdx) || [];
        
        return (
        <g 
          key={`nodes-${ringIdx}`}
          className="atlas-ring-nodes"
          style={{
            transformOrigin: `${centerX}px ${centerY}px`,
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Exiting items - rendered inside ring group so they follow rotation */}
          {ringExitingNodes.map(({ id, item, x, y }) => (
            <g
              key={`exiting-${id}`}
              className="atlas-node-fade-out"
              style={{
                transformOrigin: `${x}px ${y}px`,
                transform: `rotate(${-rotation}deg)`,
              }}
            >
              <AtlasNodeComponent
                node={item}
                x={x}
                y={y}
                isSelected={false}
                hasChildren={item.children.length > 0}
                isFaded={false}
                onClick={() => {}}
                onDoubleClick={() => {}}
              />
            </g>
          ))}
          {nodePositions.map(({ item, x, y, edgeFade, isInLineage }) => {
            // Render placeholder
            if (isPlaceholder(item)) {
              return (
                <g
                  key={item.id}
                  style={{
                    opacity: Math.max(edgeFade * 0.6, 0.2),
                    transition: 'opacity 0.3s ease-out, transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
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
            const isFadingIn = fadingInRings.has(ringIdx);
            
            // Store base position for exit animation (before rotation, so exiting nodes follow ring rotation)
            if (finalOpacity > 0.1) {
              prevNodePositionsRef.current.set(item.id, { item, x, y, ringIdx });
            }
            
            if (finalOpacity < 0.1) return null;
            
            return (
              <g
                key={item.id}
                className={isFadingIn ? 'atlas-node-fade-in' : ''}
                style={{
                  opacity: finalOpacity,
                  filter: isInactive ? 'saturate(0.3) brightness(0.8)' : 'none',
                  transition: 'opacity 0.4s ease-out, filter 0.3s ease-out, transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
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
      );
      })}
    </svg>
  );
}
