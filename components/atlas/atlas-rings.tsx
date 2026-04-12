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

// Arc configuration - top-down orientation like Calendary
// Arcs curve downward from top, nodes positioned on upper portion
const ARC_START_ANGLE = -160; // degrees (left side, curving down)
const ARC_END_ANGLE = -20; // degrees (right side, curving down)
const ARC_SPAN = ARC_END_ANGLE - ARC_START_ANGLE; // 140 degrees

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
  // Center positioned at the bottom center of the SVG area
  // so arcs emanate upward/outward from the bottom
  const centerX = size / 2;
  const centerY = size * 0.85; // Center near bottom so arcs curve upward
  
  // Calculate ring radii - larger rings that fill more space
  // Outermost ring (top-tier projects) is smallest radius and appears at the top
  // Innermost ring (sub-projects) is largest radius and appears lower
  const minRadius = size * 0.30; // Smallest ring (top-tier) 
  const maxRadius = size * 0.75; // Largest ring (deeper levels)
  const ringSpacing = (maxRadius - minRadius) / Math.max(ringCount - 1, 1);
  
  // Distribute nodes across rings
  // Ring 0 = innermost (smallest radius, highest in visual hierarchy - top tier projects)
  // Ring 1, 2, ... = progressively outer rings (sub-projects)
  const nodePositions = useMemo(() => {
    const positions: Array<{
      node: AtlasNode;
      ringIndex: number;
      x: number;
      y: number;
    }> = [];
    
    // Simple distribution: spread nodes evenly across available rings
    // Primary ring (smallest/topmost) gets the most important nodes
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
      
      // Rings go from small (top) to large (bottom)
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
      {/* Background glow for center area (at bottom) */}
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="85%" r="40%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* Subtle center glow */}
      <circle
        cx={centerX}
        cy={centerY}
        r={minRadius * 0.6}
        fill="url(#centerGlow)"
      />
      
      {/* Ring arcs - drawn from innermost (top) to outermost */}
      {ringPaths.map((ring, index) => (
        <g key={`ring-${index}`}>
          {/* Ring background arc */}
          <path
            d={ring.path}
            fill="none"
            stroke="var(--border)"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.6}
          />
          
          {/* Active ring segment highlight */}
          <path
            d={ring.path}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.15}
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
