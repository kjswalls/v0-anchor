import {
  Activity, AlarmClock, Anchor, Apple, Archive, AtSign, Award, Baby,
  Banknote, Battery, Bed, Beef, Bell, BellRing, Bike, Bird,
  Book, BookOpen, Bookmark, Brain, Briefcase, Brush, Bug, Building2,
  Bus, Calculator, Calendar, CalendarCheck, CalendarDays, Camera, Car, Carrot,
  Cat, ChartColumn, ChartLine, ChartPie, Check, Church, CircleCheck, Clapperboard,
  ClipboardList, Clock, Cloud, CloudSun, Code, Coffee, Cog, Coins,
  Compass, Contact, Cookie, Cpu, CreditCard, Cross, Crown, CupSoda,
  Database, Dices, Dog, DollarSign, Drama, Droplets, Dumbbell, Eye,
  Feather, FileText, Film, Fish, Flag, Flame, Flower2, Folder,
  FolderOpen, Footprints, Gamepad2, Gift, Glasses, Globe, Goal, GraduationCap,
  Grid2x2, Guitar, Hammer, Handshake, Hash, Headphones, Heart, HeartPulse,
  Hourglass, House, Image, Inbox, Infinity, Key, Landmark, Layers,
  LayoutGrid, Leaf, Library, Lightbulb, Link, ListChecks, ListTodo, Lock,
  Mail, Map, MapPin, Medal, Megaphone, MessageCircle, MessageSquare, Mic,
  Moon, Mountain, Music, Music2, Navigation, Newspaper, NotebookPen, Package,
  Paintbrush, Palette, Paperclip, PawPrint, PenTool, Pencil, Percent, PersonStanding,
  Phone, Piano, PiggyBank, Pill, Pin, Pizza, Plane, Plug,
  Podcast, Puzzle, Radio, Rainbow, Receipt, Recycle, RefreshCw, Repeat,
  Repeat2, Rocket, Ruler, Salad, School, Scissors, Send, Server,
  Settings, Shield, ShieldCheck, Ship, Shirt, ShoppingBag, ShoppingBasket, ShoppingCart,
  Smile, Snowflake, Sparkle, Sparkles, Sprout, Star, Stethoscope, Store,
  Sun, Sunrise, Sunset, Syringe, Tag, Target, Terminal, Thermometer,
  Ticket, Timer, TramFront, TreePine, Trees, TrendingUp, Trophy, Tv,
  User, UserPlus, Users, Utensils, Video, Wallet, Waves, Wifi,
  Wind, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * Lucide icons for categories (projects + habit groups), Linear-style —
 * replaces the emoji palette in group headings, pills, and rows.
 *
 * A category's glyph is stored in its existing `emoji` free-text field (no DB
 * migration): either a real emoji (legacy data) OR an icon token
 * `icon:<PascalName>` written by the icon picker. Rendering ALWAYS resolves to
 * a Lucide icon — a stored icon token wins; otherwise the icon is derived from
 * the category name so legacy emoji rows still show a sensible icon.
 *
 * The library is a CURATED ~195-icon set (explicit named imports, so the
 * bundler tree-shakes to just these). Deliberately not the full ~1.6k
 * lucide-react barrel: that whole set is ~160KB gzipped and, because this
 * module is imported by hot-path components (group headings, pills), it would
 * land in the main first-load bundle for every user. If a user ever needs an
 * icon outside this set, add it here or switch the picker to lucide's lazy
 * `DynamicIcon` — the stored `icon:<name>` token format stays the same.
 */

export const ICON_TOKEN_PREFIX = 'icon:';

export function isIconToken(glyph: string | null | undefined): glyph is string {
  return !!glyph && glyph.startsWith(ICON_TOKEN_PREFIX);
}

export function makeIconToken(pascalName: string): string {
  return `${ICON_TOKEN_PREFIX}${pascalName}`;
}

