import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * WHERE THE CURSOR GOES WHEN A CONFIRM IS DISMISSED.
 *
 * `ConfirmDialog` is mounted once in AppShell and driven by `ui-store.confirm()`
 * — which is what makes it shared, and also what makes it structurally
 * different from every AlertDialog Radix was designed around. There is no
 * `AlertDialogTrigger` anywhere: the caller is a button somewhere else entirely
 * that happens to call a store action.
 *
 * Radix's modal content closes with
 *
 *     onCloseAutoFocus: (event) => { event.preventDefault(); trigger?.focus() }
 *
 * and that `preventDefault` cancels FocusScope's own restore. With a trigger
 * that trade is right. With NO trigger the optional call is a no-op, the
 * default restore has already been cancelled, and focus lands on `<body>` — so
 * dismissing a delete confirm silently ends the keyboard session. Tab starts
 * again from the top of the document, which inside a modal console means
 * nowhere near the row you were on.
 *
 * The console makes this sharp because it is the surface people drive from the
 * keyboard: `/` to filter, ↓ to a row, ↵ to open it. Reading the confirm and
 * deciding NOT to delete is the ordinary outcome, and it is the one that used to
 * cost the user their place.
 */

vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Overlay: () => null,
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    Description: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    Close: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
    Handle: () => null,
  },
}));

import { ConfirmDialog } from '@/components/shell/confirm-dialog';
import { OrganizeConsole } from '@/components/planner/organize/organize-console';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';

beforeEach(() => {
  useUIStore.setState({ confirmRequest: null });
  usePlannerStore.setState({
    items: [],
    routines: [{ id: 'r1', name: 'Morning', itemIds: [] }],
    programs: [],
    projects: [],
    habitGroups: [],
    itemTypes: [],
    collectionsAvailable: true,
    itemTypesAvailable: true,
    isLoading: false,
    userId: 'u1',
    userTimezone: 'UTC',
  } as never);
});

afterEach(cleanup);

const openConfirmFromDangerZone = () => {
  render(
    <>
      <OrganizeConsole open onOpenChange={() => {}} section="routines" />
      <ConfirmDialog />
    </>
  );
  fireEvent.click(screen.getByTestId('routine-row'));
  const trigger = screen.getByTestId('routine-delete');
  act(() => trigger.focus());
  fireEvent.click(trigger);
  return trigger;
};

describe('dismissing the shared confirm', () => {
  it('puts the cursor back on the control that opened it', async () => {
    const trigger = openConfirmFromDangerZone();
    await screen.findByTestId('confirm-dialog');

    fireEvent.keyDown(screen.getByTestId('confirm-dialog'), { key: 'Escape' });

    await waitFor(() => expect(useUIStore.getState().confirmRequest).toBeNull());
    // Not <body>. Landing there ends the keyboard session: the next Tab starts
    // from the top of the document, and the row the user was working on is gone.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('does the same for Cancel, which is the same decision by mouse', async () => {
    const trigger = openConfirmFromDangerZone();
    await screen.findByTestId('confirm-dialog');

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('does NOT chase a control the confirm just destroyed', async () => {
    /**
     * The other half, and the reason this cannot simply be "always refocus what
     * was focused". Confirming a DELETE unmounts the danger zone along with the
     * whole detail pane, so the remembered element is detached — calling
     * `.focus()` on it does nothing at all in a real browser, but keeping a
     * reference to a removed subtree alive is a leak, and asserting the cursor
     * landed there would be asserting a lie.
     */
    const trigger = openConfirmFromDangerZone();
    await screen.findByTestId('confirm-dialog');

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(useUIStore.getState().confirmRequest).toBeNull());
    expect(usePlannerStore.getState().routines).toEqual([]);
    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(trigger);
  });
});
