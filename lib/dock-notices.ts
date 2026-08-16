import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The shape of a thing the app says first.
 *
 * Anchor has two directions of speech and they used to be scattered. The user
 * speaks to the app through one input at the bottom of the sidebar; the app
 * spoke back from a 50px strip in the canvas, a modal, a `text-xs` line two of
 * six layouts rendered, and a five-second toast. A notice is the app's half of
 * that conversation, given one shape so it can be given one home — the dock,
 * directly above the omnibar. See components/sidebar/dock-notices.tsx.
 *
 * The membership rule is narrow on purpose and it is about DECISIONS, not about
 * importance. A notice earns a line here only if there is something the user
 * has to answer. A permanent fact about the world ("4 items live in Summer, and
 * Summer is off") is not a notice — it belongs on the thing it is a fact about,
 * which is why the program count sits on its scope-rail row and the day's
 * suppression line sits in the canvas header beside the date. Put standing
 * facts in here and the dock silts up into a notification centre nobody reads,
 * which is the failure mode this surface exists to avoid.
 */
export type DockNotice = {
  id: string;
  /** Higher sorts first — see {@link NOTICE_RANK}. */
  rank: number;
  icon: LucideIcon;
  /**
   * Colour for the GLYPH only. The label, the verb and the ✕ stay plain body
   * ink: honey (or any warning tint) in body text is what made the old waiting
   * bar read as a caution strip, and this surface inherits that ruling.
   */
  iconClassName?: string;
  /** The line. One clause; the row truncates rather than wraps. */
  label: ReactNode;
  /** Trailing verb — 'Review', 'Retry'. Omit for a row with nothing to press. */
  actionLabel?: string;
  /**
   * The expanded body, if this notice has one. A function of the variant
   * because the two shells present it differently — a Popover growing upward
   * out of the dock on desktop, a Drawer on touch — and the bodies genuinely
   * differ (see MorningTriageList's `variant`).
   */
  tray?: (variant: NoticeTrayVariant) => ReactNode;
  /** Drawer heading on touch. Required whenever `tray` is set. */
  trayTitle?: string;
  /** Screen-reader description for the Drawer. */
  trayDescription?: string;
  /** Controlled tray state. Owned by the notice's source, not by the dock. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** For a notice with no tray: what pressing the row does. */
  onSelect?: () => void;
  /** Present ⇒ the row grows a trailing ✕. */
  onDismiss?: () => void;
  dismissLabel?: string;
  /**
   * An extra handle on the row, beyond the `dock-notice` / `data-notice-id`
   * pair every row carries. Only the waiting notice sets one, and only so the
   * e2e suite keeps addressing it as `morning-bar` across the move — a surface
   * changing address should not also change name in the same commit.
   */
  testId?: string;
  trayTestId?: string;
};

export type NoticeTrayVariant = 'tray' | 'sheet';

/**
 * Rank by WHAT IS PENDING, not by which feature raised it.
 *
 * Sorting by kind is the obvious thing and it is wrong: it makes the order an
 * artifact of how the app happens to be factored, so a new feature's notice
 * lands wherever its module sorts rather than where its urgency puts it. These
 * four levels are about what the line is asking of the reader.
 */
export const NOTICE_RANK = {
  /** Something is broken and the app cannot proceed without you. */
  blocked: 90,
  /** A pile is waiting on a decision only you can make. */
  decision: 50,
  /** The app did something on your behalf and you may want it undone. */
  receipt: 30,
  /** A state of the world you should know about. Rarely belongs here at all. */
  statement: 10,
} as const;

/** Most-urgent first, ties broken by id so the order can't flicker. */
export function rankNotices(notices: readonly DockNotice[]): DockNotice[] {
  return [...notices].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
}

/**
 * How many rows actually get drawn, and how many are folded away.
 *
 * The dock's height ladder is 0 / one row / `max` rows and never a function of
 * n — a surface in a column shared with the braindump does not get to grow
 * without asking. But the fold is a DEFAULT, not a ceiling: `expanded` lifts it
 * completely, because a message surface that hides messages to protect its own
 * geometry has stopped being a message surface.
 *
 * The subtlety is the last visible slot. At `max + 1` notices you cannot show
 * `max` rows AND an overflow row — that is `max + 1` rows, which is the thing
 * the cap exists to prevent — so the final slot goes to the overflow row and
 * one more notice folds into it. `overflow` is therefore 2, not 1, at that
 * count, and the caller must render the summary whenever it is non-zero.
 */
export function capNotices(
  notices: readonly DockNotice[],
  max: number,
  expanded = false
): { visible: DockNotice[]; overflow: number } {
  if (expanded || notices.length <= max) {
    return { visible: [...notices], overflow: 0 };
  }
  const visible = notices.slice(0, Math.max(0, max - 1));
  return { visible, overflow: notices.length - visible.length };
}
