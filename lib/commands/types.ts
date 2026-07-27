import type { LucideIcon } from 'lucide-react';

/**
 * The command model. One registry (lib/commands/registry.ts) is the source of
 * truth for BOTH the omnibar palette and the app's keyboard shortcuts, so a
 * capability is described once and every surface that exposes it — palette
 * row, key binding, shortcuts modal — is generated from that description.
 */

export type CommandGroupId =
  | 'recent'
  | 'create'
  | 'goto'
  | 'view'
  | 'rituals'
  | 'workspace'
  | 'settings'
  | 'history'
  | 'app';

/** Palette render order. Groups with no matching rows are skipped. */
/**
 * Heading for the derived usage group. Not part of COMMAND_GROUPS: it holds no
 * commands of its own, and the omnibar places it by hand — above the palette
 * in /command mode, below the fixed actions at rest.
 */
export const RECENT_HEADING = 'Recently used';

export const COMMAND_GROUPS: { id: CommandGroupId; heading: string }[] = [
  { id: 'create', heading: 'Create' },
  { id: 'goto', heading: 'Go to' },
  { id: 'view', heading: 'View' },
  { id: 'rituals', heading: 'Rituals & Beacon' },
  { id: 'workspace', heading: 'Workspace' },
  { id: 'settings', heading: 'Settings' },
  { id: 'history', heading: 'History' },
  { id: 'app', heading: 'App' },
];

/**
 * Capabilities that are NOT reachable from a plain module via
 * `someStore.getState()`, assembled by the host component and handed to every
 * run(). Everything else a command needs, it reads off a store directly.
 */
export interface CommandContext {
  theme: {
    /** 'system' resolved to what is actually on screen — use this to invert. */
    resolved: 'light' | 'dark';
    /** The stored preference, which may be 'system'. */
    value: string | undefined;
    /** Sets next-themes AND persists to user_settings. */
    set: (theme: 'light' | 'dark' | 'system') => void;
  };
  /** Opens the chat: expands the sidebar dock on desktop, the tab on mobile. */
  openChat: () => void;
  userId: string | null;
  isMobile: boolean;
}

export interface CommandArgOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  keywords?: string;
  /** See Command.aliases — same contract, for a nested value. */
  aliases?: string[];
  /** Renders a check — this is the value currently in effect. */
  active?: boolean;
}

export type CommandArgument =
  | {
      kind: 'enum';
      placeholder: string;
      options: (ctx: CommandContext) => CommandArgOption[];
      /**
       * Surface every option as its own top-level row ("Change layout ▸ List"),
       * so a known value is one keystroke away instead of two.
       *
       * Only for small, FIXED option sets. Never flatten a data-derived list:
       * user-named entities collide with built-in labels (a project called
       * "Today" competing with "Go to today"), and they bloat the list on a
       * surface that has ~320px of vertical room on mobile.
       */
      flatten?: boolean;
    }
  | {
      kind: 'text';
      placeholder: string;
      /** Returns an error message, or null when the value is acceptable. */
      validate?: (value: string) => string | null;
    };

export interface CommandShortcutSpec {
  /**
   * Stable id, persisted in the keyboard-shortcuts store as the key for a
   * user's rebinding. Never rename one — the store's migrate merges by id.
   */
  id: string;
  keys: string[];
  /**
   * Fire even while a text input has focus. Chrome-level bindings (⌘K, ⌘,)
   * want this; anything that mutates data must not have it, or ⌘Z inside a
   * text field undoes a task instead of a keystroke.
   */
  allowInInput?: boolean;
  /**
   * Allow key auto-repeat to fire the command again while held. Off by default
   * — repeat-firing a dialog or a toggle is nonsense — but undo and redo are
   * expected to rewind continuously when you hold the key down.
   */
  repeatable?: boolean;
}

export interface Command {
  id: string;
  /**
   * Canonical label. This is what the matcher scores against and what the
   * shortcuts modal shows, so it must be meaningful without app state.
   */
  label: string;
  /** Display override when the label depends on state ("Undo ‹action›"). */
  dynamicLabel?: (ctx: CommandContext) => string;
  description?: string;
  group: CommandGroupId;
  icon: LucideIcon;
  /** Extra search terms, space separated. */
  keywords?: string;
  /**
   * Short tokens you can type verbatim to reach this command — "/dark",
   * "/today". An exact alias outranks everything, including another command's
   * exact label, so an alias is a promise: typing it lands here and nowhere
   * else. Keep them single words, lowercase, and unique across the registry
   * (there is a test).
   *
   * The first alias is what the palette advertises in the row's right-hand
   * hint, so put the canonical one first.
   */
  aliases?: string[];
  argument?: CommandArgument;
  shortcut?: CommandShortcutSpec;
  /** Greys the row and blocks execution when false. */
  availableWhen?: (ctx: CommandContext) => boolean;
  /**
   * Never rendered as a palette row, but still bindable and still listed in
   * the shortcuts modal. For commands that are meaningless from inside the
   * palette (focusing the omnibar you are already typing in) or that would
   * destroy the surface they were run from (collapsing the sidebar takes the
   * omnibar with it — see components/sidebar/sidebar.tsx, the collapsed state
   * is `w-0` on an `overflow-hidden` container).
   */
  hidden?: boolean | ((ctx: CommandContext) => boolean);
  run: (ctx: CommandContext, arg?: string) => void;
}

export function resolveLabel(command: Command, ctx: CommandContext): string {
  return command.dynamicLabel?.(ctx) ?? command.label;
}

export function isHidden(command: Command, ctx: CommandContext): boolean {
  return typeof command.hidden === 'function' ? command.hidden(ctx) : !!command.hidden;
}

export function isAvailable(command: Command, ctx: CommandContext): boolean {
  return command.availableWhen ? command.availableWhen(ctx) : true;
}
