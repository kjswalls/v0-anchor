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

// Orbiting dot component
function OrbitingDot({
  centerX,
  centerY,
  radius,
  duration,
  delay,
  size = 4,
  color = 'var(--primary)',
}: {
  centerX: number;
  centerY: number;
  radius: number;
  duration: number;
  delay: number;
  size?: number;
  color?: string;
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
      {/* Glow effect */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={size * 2}
        fill={color}
        opacity={0.3}
        style={{ filter: 'blur(4px)' }}
      />
      {/* Core dot */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={size}
        fill={color}
        opacity={0.9}
      />
      {/* Bright center */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={size * 0.4}
        fill="white"
        opacity={0.8}
      />
    </g>
  );
}

// Background sparkle/twinkle component
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
      fill="var(--primary)"
      className="atlas-sparkle"
      style={{
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

// Dashed rotating ring
function DashedOrbit({
  centerX,
  centerY,
  radius,
  duration,
  clockwise = true,
}: {
  centerX: number;
  centerY: number;
  radius: number;
  duration: number;
  clockwise?: boolean;
}) {
  const pathId = useMemo(() => `dashed-orbit-${radius}-${Math.random()}`, [radius]);
  
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
      stroke="var(--primary)"
      strokeWidth={1}
      strokeDasharray="4 8"
      strokeLinecap="round"
      opacity={0.3}
      className={clockwise ? 'atlas-dash-rotate-cw' : 'atlas-dash-rotate-ccw'}
      style={{
        animationDuration: `${duration}ms`,
        transformOrigin: `${centerX}px ${centerY}px`,
      }}
    />
  );
}

export function AtlasAnimations({ size, centerX, centerY, ringRadii }: AtlasAnimationsProps) {
  // Generate random sparkles in the background
  const sparkles = useMemo(() => {
    const particles: { x: number; y: number; size: number; delay: number }[] = [];
    const count = 40;
    
    for (let i = 0; i < count; i++) {
      // Distribute sparkles across the upper portion of the view
      const x = Math.random() * size;
      const y = Math.random() * size * 0.8; // Keep in upper 80%
      const sparkleSize = 1 + Math.random() * 2;
      const delay = Math.random() * 3000;
      
      particles.push({ x, y, size: sparkleSize, delay });
    }
    
    return particles;
  }, [size]);

  // Orbiting dots configuration - one or two per ring
  const orbitingDots = useMemo(() => {
    const dots: { radius: number; duration: number; delay: number; size: number }[] = [];
    
    ringRadii.forEach((radius, index) => {
      // Primary orbiting dot
      dots.push({
        radius: radius + 2, // Slightly outside the ring
        duration: 8000 + index * 2000, // Slower for outer rings
        delay: index * 500,
        size: 3,
      });
      
      // Secondary dot on some rings (going opposite direction effect via delay)
      if (index % 2 === 0) {
        dots.push({
          radius: radius - 2, // Slightly inside the ring
          duration: 10000 + index * 1500,
          delay: 4000 + index * 300,
          size: 2,
        });
      }
    });
    
    return dots;
  }, [ringRadii]);

  return (
    <g className="atlas-animations">
      {/* Background sparkles */}
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
          radius={radius + (index % 2 === 0 ? 12 : -12)}
          duration={20000 + index * 5000}
          clockwise={index % 2 === 0}
        />
      ))}
      
      {/* Orbiting dots */}
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
