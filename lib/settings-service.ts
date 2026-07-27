import { createClient } from '@/lib/supabase';

export interface UserSettingsRow {
  theme?: string;
  /** IANA timezone string from DB (synced from client on load) */
  timezone?: string | null;
  time_format?: string;
  week_start_day?: string;
  default_view?: string;
  default_time_bucket?: string;
  show_completed_tasks?: boolean;
  animations_enabled?: boolean;
  compact_mode?: boolean;
  chill_mode?: boolean;
  show_time_indicator?: boolean;
  morning_check_enabled?: boolean;
  left_sidebar_hover?: boolean;
  right_sidebar_hover?: boolean;
  morning_check_time?: string;
  /** null clears the dismissal so today's morning check shows again. */
  morning_check_dismissed_date?: string | null;
  eod_review_time?: string;
  eod_review_enabled?: boolean;
}

const DEFAULT_SETTINGS: UserSettingsRow = {
  theme: 'system',
  time_format: '12h',
  week_start_day: 'sunday',
  default_view: 'day',
  default_time_bucket: 'anytime',
  show_completed_tasks: true,
  animations_enabled: true,
  compact_mode: false,
  chill_mode: false,
  show_time_indicator: true,
  morning_check_enabled: true,
  left_sidebar_hover: false,
  right_sidebar_hover: false,
  morning_check_time: '08:00',
  morning_check_dismissed_date: undefined,
  eod_review_time: '21:00',
  eod_review_enabled: false,
};

const SETTINGS_SELECT =
  'theme,timezone,time_format,week_start_day,default_view,default_time_bucket,show_completed_tasks,animations_enabled,compact_mode,chill_mode,show_time_indicator,morning_check_enabled,left_sidebar_hover,right_sidebar_hover,morning_check_time,morning_check_dismissed_date,eod_review_time,eod_review_enabled';

export async function loadSettings(userId: string): Promise<UserSettingsRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select(SETTINGS_SELECT)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[settings] loadSettings error:', error.message);
    return DEFAULT_SETTINGS;
  }

  if (!data) {
    // First-time user — upsert defaults
    await supabase
      .from('user_settings')
      .upsert({ user_id: userId, ...DEFAULT_SETTINGS }, { onConflict: 'user_id' });
    return DEFAULT_SETTINGS;
  }

  return { ...DEFAULT_SETTINGS, ...data };
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _pending: Partial<UserSettingsRow> = {};
let _pendingUserId: string | null = null;

/**
 * Debounced settings write. Calls within the window MERGE rather than replace.
 *
 * The timer is a single module-level one shared by every call site, so the
 * obvious implementation — capture `patch` in the timeout closure and
 * clearTimeout the previous one — silently discards every write but the last.
 * That was survivable when settings changes were clicks in a dialog; the
 * command palette can fire eight of them one Enter apart, so the patches are
 * accumulated into `_pending` and flushed as one upsert instead.
 *
 * A userId change flushes immediately: the pending patch belongs to the
 * previous user and must not be written against the new one.
 */
export function saveSettings(userId: string, patch: Partial<UserSettingsRow>): void {
  if (_pendingUserId && _pendingUserId !== userId) flushSettings();

  _pendingUserId = userId;
  _pending = { ..._pending, ...patch };

  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flushSettings, 500);
}

/**
 * Write any accumulated patch now and reset the buffer.
 *
 * Await this before signing out or navigating away: the debounce window is
 * 500ms, and a write that lands after `signOut()` is rejected by the
 * user_settings RLS policy with nothing but a console error to show for it.
 */
export function flushSettings(): Promise<void> {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }

  const userId = _pendingUserId;
  const patch = _pending;
  _pendingUserId = null;
  _pending = {};

  if (!userId || Object.keys(patch).length === 0) return Promise.resolve();

  return (async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
    if (error) console.error('[settings] saveSettings error:', error.message);
  })();
}
