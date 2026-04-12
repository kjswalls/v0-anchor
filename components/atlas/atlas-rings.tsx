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

// Arc configuration - rainbow orientation like Calendary
// Arcs curve downward with crest at TOP, nodes spread across the top
// Using standard math convention: 0° = right, 90° = down, 180° = left, 270° = up
// For rainbow shape: sweep from ~200° (lower-left) through 270° (top) to ~340° (lower-right)
const ARC_START_ANGLE = 200; // degrees (lower-left)
const ARC_END_ANGLE = 340; // degrees (lower-right)
const ARC_SPAN = ARC_END_ANGLE - ARC_START_ANGLE; // 140 degrees

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  // Standard SVG angle: 0° = right (3 o'clock), angles go clockwise
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

export function AtlasRings({
  nodes,
  selectedNodeId,
  onSelectNode,
  onDrillDown,
  ringCount = 3,
  size,
}: AtlasRingsProps) {
  // Center positioned below the visible area so arcs appear as rainbow curves
  // with the crest at the top
  const centerX = size / 2;
  const centerY = size * 1.1; // Center below view, arcs curve upward into view
  
  // Calculate ring radii - larger rings extend higher on screen
  // Ring 0 (top-tier projects) = largest radius, appears highest (near top of viewport)
  // Inner rings = smaller radii, appear lower
  const minRadius = size * 0.50; // Smallest ring radius
  const maxRadius = size * 1.0; // Largest ring radius (extends to top of container)
  const ringSpacing = (maxRadius - minRadius) / Math.max(ringCount - 1, 1);
  
  // Distribute nodes across rings
  // Ring 0 = outermost (largest radius, highest on screen - top tier projects)
  // Ring 1, 2, ... = progressively inner rings (sub-projects, lower on screen)
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
      
      // Ring 0 = largest radius (top), higher rings = smaller radius (lower on screen)
      const radius = maxRadius - ringIndex * ringSpacing;
      const { x, y } = polarToCartesian(centerX, centerY, radius, angle);
      
      positions.push({ node, ringIndex, x, y });
    });
    
    return positions;
  }, [nodes, ringCount, centerX, centerY, minRadius, ringSpacing]);
  
  // Generate ring paths (from largest/topmost to smallest/lowest)
  const ringPaths = useMemo(() => {
    return Array.from({ length: ringCount }, (_, i) => {
      const radius = maxRadius - i * ringSpacing;
      return {
        path: describeArc(centerX, centerY, radius, ARC_START_ANGLE, ARC_END_ANGLE),
        radius,
      };
    });
  }, [ringCount, maxRadius, ringSpacing, centerX, centerY]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="overflow-visible"
    >
      {/* Background glow for center area (below visible area) */}
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="100%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* Subtle center glow at bottom */}
      <ellipse
        cx={centerX}
        cy={size}
        rx={size * 0.4}
        ry={size * 0.2}
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
