'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_LIGHT_PALETTE,
  relayLightColors,
  type RelayLightPaletteKey,
} from '@/lib/relay-palettes';

/**
 * RelayField — an ambient "data relay" visualization: a grid of glowing
 * rounded-square tiles that pulse in a wave rippling out from a focal point.
 * Ported from the Sunday Softworks site (a full-bleed canvas hero) and tuned
 * for Anchor. Dark mode reads the live theme tokens and blends additively
 * (`lighter`) so the tiles bloom as glowing nodes on the navy ground. Light
 * mode can't add light to near-white paper, so it inverts the trick: a
 * monochrome GRAYSCALE ramp (near-neutral, only a whisper of the cool ink hue),
 * painted `source-over`, whose pulse deepens the tiles DOWNWARD instead of
 * brightening them — a "sonar" that reads as intentional tonal texture, where a
 * full-spectrum palette would scatter into confetti on the warm gray.
 *
 * Each tile is a pre-baked 64px sprite: a radial glow halo plus two nested
 * rounded squares (dim outer, bright core). The pulse envelope is a quick
 * bloom → decay → dim-floor on a 3.6s period; a per-tile phase derived from its
 * distance to the focal point makes the whole field breathe outward.
 *
 * Performance/a11y (inherited from the source): DPR capped at 2, paused when
 * offscreen (IntersectionObserver) or the tab is hidden (visibilitychange),
 * and frozen to a single static frame under `prefers-reduced-motion`.
 *
 * The element is `pointer-events-none` and `aria-hidden` — a pure decoration
 * layer. Consumers wrap a `relative` target and drop this in as
 * `<RelayField className="absolute inset-0" … />`.
 */
export interface RelayFieldProps {
  className?: string;
  /** CSS mask-image to fade the field's edges (applied to -webkit + standard). */
  mask?: string;
  /** Vertical origin of the ripple, 0 (top) – 1 (bottom). Default 0.42. */
  focalY?: number;
  /** Target grid spacing in px. Smaller = denser field. Default 40. */
  pitch?: number;
  /** Pulse period in seconds. Default 3.6. */
  period?: number;
  /**
   * Drives a smooth intensity ramp: while true the field settles toward
   * `activeIntensity`, otherwise toward `idleIntensity`. Use for
   * brighten-on-focus / brighten-while-streaming, or a one-shot burst.
   */
  active?: boolean;
  /** Master alpha multiplier at rest (active=false). Default 0.6. */
  idleIntensity?: number;
  /** Master alpha multiplier while `active`. Default 1. */
  activeIntensity?: number;
  /**
   * Overrides `activeIntensity` when the field sits in a LIGHT context, so the
   * same instance can run a gentler active state on paper than its glow does in
   * dark mode. Falls back to `activeIntensity` when unset.
   */
  activeIntensityLight?: number;
  /**
   * Which light-mode palette to paint (see lib/relay-palettes.ts). Only affects
   * light contexts — dark always reads the live theme tokens. Defaults to the
   * catalog default ('gray'); this is the seam for future user theming.
   */
  lightPalette?: RelayLightPaletteKey;
}

interface Cell {
  x: number;
  y: number;
  phase: number;
  max: number;
  ci: number;
}

/** Deterministic per-tile pseudo-random (fract of a big sine), matching source. */
function hash(i: number, seed: number): number {
  const r = 43758.5453 * Math.sin((i + 1) * 12.9898 + 78.233 * seed);
  return r - Math.floor(r);
}

/** Inject an alpha into an oklch() string via the `/ a` syntax. */
function withAlpha(color: string, a: number): string {
  return color.startsWith('oklch(') ? color.replace(')', ` / ${a})`) : color;
}

/** Trace a rounded square of `size`, centered in the 64px sprite. */
function roundRect(ctx: CanvasRenderingContext2D, size: number, radius: number): void {
  const x = 32 - size / 2;
  const y = 32 - size / 2;
  const r = Math.min(radius, size / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
}

/** Bake one tile sprite (glow + nested rounded squares) for a color + theme. */
function buildSprite(color: string, dark: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return c;
  if (!dark) {
    // Light mode = ink tile: no halo (can't add light to paper). Near-neutral
    // cool-gray nested rounded squares; the pulse's rising alpha then deepens
    // them toward gray on the paper — subtractive tonal texture, not a bloom.
    g.fillStyle = withAlpha(color, 0.6);
    roundRect(g, 46, 10);
    g.fill();
    g.fillStyle = withAlpha(color, 1);
    roundRect(g, 30, 7);
    g.fill();
    return c;
  }
  // Dark mode = additive glow: a wide translucent halo blooms on the navy.
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, withAlpha(color, 0.28));
  grad.addColorStop(0.55, withAlpha(color, 0.08));
  grad.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = withAlpha(color, 0.16);
  roundRect(g, 32, 5.76);
  g.fill();
  g.fillStyle = withAlpha(color, 0.9);
  roundRect(g, 17.92, 4.6592);
  g.fill();
  return c;
}

/**
 * Per-theme palette. Dark reads the live lime-dominant tokens — under additive
 * blending on navy they pop as-is. Light can't reuse those tokens and instead
 * pulls from the RELAY_LIGHT_PALETTES catalog (see lib/relay-palettes.ts);
 * `lightKey` selects one (default 'gray'). Those are painted source-over so the
 * alpha envelope deepens tiles toward the color at the ripple crest — the
 * light-mode, subtractive mirror of the dark additive bloom.
 */
