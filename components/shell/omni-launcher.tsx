'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Omnibar } from '@/components/sidebar/omnibar';
import { useUIStore } from '@/lib/ui-store';

/**
 * The ⌘K launcher shell: a summoned, centered command + search modal. It hosts
 * the very same <Omnibar> the sidebar dock renders, in variant="launcher" — one
 * core, two shells (see components/sidebar/omnibar.tsx).
 *
 * Opened via the `launcher` ActiveDialog variant (⌘K → the registry's
 * `workspace.focusOmnibar` command on desktop); closed by Escape, the scrim, or
 * — once wired — running an action. The content is deliberately transparent and
 * unpadded so the omnibar's own pill is the visible surface rather than a
 * box-in-a-box; DialogContent supplies only the centered position, the scrim,
 * and the focus trap.
 */
export function OmniLauncher() {
  const isOpen = useUIStore((s) => s.activeDialog?.type === 'launcher');
  // Seed for a pre-scoped summon (the `/` binding opens it in command mode).
  const initialQuery = useUIStore((s) =>
    s.activeDialog?.type === 'launcher' ? s.activeDialog.query : undefined,
  );
  const closeDialog = useUIStore((s) => s.closeDialog);

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent
        showCloseButton={false}
        // Sit in the upper third like a normal command palette, so the panel has
        // room to drop below the input (overrides DialogContent's centering).
        className="top-[12%] translate-y-0 gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-xl"
        data-testid="omni-launcher"
      >
        {/* Radix requires a labelled title + description for the dialog; the
            omnibar is the real UI, so both are screen-reader-only. */}
        <DialogTitle className="sr-only">Command launcher</DialogTitle>
        <DialogDescription className="sr-only">
          Search, add a task, run a command, or ask Beacon.
        </DialogDescription>
        {/* Render the omnibar only while open so it MOUNTS FRESH each summon —
            its focus + resting-panel effect keys off mount, and this guarantees
            a fresh mount independent of Radix's content mount/unmount timing. */}
        {isOpen && <Omnibar variant="launcher" initialQuery={initialQuery} />}
      </DialogContent>
    </Dialog>
  );
}
