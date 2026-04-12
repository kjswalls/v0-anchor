'use client';

import { useMemo } from 'react';
import { AtlasNodeComponent } from './atlas-node';
import type { AtlasNode } from '@/lib/atlas-store';

interface AtlasRingsProps {
  nodes: AtlasNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onDrillDown: (nodeId: string) => void;
  ringCount?: number;
  size: number;
}

// Arc configuration
const ARC_START_ANGLE = -200; // degrees from top (opening faces down-left)
const ARC_END_ANGLE = 20; // degrees from top
const ARC_SPAN = ARC_END_ANGLE - ARC_START_ANGLE; // 220 degrees

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
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

export function AtlasRings({
  nodes,
  selectedNodeId,
  onSelectNode,
  onDrillDown,
  ringCount = 3,
  size,
}: AtlasRingsProps) {
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Calculate ring radii - distribute rings evenly
  const minRadius = size * 0.18;
  const maxRadius = size * 0.42;
  const ringSpacing = (maxRadius - minRadius) / Math.max(ringCount - 1, 1);
  
  // Distribute nodes across rings
  const nodePositions = useMemo(() => {
    const positions: Array<{
      node: AtlasNode;
      ringIndex: number;
      x: number;
      y: number;
    }> = [];
    
    // Simple distribution: spread nodes evenly across available rings
    // Primary ring (innermost) gets the most important nodes
    const nodesPerRing = Math.ceil(nodes.length / ringCount);
    
    nodes.forEach((node, index) => {
      const ringIndex = Math.min(Math.floor(index / nodesPerRing), ringCount - 1);
      const nodesInThisRing = nodes.filter((_, i) => 
        Math.min(Math.floor(i / nodesPerRing), ringCount - 1) === ringIndex
      ).length;
      const indexInRing = index % nodesPerRing;
      
      // Calculate angle for this node within the arc
      const angleStep = ARC_SPAN / Math.max(nodesInThisRing + 1, 2);
      const angle = ARC_START_ANGLE + angleStep * (indexInRing + 1);
      
      const radius = minRadius + ringIndex * ringSpacing;
      const { x, y } = polarToCartesian(centerX, centerY, radius, angle);
      
      positions.push({ node, ringIndex, x, y });
    });
    
    return positions;
  }, [nodes, ringCount, centerX, centerY, minRadius, ringSpacing]);
  
  // Generate ring paths
  const ringPaths = useMemo(() => {
    return Array.from({ length: ringCount }, (_, i) => {
      const radius = minRadius + i * ringSpacing;
      return {
        path: describeArc(centerX, centerY, radius, ARC_START_ANGLE, ARC_END_ANGLE),
        radius,
      };
    });
  }, [ringCount, minRadius, ringSpacing, centerX, centerY]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="overflow-visible"
    >
      {/* Background glow for selected area */}
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* Subtle center glow */}
      <circle
        cx={centerX}
        cy={centerY}
        r={minRadius * 0.8}
        fill="url(#centerGlow)"
      />
      
      {/* Ring arcs */}
      {ringPaths.map((ring, index) => (
        <g key={`ring-${index}`}>
          {/* Ring background arc */}
          <path
            d={ring.path}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.5}
          />
          
          {/* Ring highlight arc (subtle) */}
          <path
            d={ring.path}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={0.5}
            strokeLinecap="round"
            opacity={0.2}
          />
        </g>
      ))}
      
      {/* Connection lines from center to first ring nodes */}
      {nodePositions
        .filter(p => p.ringIndex === 0)
        .map(({ node, x, y }) => (
          <line
            key={`line-${node.id}`}
            x1={centerX}
            y1={centerY}
            x2={x}
            y2={y}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.3}
          />
        ))}
      
      {/* Nodes */}
      {nodePositions.map(({ node, x, y }) => (
        <AtlasNodeComponent
          key={node.id}
          node={node}
          x={x}
          y={y}
          isSelected={selectedNodeId === node.id}
          hasChildren={!!(node.children && node.children.length > 0)}
          onClick={() => onSelectNode(selectedNodeId === node.id ? null : node.id)}
          onDoubleClick={() => {
            if (node.children && node.children.length > 0) {
              onDrillDown(node.id);
            }
          }}
        />
      ))}
    </svg>
  );
}