/** Curated library keyed by PascalCase name (shorthand — keys match imports). */
const ICON_LIBRARY: Record<string, LucideIcon> = {
  Activity, AlarmClock, Anchor, Apple, Archive, AtSign, Award, Baby,
  Banknote, Battery, Bed, Beef, Bell, BellRing, Bike, Bird,
  Book, BookOpen, Bookmark, Brain, Briefcase, Brush, Bug, Building2,
  Bus, Calculator, Calendar, CalendarCheck, CalendarDays, Camera, Car, Carrot,
  Cat, ChartColumn, ChartLine, ChartPie, Check, Church, CircleCheck, Clapperboard,
  ClipboardList, Clock, Cloud, CloudSun, Code, Coffee, Cog, Coins,
  Compass, Contact, Cookie, Cpu, CreditCard, Cross, Crown, CupSoda,
  Database, Dices, Dog, DollarSign, Drama, Droplets, Dumbbell, Eye,
  Feather, FileText, Film, Fish, Flag, Flame, Flower2, Folder,
  FolderOpen, Footprints, Gamepad2, Gift, Glasses, Globe, Goal, GraduationCap,
  Grid2x2, Guitar, Hammer, Handshake, Hash, Headphones, Heart, HeartPulse,
  Hourglass, House, Image, Inbox, Infinity, Key, Landmark, Layers,
  LayoutGrid, Leaf, Library, Lightbulb, Link, ListChecks, ListTodo, Lock,
  Mail, Map, MapPin, Medal, Megaphone, MessageCircle, MessageSquare, Mic,
  Moon, Mountain, Music, Music2, Navigation, Newspaper, NotebookPen, Package,
  Paintbrush, Palette, Paperclip, PawPrint, PenTool, Pencil, Percent, PersonStanding,
  Phone, Piano, PiggyBank, Pill, Pin, Pizza, Plane, Plug,
  Podcast, Puzzle, Radio, Rainbow, Receipt, Recycle, RefreshCw, Repeat,
  Repeat2, Rocket, Ruler, Salad, School, Scissors, Send, Server,
  Settings, Shield, ShieldCheck, Ship, Shirt, ShoppingBag, ShoppingBasket, ShoppingCart,
  Smile, Snowflake, Sparkle, Sparkles, Sprout, Star, Stethoscope, Store,
  Sun, Sunrise, Sunset, Syringe, Tag, Target, Terminal, Thermometer,
  Ticket, Timer, TramFront, TreePine, Trees, TrendingUp, Trophy, Tv,
  User, UserPlus, Users, Utensils, Video, Wallet, Waves, Wifi,
  Wind, Wrench, Zap,
};

/** Exact-name lookup in the curated library; undefined if the name is unknown. */
export function getIconByName(pascalName: string): LucideIcon | undefined {
  return ICON_LIBRARY[pascalName];
}

/** All library entries, sorted — the icon picker iterates this. */
export const ALL_ICON_ENTRIES: [string, LucideIcon][] = Object.entries(ICON_LIBRARY).sort(
  (a, b) => a[0].localeCompare(b[0])
);

/** Nice defaults shown before the user types a search in the icon picker. */
export const FEATURED_ICON_NAMES: string[] = [
  'Briefcase', 'House', 'Leaf', 'HeartPulse', 'Heart', 'Dumbbell', 'BookOpen',
  'GraduationCap', 'Target', 'Star', 'Flame', 'Sparkles', 'Rocket', 'Lightbulb',
  'Brain', 'Pencil', 'Palette', 'Music', 'Gamepad2', 'Footprints', 'Apple',
  'Coffee', 'Sprout', 'DollarSign', 'ChartColumn', 'Wrench', 'Code', 'Bell',
  'Gift', 'Rainbow', 'Sun', 'Moon', 'Clock', 'Calendar', 'CircleCheck', 'Repeat',
];

