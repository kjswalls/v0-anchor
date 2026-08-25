'use client';

import { useState } from 'react';
import { AlignLeft, Check, Sparkles, Sun } from 'lucide-react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { MOBILE_TAB_ORDER, useMobileNavStore, type MobileTab } from '@/lib/mobile-nav-store';
import { cn } from '@/lib/utils';

/**
 * One glyph per surface, and they are the whole readout.
 *
 * Round 6 of the redesign took the lime tint off the mode card: with no colour
 * left to say "active", the glyph alone has to say which surface you are on, so
 * these three have to stay maximally unlike each other. Anything that reads as a
 * generic "list" or a generic "star" belongs in another slot.
 */
const GLYPHS: Record<MobileTab, typeof Sun> = {
  braindump: AlignLeft,
  today: Sun,
  chat: Sparkles,
};

/**
 * Lucide's default stroke of 2 is thinned to 1.5 app-wide (the
 * `.lucide[stroke-width='2']` rule in globals.css). These glyphs opt out: at
 * 18px inside a 44px card they are the only thing distinguishing three
 * surfaces, and the artboard draws them at 2.25.
 */
const GLYPH_STROKE = 2.25;

/** The chat surface is named after whoever is answering. */
function aiSurfaceLabel(provider: string): string {
  if (provider === 'openclaw') return 'OpenClaw';
  if (provider === 'none') return 'AI Magic';
  return 'Beacon';
}

/**
 * The dock's mode card and the sheet it opens — the replacement for the
 * three-tab bar that used to sit under the omnibar.
 *
 * Card and sheet ship together because they are one control: the card shows the
 * surface you are on and the sheet is how you leave it, and splitting them would
 * mean two components deriving the same `activeTab` and agreeing by luck.
 *
 * `[data-tour="tab-*"]` rides the sheet's ENTRIES. It used to be on the tab
 * bar's buttons, where it was also how two @mobile specs changed tab in one
 * click; those go through `switchMobileTab` in tests/e2e/helpers/app.ts now,
 * which opens the sheet first. The onboarding tour points at the card instead
 * (`data-tour="mode-card"`) — spotlighting an entry inside a closed sheet would
 * be a hole cut in the overlay around nothing.
 */
export function ModeSwitcherSheet() {
  const activeTab = useMobileNavStore((s) => s.activeTab);
  const setActiveTab = useMobileNavStore((s) => s.setActiveTab);
  const provider = useAISettingsStore((s) => s.provider);
  const [open, setOpen] = useState(false);

  const labels: Record<MobileTab, string> = {
    braindump: 'Braindump',
    today: 'Today',
    chat: aiSurfaceLabel(provider),
  };
  const ActiveGlyph = GLYPHS[activeTab];

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          data-tour="mode-card"
          data-testid="mobile-mode-card"
          // The surface as a machine-readable value, so a test can assert where
          // it landed without reading a label that is user-configurable on one
          // of the three (the chat tab is named after the provider).
          data-surface={activeTab}
          // The glyph is the entire visible name of this control, so the
          // accessible name has to carry both halves of what it says: which
          // surface you are on, and that pressing it changes that.
          aria-label={`Surface: ${labels[activeTab]}. Change surface.`}
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-foreground shadow-[var(--shadow-elev-sm)]"
        >
          <ActiveGlyph className="size-[18px]" strokeWidth={GLYPH_STROKE} />
        </button>
      </DrawerTrigger>

      <DrawerContent data-testid="mode-switcher-sheet">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-left text-base">Go to</DrawerTitle>
          <DrawerDescription className="sr-only">
            Switch between the Braindump, Today and {labels.chat} surfaces.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-1 px-4 pb-4">
          {MOBILE_TAB_ORDER.map((id) => {
            const Glyph = GLYPHS[id];
            const current = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                data-tour={`tab-${id}`}
                data-testid={`mode-option-${id}`}
                aria-current={current ? 'true' : undefined}
                onClick={() => {
                  setActiveTab(id);
                  setOpen(false);
                }}
                className={cn(
                  'flex h-12 items-center gap-3 rounded-[10px] px-3 text-left',
                  current ? 'bg-surface-3' : 'hover-wash'
                )}
              >
                <Glyph
                  className="size-[18px] shrink-0 text-foreground"
                  strokeWidth={GLYPH_STROKE}
                />
                <span className="flex-1 truncate text-sm font-medium text-foreground">
                  {labels[id]}
                </span>
                {/* A mark, not a tint: the card this sheet belongs to gave up
                    its lime highlight in round 6, and a lime row here would put
                    the colour back one tap away from where it was removed. */}
                {current && <Check className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
