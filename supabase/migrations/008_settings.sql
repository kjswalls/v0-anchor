-- 008_settings.sql
alter table user_settings
  add column if not exists theme                  text    default 'system',
  add column if not exists time_format            text    default '12h',
  add column if not exists week_start_day         text    default 'sunday',
  add column if not exists default_view           text    default 'day',
  add column if not exists default_time_bucket    text    default 'anytime',
  add column if not exists show_completed_tasks   boolean default true,
  add column if not exists animations_enabled     boolean default true,
  add column if not exists compact_mode           boolean default false,
  add column if not exists chill_mode             boolean default false,
  add column if not exists show_time_indicator    boolean default true,
  add column if not exists morning_check_enabled  boolean default true,
  add column if not exists left_sidebar_hover     boolean default false,
  add column if not exists right_sidebar_hover    boolean default false;