/** Curated set for name-derivation hashing (a broad, recognizable subset). */
const CATEGORY_ICONS: LucideIcon[] = [
  Briefcase, Leaf, House, BookOpen, Dumbbell, Target, Star, Heart, Flame,
  Sparkles, Palette, Music, Footprints, Brain, Lightbulb, Pencil, Gamepad2,
  Apple, Coffee, Sprout, Bell, ChartColumn, Wrench, GraduationCap, DollarSign,
  Rainbow, Rocket, Gift, Sun, Moon,
];

/** Exact (case-insensitive) name → icon, covering the default categories. */
const NAME_ICONS: Record<string, LucideIcon> = {
  work: Briefcase,
  wellness: HeartPulse,
  personal: House,
  tasks: CircleCheck,
  habits: Repeat,
  'no project': Inbox,
  anytime: Clock,
};

/** Substring keyword → icon, first match wins. */
const KEYWORD_ICONS: [string[], LucideIcon][] = [
  [['gym', 'fitness', 'workout', 'exercise', 'strength'], Dumbbell],
  [['read', 'book'], BookOpen],
  [['money', 'finance', 'budget', 'invest'], DollarSign],
  [['health', 'wellness', 'care'], HeartPulse],
  [['home', 'house', 'chore'], House],
  [['work', 'job', 'office'], Briefcase],
  [['study', 'school', 'learn', 'course', 'class'], GraduationCap],
  [['write', 'writing', 'journal', 'note'], Pencil],
  [['run', 'walk', 'steps'], Footprints],
  [['music', 'song', 'practice'], Music],
  [['art', 'design', 'draw', 'paint'], Palette],
  [['game', 'gaming', 'play'], Gamepad2],
  [['food', 'meal', 'nutrition', 'diet', 'cook'], Apple],
  [['coffee'], Coffee],
  [['garden', 'plant'], Sprout],
  [['code', 'dev', 'build', 'project'], Wrench],
  [['idea', 'brainstorm', 'think'], Lightbulb],
  [['goal', 'focus'], Target],
  [['morning'], Sun],
  [['night', 'evening', 'sleep'], Moon],
  [['launch', 'ship', 'startup'], Rocket],
];

/** Small stable string hash (djb2) so fallback icons never shuffle. */
function hashName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (h * 33) ^ name.charCodeAt(i);
  return Math.abs(h);
}

/** Deterministic icon for a category name — every name resolves to something. */
export function getCategoryIcon(name: string): LucideIcon {
  const key = name.trim().toLowerCase();
  const exact = NAME_ICONS[key];
  if (exact) return exact;
  for (const [keywords, icon] of KEYWORD_ICONS) {
    if (keywords.some((k) => key.includes(k))) return icon;
  }
  return CATEGORY_ICONS[hashName(key) % CATEGORY_ICONS.length];
}

/**
 * Resolve a category's glyph to a Lucide icon: a stored `icon:<name>` token
 * wins; otherwise derive from the name (legacy emoji rows fall through here).
 */
export function resolveCategoryIcon(glyph: string | null | undefined, name: string): LucideIcon {
  if (isIconToken(glyph)) {
    const icon = getIconByName(glyph.slice(ICON_TOKEN_PREFIX.length));
    if (icon) return icon;
  }
  return getCategoryIcon(name);
}

/**
 * Category glyph for group headings, pills, and rows — ALWAYS a Lucide icon.
 * Pass the stored glyph (`project.emoji` / `group.emoji`) as `glyph` to honor
 * a picked icon; `name` drives the derived fallback. createElement (not
 * <Icon />) so the React Compiler doesn't read the dynamic lookup as a
 * component created during render.
 *
 * Color knob: the default `text-muted-foreground` below sets the Linear-style
 * gray; callers pass `className="text-primary"` to render lime (group headings
 * do this).
 */
export function CategoryIcon({
  glyph,
  name,
  className,
}: {
  glyph?: string | null;
  name: string;
  className?: string;
}) {
  return createElement(resolveCategoryIcon(glyph, name), {
    className: cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', className),
  });
}
