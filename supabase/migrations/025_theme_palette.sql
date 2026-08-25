-- ─────────────────────────────────────────────────────────────────────────────
-- 025_theme_palette.sql — active ground palette (plugins-themes plan, Project A)
--
-- Adds user_settings.theme_palette: the slug of the active preset palette
-- ('default' | 'slate' | 'dune' | 'iris' today — the catalog lives app-side in
-- lib/theme-palettes.ts and the CSS blocks in app/globals.css). A SEPARATE
-- column from `theme` (light|dark|system) by locked plan decision: overloading
-- theme with 'custom:slug' would feed arbitrary strings into next-themes and
-- every tri-state parse of it. Open text, no CHECK — unknown slugs degrade to
-- the default look app-side, and a CHECK would turn every future preset into a
-- migration.
--
-- App-side: the column starts in PENDING_SCHEMA_COLUMNS (lib/settings-service.ts)
-- until this migration is applied everywhere, prod included. Record 025 in the
-- remote ledger if applied out-of-band.
--
-- Safe to re-run (idempotent guard).
-- ─────────────────────────────────────────────────────────────────────────────

alter table user_settings
  add column if not exists theme_palette text;
