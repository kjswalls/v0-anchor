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
      
      // Find selected item to get its ancestry
      const selectedItem = ring.items.find(item => !isPlaceholder(item) && item.id === selectedItemId);
      
      // Check if this ring contains the selected item
      for (let i = 0; i < ring.items.length && i < visibleCount; i++) {
        const item = ring.items[i];
        if (!isPlaceholder(item) && item.id === selectedItemId) {
          const baseAngle = ARC_START_ANGLE + angleStep * (i + 1);
          rotations[ringIdx] = ARC_CENTER_ANGLE - baseAngle;
          return;
        }
      }
      
      // Check if this ring contains the parent of the selected item (keep parent centered)
      const selectedItemInAnyRing = rings.flatMap(r => r.items).find(item => !isPlaceholder(item) && item.id === selectedItemId);
      if (selectedItemInAnyRing && !isPlaceholder(selectedItemInAnyRing)) {
        const parentId = selectedItemInAnyRing.parentId;
        if (parentId) {
          for (let i = 0; i < ring.items.length && i < visibleCount; i++) {
            const item = ring.items[i];
            if (!isPlaceholder(item) && item.id === parentId) {
              const baseAngle = ARC_START_ANGLE + angleStep * (i + 1);
              rotations[ringIdx] = ARC_CENTER_ANGLE - baseAngle;
              return;
            }
          }
          
          // Check if this ring contains the grandparent of the selected item
          const parentItem = rings.flatMap(r => r.items).find(item => !isPlaceholder(item) && item.id === parentId);
          if (parentItem && !isPlaceholder(parentItem) && parentItem.parentId) {
            for (let i = 0; i < ring.items.length && i < visibleCount; i++) {
              const item = ring.items[i];
              if (!isPlaceholder(item) && item.id === parentItem.parentId) {
                const baseAngle = ARC_START_ANGLE + angleStep * (i + 1);
                rotations[ringIdx] = ARC_CENTER_ANGLE - baseAngle;
                return;
              }
            }
          }
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
  type ConnectionSegment = {
    fromPos: { x: number; y: number };
    toPos: { x: number; y: number };
    color: string;
    arcRadius?: number;
    arcStartAngle?: number;
    arcEndAngle?: number;
    hasArc: boolean;
  };
  
  type ConnectionDataType = {
    segments: ConnectionSegment[];
  } | null;
  
  const connectionDataRef = useRef<{ selectionId: string | null; data: ConnectionDataType }>({ 
    selectionId: null, 
    data: null 
  });
  
  
  
  // Calculate connection data - builds segments from selected item up through ancestry
  const connectionData = useMemo(() => {
    // If selection hasn't changed and we have data, return cached version
    if (connectionDataRef.current.selectionId === selectedItemId && connectionDataRef.current.data !== null) {
      return connectionDataRef.current.data;
    }
    
    if (!selectedItemId) {
      connectionDataRef.current = { selectionId: null, data: null };
      return null;
    }
    
    const segments: ConnectionSegment[] = [];
    
    // Helper to find item info by ID
    const findItemInfo = (itemId: string) => {
      for (const { nodePositions, radius, ring } of ringData) {
        for (const np of nodePositions) {
          if (!isPlaceholder(np.item) && np.item.id === itemId) {
            return { np, radius, ring };
          }
        }
      }
      return null;
    };
    
    // Helper to find children info for an item
    const findChildrenInfo = (parentId: string) => {
      for (const { nodePositions, radius, ring } of ringData) {
        if (!ring.isPopulated) continue;
        
        const children = nodePositions.filter(np => 
          !isPlaceholder(np.item) && np.item.parentId === parentId
        );
        
        if (children.length > 0) {
          return { children, radius, ring };
        }
      }
      return null;
    };
    
    // Find the selected item
    const selectedInfo = findItemInfo(selectedItemId);
    if (!selectedInfo) {
      connectionDataRef.current = { selectionId: selectedItemId, data: null };
      return null;
    }
    
    // Build ancestry chain: selected -> parent -> grandparent
    const ancestryChain: string[] = [selectedItemId];
    let currentItem = selectedInfo.np.item;
    while (!isPlaceholder(currentItem) && currentItem.parentId) {
      const parentInfo = findItemInfo(currentItem.parentId);
      if (parentInfo && !isPlaceholder(parentInfo.np.item)) {
        ancestryChain.push(currentItem.parentId);
        currentItem = parentInfo.np.item;
      } else {
        break;
      }
    }
    
    // Reverse so we go from grandparent -> parent -> selected
    ancestryChain.reverse();
    
    // For each item in the chain that has children in the visible rings, create a segment
    for (const itemId of ancestryChain) {
      const itemInfo = findItemInfo(itemId);
      if (!itemInfo) continue;
      
      const childrenInfo = findChildrenInfo(itemId);
      if (!childrenInfo || childrenInfo.children.length === 0) continue;
      
      // Parent position (centered at 270 degrees)
      const parentPos = polarToCartesian(centerX, centerY, itemInfo.radius, ARC_CENTER_ANGLE);
      
      // Child position (centered at 270 degrees)
      const childPos = polarToCartesian(centerX, centerY, childrenInfo.radius, ARC_CENTER_ANGLE);
      
      // Check if any child in this ring is part of the ancestry chain
      // If so, we only show a straight line to that child (no arc)
      // If not, show the arc connecting all children
      const hasChildInAncestry = childrenInfo.children.some(np => 
        !isPlaceholder(np.item) && ancestryChain.includes(np.item.id)
      );
      
      // Calculate arc angles if multiple children AND no child is in the ancestry chain
      let arcStartAngle: number | undefined;
      let arcEndAngle: number | undefined;
      
      if (childrenInfo.children.length > 1 && !hasChildInAncestry) {
        // Calculate the rotation that will be applied to center the children
        const visibleCount = Math.min(childrenInfo.ring.items.length, MAX_VISIBLE_ITEMS);
        const angleStep = ARC_SPAN / (visibleCount + 1);
        const middleChildIdx = Math.floor(childrenInfo.children.length / 2);
        const middleChildBaseAngle = childrenInfo.children[middleChildIdx].baseAngle;
        const rotation = ARC_CENTER_ANGLE - middleChildBaseAngle;
        
        const finalAngles = childrenInfo.children.map(np => np.baseAngle + rotation);
        finalAngles.sort((a, b) => a - b);
        arcStartAngle = finalAngles[0];
        arcEndAngle = finalAngles[finalAngles.length - 1];
      }
      
      segments.push({
        fromPos: parentPos,
        toPos: childPos,
        color: isPlaceholder(itemInfo.np.item) ? '#888' : itemInfo.np.item.color,
        arcRadius: childrenInfo.radius,
        arcStartAngle,
        arcEndAngle,
        hasArc: childrenInfo.children.length > 1 && !hasChildInAncestry,
      });
    }
    
    if (segments.length === 0) {
      connectionDataRef.current = { selectionId: selectedItemId, data: null };
      return null;
    }
    
    const data: ConnectionDataType = { segments };
    
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
      
      {/* Connection lines - segments from grandparent -> parent -> child with arcs */}
      {connectionData && (
        <g key={`connection-${selectedItemId}`} className="atlas-connection-lines atlas-connection-fade-in">
          {connectionData.segments.map((segment, idx) => (
            <g key={`segment-${idx}`}>
              {/* Straight line from parent to center child */}
              <line
                x1={segment.fromPos.x}
                y1={segment.fromPos.y}
                x2={segment.toPos.x}
                y2={segment.toPos.y}
                stroke={segment.color}
                strokeWidth={6}
                opacity={0.2}
                style={{ filter: 'blur(6px)' }}
              />
              <line
                x1={segment.fromPos.x}
                y1={segment.fromPos.y}
                x2={segment.toPos.x}
                y2={segment.toPos.y}
                stroke={segment.color}
                strokeWidth={2}
                opacity={0.7}
              />
              
              {/* Arc line connecting children along the ring */}
              {segment.hasArc && segment.arcRadius && segment.arcStartAngle !== undefined && segment.arcEndAngle !== undefined && (
                <g>
                  <path
                    d={describeArc(
                      centerX,
                      centerY,
                      segment.arcRadius,
                      segment.arcStartAngle,
                      segment.arcEndAngle
                    )}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={6}
                    strokeLinecap="round"
                    opacity={0.2}
                    style={{ filter: 'blur(6px)' }}
                  />
                  <path
                    d={describeArc(
                      centerX,
                      centerY,
                      segment.arcRadius,
                      segment.arcStartAngle,
                      segment.arcEndAngle
                    )}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    opacity={0.7}
                  />
                </g>
              )}
            </g>
          ))}
        </g>
      )}
      
      
      
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
