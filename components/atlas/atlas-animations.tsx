'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface AtlasAnimationsProps {
  size: number;
  centerX: number;
  centerY: number;
  ringRadii: number[];
}

// Arc configuration matching atlas-rings
const ARC_START_ANGLE = 200;
const ARC_END_ANGLE = 340;

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

// Orbiting dot component - slow, subtle, ring-colored
function OrbitingDot({
  centerX,
  centerY,
  radius,
  duration,
  delay,
  size = 3,
}: {
  centerX: number;
  centerY: number;
  radius: number;
  duration: number;
  delay: number;
  size?: number;
}) {
  const [angle, setAngle] = useState(ARC_START_ANGLE);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>();

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp + delay;
      }
      
      const elapsed = timestamp - startTimeRef.current;
      if (elapsed < 0) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      
      const progress = (elapsed % duration) / duration;
      const newAngle = ARC_START_ANGLE + progress * (ARC_END_ANGLE - ARC_START_ANGLE);
      setAngle(newAngle);
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [duration, delay]);

  const pos = polarToCartesian(centerX, centerY, radius, angle);

  return (
    <g>
      {/* Soft glow - matches ring color */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={size * 3}
        fill="var(--border)"
        opacity={0.15}
        style={{ filter: 'blur(6px)' }}
      />
      {/* Core dot - slightly brighter than ring */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={size}
        fill="var(--muted-foreground)"
        opacity={0.4}
      />
      {/* Tiny bright center */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={size * 0.3}
        fill="var(--foreground)"
        opacity={0.5}
      />
    </g>
  );
}

// Background sparkle/twinkle component - very subtle
function Sparkle({
  x,
  y,
  size,
  delay,
}: {
  x: number;
  y: number;
  size: number;
  delay: number;
}) {
  return (
    <circle
      cx={x}
      cy={y}
      r={size}
      fill="var(--muted-foreground)"
      className="atlas-sparkle"
      style={{
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

// Dashed rotating ring with visible flowing animation
function DashedOrbit({
  centerX,
  centerY,
  radius,
  clockwise = true,
}: {
  centerX: number;
  centerY: number;
  radius: number;
  clockwise?: boolean;
}) {
  // Create arc path for dashed line
  const arcPath = useMemo(() => {
    const start = polarToCartesian(centerX, centerY, radius, ARC_START_ANGLE);
    const end = polarToCartesian(centerX, centerY, radius, ARC_END_ANGLE);
    const largeArcFlag = (ARC_END_ANGLE - ARC_START_ANGLE) > 180 ? 1 : 0;
    
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  }, [centerX, centerY, radius]);

  return (
    <path
      d={arcPath}
      fill="none"
      stroke="var(--border)"
      strokeWidth={1.5}
      strokeDasharray="6 12"
      strokeLinecap="round"
      opacity={0.4}
      className={clockwise ? 'atlas-dash-rotate-cw' : 'atlas-dash-rotate-ccw'}
    />
  );
}

export function AtlasAnimations({ size, centerX, centerY, ringRadii }: AtlasAnimationsProps) {
  // Generate fewer, more subtle sparkles
  const sparkles = useMemo(() => {
    const particles: { x: number; y: number; size: number; delay: number }[] = [];
    const count = 15; // Reduced count
    
    for (let i = 0; i < count; i++) {
      // Distribute sparkles across the upper portion of the view
      const x = Math.random() * size;
      const y = Math.random() * size * 0.7; // Keep in upper 70%
      const sparkleSize = 0.5 + Math.random() * 1; // Smaller sizes
      const delay = Math.random() * 5000; // Longer stagger
      
      particles.push({ x, y, size: sparkleSize, delay });
    }
    
    return particles;
  }, [size]);

  // Orbiting dots configuration - slower, fewer
  const orbitingDots = useMemo(() => {
    const dots: { radius: number; duration: number; delay: number; size: number }[] = [];
    
    ringRadii.forEach((radius, index) => {
      // Primary orbiting dot - much slower
      dots.push({
        radius: radius,
        duration: 25000 + index * 5000, // 25-40 seconds per orbit
        delay: index * 2000,
        size: 2.5,
      });
      
      // Secondary dot on alternating rings
      if (index % 2 === 1) {
        dots.push({
          radius: radius,
          duration: 30000 + index * 3000,
          delay: 12000 + index * 1500,
          size: 2,
        });
      }
    });
    
    return dots;
  }, [ringRadii]);

  return (
    <g className="atlas-animations">
      {/* Background sparkles - very subtle */}
      {sparkles.map((sparkle, i) => (
        <Sparkle
          key={`sparkle-${i}`}
          x={sparkle.x}
          y={sparkle.y}
          size={sparkle.size}
          delay={sparkle.delay}
        />
      ))}
      
      {/* Dashed orbits - offset from main rings */}
      {ringRadii.map((radius, index) => (
        <DashedOrbit
          key={`dashed-${index}`}
          centerX={centerX}
          centerY={centerY}
          radius={radius + (index % 2 === 0 ? 15 : -15)}
          clockwise={index % 2 === 0}
        />
      ))}
      
      {/* Orbiting dots - slow and subtle */}
      {orbitingDots.map((dot, i) => (
        <OrbitingDot
          key={`orbit-dot-${i}`}
          centerX={centerX}
          centerY={centerY}
          radius={dot.radius}
          duration={dot.duration}
          delay={dot.delay}
          size={dot.size}
        />
      ))}
    </g>
  );
}
