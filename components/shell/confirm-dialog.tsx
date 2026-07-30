'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUIStore } from '@/lib/ui-store';

/**
 * The one confirm prompt for the whole app, driven by ui-store.confirm().
 * Mounted once in AppShell; replaces the per-feature AlertDialog copies.
 */
export function ConfirmDialog() {
  const { confirmRequest, resolveConfirm } = useUIStore();

  return (
    <AlertDialog open={!!confirmRequest} onOpenChange={(open) => !open && resolveConfirm(false)}>
      <AlertDialogContent data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmRequest?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmRequest?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="confirm-dialog-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            // The confirm LABEL is caller-supplied ('Delete', 'Reset Streak',
            // 'Confirm'), and 'Delete' collides with three other buttons in the
            // app. This id says which dialog, not which verb.
            data-testid="confirm-dialog-confirm"
            className={
              confirmRequest?.destructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : undefined
            }
            onClick={() => resolveConfirm(true)}
          >
            {confirmRequest?.confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
