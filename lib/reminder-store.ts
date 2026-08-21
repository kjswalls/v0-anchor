'use client';

import { create } from 'zustand';
import { saveSettings } from '@/lib/settings-service';
import { usePlannerStore } from '@/lib/planner-store';

/**
 * Per-user reminder settings — the master switch and the last call.
 *
 * One store per concern, like every other ritual (morning-store, eod-store).
 *
 * NOT persist()ed, deliberately, and unlike its eod-store sibling. These three
 * values are read by exactly one consumer that matters — the server-side
 * reminder scan — and by one surface that already waits for hydration (the
 * settings page gates its whole render on it). A localStorage mirror could
 * therefore only ever be WRONG in a way nobody notices until Anchor is silent:
 * a stale `remindersEnabled: true` shows a switch that is on while the row that
 * actually governs delivery says off. The server is truth, so it is the only
 * copy. (Same reasoning extensions-store wrote down for the same shape.)
 */
interface ReminderStore {
  /** Master switch. Every per-item cue is gated behind it. */
  remindersEnabled: boolean;
  /** The streak-at-risk last call. */
  lastCallEnabled: boolean;
  /** HH:mm, local. */
  lastCallTime: string;

  setRemindersEnabled: (enabled: boolean) => void;
  setLastCallEnabled: (enabled: boolean) => void;
  setLastCallTime: (time: string) => void;
}

export const REMINDER_DEFAULTS = {
  remindersEnabled: false,
  lastCallEnabled: false,
  lastCallTime: '20:30',
} as const;

export const useReminderStore = create<ReminderStore>((set) => ({
  ...REMINDER_DEFAULTS,

  setRemindersEnabled: (enabled) => {
    set({ remindersEnabled: enabled });
    const userId = usePlannerStore.getState().userId;
    if (userId) saveSettings(userId, { habit_reminders_enabled: enabled });
  },

  setLastCallEnabled: (enabled) => {
    set({ lastCallEnabled: enabled });
    const userId = usePlannerStore.getState().userId;
    if (userId) saveSettings(userId, { habit_last_call_enabled: enabled });
  },

  setLastCallTime: (time) => {
    set({ lastCallTime: time });
    const userId = usePlannerStore.getState().userId;
    if (userId) saveSettings(userId, { habit_last_call_time: time });
  },
}));
