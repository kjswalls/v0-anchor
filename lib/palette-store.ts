'use client';

import { create } from 'zustand';
import { applyThemeChange } from '@/lib/theme-transition';
import {
  DEFAULT_PALETTE,
  PALETTE_STORAGE_KEY,
  isThemePalette,
  type ThemePalette,
} from '@/lib/theme-palettes';

/**
 * The active ground palette — its own concern, next to next-themes' light/dark
 * axis, never inside it: '.dark' stays the physics switch, data-theme is the
 * palette switch, and conflating them in one store invites exactly the
 * 'custom:slug'-in-the-theme-column bug the plan doc warns about.
 *
 * Not persist()ed: localStorage is written by hand as a RAW string under
 * PALETTE_STORAGE_KEY so the blocking pre-hydration script in app/layout.tsx
 * can read it without parsing a zustand envelope. The DOM stamp itself lives in
 * one place — supabase-provider's sync effect (the data-reduce-motion pattern)
 * — so SSR, hydration, and settings writes all converge on a single writer.
 *
 * Server truth is user_settings.theme_palette; hydrateSettings applies it with
 * eased=false (hydration snaps, only user-initiated changes ease — the same
 * split the theme itself uses).
 */
interface PaletteStore {
  palette: ThemePalette;
  /**
   * eased wraps the change in applyThemeChange so the swap cross-fades through
   * the data-theme-changing window; the DOM mutation happens in the provider
   * effect a frame later, comfortably inside the ~180ms window.
   */
  setPalette: (palette: ThemePalette, opts?: { eased?: boolean }) => void;
}

function storedPalette(): ThemePalette {
  if (typeof window === 'undefined') return DEFAULT_PALETTE;
  try {
    const raw = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    return isThemePalette(raw) ? raw : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

export const usePaletteStore = create<PaletteStore>((set) => ({
  palette: storedPalette(),

  setPalette: (palette, opts) => {
    const write = () => set({ palette });
    if (opts?.eased) applyThemeChange(write);
    else write();
  },
}));
