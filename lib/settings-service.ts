import { createClient } from '@/lib/supabase';

export interface UserSettingsRow {
  theme?: string;
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
  morning_check_dismissed_date?: string;
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
  'theme,time_format,week_start_day,default_view,default_time_bucket,show_completed_tasks,animations_enabled,compact_mode,chill_mode,show_time_indicator,morning_check_enabled,left_sidebar_hover,right_sidebar_hover,morning_check_time,morning_check_dismissed_date,eod_review_time,eod_review_enabled';

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

export function saveSettings(userId: string, patch: Partial<UserSettingsRow>): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
    if (error) console.error('[settings] saveSettings error:', error.message);
  }, 500);
}