function readPalette(dark: boolean, el: Element, lightKey: RelayLightPaletteKey): string[] {
  if (dark) {
    const cs = getComputedStyle(el);
    const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    const primary = read('--primary', 'oklch(0.84 0.15 125)');
    return [
      primary,
      primary,
      primary, // lime dominant
      read('--accent-8', 'oklch(0.76 0.13 125)'), // lime
      read('--afternoon', 'oklch(0.66 0.1 55)'), // orange
      read('--accent-6', 'oklch(0.72 0.1 85)'), // honey
      read('--accent-2', 'oklch(0.66 0.09 190)'), // teal
      read('--accent-3', 'oklch(0.64 0.11 265)'), // indigo
      read('--accent-1', 'oklch(0.66 0.1 140)'), // moss
    ];
  }
  return relayLightColors(lightKey);
}

/**
 * True when the element sits in a dark context — read from its OWN computed
 * --background, not the document's. This lets a field inside a locally-dark
 * island (e.g. the dock capsule marked `.dark` while the app is in light mode)
 * glow additively, matching that island rather than the page.
 */
function isDarkContext(el: Element): boolean {
  const bg = getComputedStyle(el).getPropertyValue('--background').trim();
  const m = bg.match(/oklch\(\s*([\d.]+)/);
  if (m) return parseFloat(m[1]) < 0.5;
  return !!el.closest('.dark');
}

/** Pulse envelope: quick bloom → decay → dim floor, phase-shifted per tile. */
function pulse(cell: Cell, t: number, period: number): number {
  const r = t / period - cell.phase - Math.floor(t / period - cell.phase);
  if (r < 0.12) return 0.05 + (cell.max - 0.05) * (r / 0.12);
  if (r < 0.36) return cell.max - (cell.max - 0.05) * ((r - 0.12) / 0.24);
  return 0.05;
}

export function RelayField({
  className,
  mask,
  focalY = 0.42,
  pitch = 40,
  period = 3.6,
  active = false,
  idleIntensity = 0.6,
  activeIntensity = 1,
  activeIntensityLight,
  lightPalette = DEFAULT_LIGHT_PALETTE,
}: RelayFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable knobs the RAF loop reads without forcing a re-init on change.
  const knobs = useRef({ active, idleIntensity, activeIntensity, activeIntensityLight, period });
  useEffect(() => {
    knobs.current = { active, idleIntensity, activeIntensity, activeIntensityLight, period };
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dark = isDarkContext(container);
    let palette = readPalette(dark, container, lightPalette);
    let sprites = palette.map((c) => buildSprite(c, dark));
    let cells: Cell[] = [];
    let gridPitch = pitch;
    // In a light context, a defined activeIntensityLight overrides activeIntensity.
    const activeFor = (k: typeof knobs.current) =>
      !dark && k.activeIntensityLight != null ? k.activeIntensityLight : k.activeIntensity;
    let curIntensity = knobs.current.active
      ? activeFor(knobs.current)
      : knobs.current.idleIntensity;

    let rafId = 0;
    let startTs = 0;
    let visible = false;

    const draw = (t: number) => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      // Mosaic tiles sit tighter (less overlap) than the wide glow sprites.
      const size = (dark ? 1.9 : 1.3) * gridPitch;
      const k = knobs.current;
      const target = k.active ? activeFor(k) : k.idleIntensity;
      curIntensity += (target - curIntensity) * 0.08;
      ctx.clearRect(0, 0, w, h);
      // Dark adds light (lighter); light lays down ink (source-over) — higher
      // alpha = a deeper ink tile on the paper, so the pulse darkens toward the
      // crest rather than brightening.
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      for (const cell of cells) {
        const env = reduced ? 0.5 * cell.max : pulse(cell, t, k.period);
        const a = env * curIntensity;
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(sprites[cell.ci], cell.x - size / 2, cell.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (ts: number) => {
      if (!startTs) startTs = ts;
      draw((ts - startTs) / 1000);
      rafId = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!rafId && visible && !reduced) rafId = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const layout = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.max(6, Math.round(cw / pitch));
      const cell = cw / cols;
      const rows = Math.ceil(ch / cell) + 1;
      const yOff = (ch - rows * cell) / 2;
      const fx = cols / 2;
      const fy = rows * focalY;
      let maxD = 1;
      for (const [x, y] of [
        [0, 0],
        [cols, 0],
        [0, rows],
        [cols, rows],
      ]) {
        maxD = Math.max(maxD, Math.hypot(x - fx, y - fy));
      }
      const next: Cell[] = [];
      for (let ry = 0; ry < rows; ry++) {
        for (let rx = 0; rx < cols; rx++) {
          const idx = ry * cols + rx;
          const d = Math.min(1, Math.hypot(rx + 0.5 - fx, ry + 0.5 - fy) / maxD);
          next.push({
            x: rx * cell + cell / 2,
            y: yOff + ry * cell + cell / 2,
            phase: (2.4 * d + 0.09 * hash(idx, 4)) % 1,
            max: 0.45 + 0.35 * hash(idx, 5),
            ci: Math.floor(hash(idx, 1) * palette.length),
          });
        }
      }
      cells = next;
      gridPitch = cell;
      if (reduced) draw(0);
    };

    const rebuildForTheme = () => {
      const nowDark = isDarkContext(container);
      if (nowDark === dark) return;
      dark = nowDark;
      palette = readPalette(dark, container, lightPalette);
      sprites = palette.map((c) => buildSprite(c, dark));
      if (reduced) draw(0);
    };

    const ro = new ResizeObserver(layout);
    ro.observe(container);
    layout();

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0 }
    );
    io.observe(container);

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Re-bake sprites/palette when the theme toggles (class or inline style on <html>).
    const themeObserver = new MutationObserver(rebuildForTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [focalY, pitch, lightPalette]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={cn('pointer-events-none overflow-hidden', className)}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
