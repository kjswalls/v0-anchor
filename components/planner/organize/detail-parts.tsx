'use client';

import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconPicker } from '@/components/primitives/icon-picker';
import { ColorSwatchPicker } from '@/components/primitives/color-swatch-picker';
import { accentColorForName } from '@/lib/accent-colors';
import { formatShort, parseDay, useNameDraft } from '@/lib/collections';
import { Eyebrow } from './primitives';
import { useEscapeRung } from './escape-ladder';
import { cn } from '@/lib/utils';

/**
 * The pieces every detail pane in the Organize console is built from.
 *
 * Labels sit on one left rule and controls on one right rule — two clean
 * verticals down a 408px content column.
 */

/* ── the two columns ──────────────────────────────────────────────────── */

/**
 * List and detail, sized once so no section can drift.
 *
 * Below `md` the detail REPLACES the list; above it both are mounted and
 * selecting never navigates. The breakpoint is `md`, NOT `sm`, and that is load
 * bearing: ResponsiveModal hands over to the vaul bottom sheet at useIsMobile's
 * 768px, so `sm` (640px) would put the two-pane desktop layout inside a bottom
 * sheet for a 128px band.
 *
 * Same components either way — the only difference is whether the list stays
 * mounted beside the detail. Which is why the LIST ROW has to carry the full
 * state (colour, name, pill, count) rather than leaning on an editor that may
 * not be there.
 */
export function ListColumn({
  eyebrow,
  count,
  hasSelection,
  filter,
  children,
  footer,
}: {
  eyebrow: string;
  /** Rows currently SHOWING — so it reads as a match count while filtering. */
  count: number;
  hasSelection: boolean;
  /** The section filter. Always mounted when given, per the layout law below. */
  filter?: {
    value: string;
    onChange: (next: string) => void;
    /** Names the scope: `Filter routines…`. */
    placeholder: string;
    testId: string;
  };
  children: React.ReactNode;
  /** The create row — pinned outside the scroller. */
  footer?: React.ReactNode;
}) {
  return (
    <div
      data-testid="organize-list"
      className={cn(
        // 300px is a DESKTOP number, and pinning it below `md` put content off
        // the side of a phone: the plate hands over to a vaul bottom sheet whose
        // wrapper is `overflow-x-hidden`, so a 180px rail plus a shrink-0 300px
        // list is 480px of unpannable content in a 393px sheet — the add button,
        // the count column, the state pill and the drill-in chevron all live in
        // the clipped 119px. `md:flex-none` restores exactly `shrink-0` above the
        // breakpoint, so the 180 | 300 | 456 arithmetic is untouched; `min-w-0`
        // also drops the min-content floor the fixed width imposed on the row.
        'border-border flex min-h-0 min-w-0 flex-1 flex-col border-r md:w-[300px] md:flex-none',
        hasSelection && 'hidden md:flex'
      )}
    >
      <div className="flex h-[30px] shrink-0 items-center gap-2 px-[15px]">
        <Eyebrow className="flex-1">{eyebrow}</Eyebrow>
        {/* The count lives HERE and in the detail meta line — never in the rail,
            where it would reflow as data loads and join a tab's accessible name. */}
        <span className="text-muted-foreground font-num text-2xs">{count}</span>
      </div>

      {filter && <FilterRow {...filter} />}

      {/* Plain overflow-y-auto: <ScrollArea> silently drops max-h. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* Centralised so all five sections cannot word it five ways — and so a
            section that forgets the branch cannot show "No routines yet." to
            someone who has twelve and typed a typo. */}
        {filter?.value && count === 0 ? (
          <p className="text-muted-foreground px-[7px] pt-2 text-xs">
            Nothing matches &ldquo;{filter.value}&rdquo;.
          </p>
        ) : (
          children
        )}
      </div>
      {footer}
    </div>
  );
}

/**
 * The section filter — one field, filtering the CURRENT section only.
 *
 * Always mounted, never revealed on a keypress, because of the layout law: the
 * empty and populated states are the same layout with rows missing, and a field
 * that appears when you type `/` would shove the whole list down by 30px at the
 * exact moment you are aiming at it.
 *
 * The query lives in the SECTION, so switching sections clears it — Radix
 * unmounts the outgoing panel's subtree, and that is the behaviour worth having
 * anyway: a filter still narrowing a list you walked away from is a list that
 * looks half-empty for no visible reason.
 */
function FilterRow({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  testId: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // Rung: clear the query. Claimed only while this field holds focus AND has
  // something to clear, so Escape on an empty field still closes the plate — a
  // rung that swallowed every press would strand the keyboard user and exhaust
  // the e2e closeManager helpers' four-press budget.
  useEscapeRung(() => {
    if (!value || document.activeElement !== ref.current) return false;
    onChange('');
    return true;
  });

  return (
    <div className="border-border flex h-[30px] shrink-0 items-center border-b px-[15px]">
      <input
        ref={ref}
        data-organize-filter=""
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Into the results, so `/ type ↓ ↵` is one uninterrupted gesture.
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.currentTarget
              .closest('[data-testid="organize-list"]')
              ?.querySelector<HTMLElement>('[data-organize-row]')
              ?.focus();
          }
        }}
        className="text-foreground placeholder:text-muted-foreground w-full min-w-0 border-0 bg-transparent p-0 text-sm outline-none"
      />
    </div>
  );
}

export function DetailColumn({
  hasSelection,
  children,
}: {
  hasSelection: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="organize-detail"
      className={cn(
        'min-w-0 flex-1 overflow-y-auto px-6 py-5',
        !hasSelection && 'hidden md:block'
      )}
    >
      {children}
    </div>
  );
}

/** The arrival state: the section's teaching sentence, left-aligned at the top. */
export function TeachingLine({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground max-w-[46ch] text-sm">{children}</p>;
}

/* ── identity ─────────────────────────────────────────────────────────── */

/**
 * Icon + name + colour, and the meta line beneath it.
 *
 * THE NAME IS BUFFERED, not written per keystroke, and that is not a
 * performance nicety: every update action stamps a history label and set()s,
 * and the subscriber deep-clones the whole snapshot on every change — so a
 * live-bound input turns renaming "Morning kickoff" into ~15 undo entries and
 * ~15 PATCHes, evicting the user's real history from a 50-deep stack.
 * Committed on blur and on Enter; Escape resets; blank or unchanged reverts.
 *
 * `editable=false` renders a static title plus one honest sentence instead of a
 * disabled input. Projects and habit groups are referenced BY NAME by their
 * children, so renaming orphans them — parked at the data-model level until the
 * stable-id migration (Phase 0). A disabled input reads as a bug; a sentence
 * reads as a decision.
 */
export function IdentityRow({
  id,
  name,
  icon,
  color,
  label,
  testPrefix,
  editable,
  parkedNote,
  meta,
  onPatch,
}: {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  /** "Routine", "Program", … — used for the control aria-labels. */
  label: string;
  testPrefix: string;
  editable: boolean;
  /** Shown under the meta line when `editable` is false. */
  parkedNote?: string;
  /** `Routine · 6 items · in 1 program` — numerals in font-num. */
  meta: React.ReactNode;
  onPatch: (patch: { name?: string; icon?: string; color?: string }) => void;
}) {
  const nameDraft = useNameDraft(id, name, (next) => onPatch({ name: next }));
  const ref = useRef<HTMLInputElement>(null);

  // Rung: put the name back the way it was. Only claimed when the field is
  // focused AND actually dirty, so Escape on a settled pane still leaves.
  useEscapeRung(() => {
    if (nameDraft.draft === name || document.activeElement !== ref.current) return false;
    nameDraft.reset();
    return true;
  });

  return (
    <div>
      <div className="flex h-8 items-center gap-3">
        <IconPicker value={icon} name={name} onSelect={(next) => onPatch({ icon: next })} />

        {editable ? (
          <input
            ref={ref}
            value={nameDraft.draft}
            onChange={(e) => nameDraft.setDraft(e.target.value)}
            onBlur={nameDraft.commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                nameDraft.commit();
                e.currentTarget.blur();
              }
            }}
            aria-label={`${label} name`}
            data-testid={`${testPrefix}-name-input`}
            // Borderless, styled as the heading it is. The well only appears
            // under focus, so a settled pane reads as a title rather than a form.
            className="text-foreground focus:bg-surface-3 -mx-1 min-w-0 flex-1 truncate rounded-[5px] border-0 bg-transparent px-1 py-0.5 text-lg font-semibold outline-none focus:shadow-[var(--shadow-inset-well)]"
          />
        ) : (
          <span
            title={name}
            data-testid={`${testPrefix}-name`}
            className="text-foreground min-w-0 flex-1 truncate text-lg font-semibold"
          >
            {name}
          </span>
        )}

        <ColorSwatchPicker
          value={color}
          fallback={accentColorForName(name)}
          onSelect={(next) => onPatch({ color: next })}
          aria-label={`${label} color`}
        />
      </div>

      <p
        className="text-muted-foreground mt-1.5 text-2xs"
        data-testid={`${testPrefix}-meta`}
      >
        {meta}
      </p>

      {!editable && parkedNote && (
        <p className="text-muted-foreground mt-1.5 max-w-[58ch] text-xs">{parkedNote}</p>
      )}
    </div>
  );
}

/* ── create ───────────────────────────────────────────────────────────── */

/**
 * The create row, pinned at the FOOT of the list column and outside the
 * scroller, so the list never jumps under the cursor and the row never scrolls
 * away.
 *
 * UNCONDITIONALLY MOUNTED — this is law, not preference. The e2e suite fills
 * `{kind}-new-name` with no preceding click (`programs.spec.ts:111-112`), so
 * making it conditional times out every container-creating test in both spec
 * files. `disabled` gates the button, never the row's existence.
 */
export function DraftRow({
  placeholder,
  addLabel,
  testPrefix,
  disabled,
  canAdd,
  autoFocus,
  onAdd,
}: {
  placeholder: string;
  addLabel: string;
  testPrefix: string;
  /** Creation is unavailable (feature flag off, or the store is still loading). */
  disabled?: boolean;
  /**
   * Extra per-name validity beyond "not blank" — item types use it for the slug
   * rules (shape, reserved words, uniqueness). Phase 3 makes those rules SPEAK;
   * until then this only greys the button out, which is what the dialog it
   * replaces does today.
   */
  canAdd?: (name: string) => boolean;
  autoFocus?: boolean;
  onAdd: (name: string, icon: string | undefined) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const ref = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const valid = !!trimmed && !disabled && (!canAdd || canAdd(trimmed));

  // Rung: clearing a half-typed name is a step back; leaving is the next one.
  useEscapeRung(() => {
    if (!name || document.activeElement !== ref.current) return false;
    setName('');
    return true;
  });

  const submit = () => {
    if (!valid) return;
    onAdd(trimmed, icon);
    setName('');
    setIcon(undefined);
  };

  return (
    <div className="border-border flex h-11 shrink-0 items-center gap-2 border-t px-[15px]">
      <IconPicker value={icon} name={name} onSelect={setIcon} />
      <Input
        ref={ref}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        aria-label={`${addLabel} name`}
        data-testid={`${testPrefix}-new-name`}
        className="h-[26px] flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!valid}
        aria-label={addLabel}
        data-testid={`${testPrefix}-add`}
        className="bg-surface-3 text-muted-foreground hover:text-foreground hover-wash flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ── a day ────────────────────────────────────────────────────────────── */

/**
 * The console's ONE calendar control — a routine's resume date and both ends of
 * a program's range.
 *
 * One component rather than three near-copies, because each carries the same
 * two rules and each would be wrong in a different way if it drifted:
 *
 * 1. WRITES WITH `format`, never `toDateStr`. react-day-picker hands back a
 *    browser-LOCAL-midnight Date, and re-reading that instant in another zone
 *    shifts it to the previous day. A picked day is a wall-calendar choice, not
 *    an instant. (Phase 1 of programs-routines shipped that bug once.)
 * 2. `disabledDays` is a v9 matcher, typed as the two single-key shapes rather
 *    than `{before?, after?}` — both-optional matches no member of the library's
 *    Matcher union, and `DateInterval` (which requires both) disables the days
 *    BETWEEN them, the exact opposite of what a bound wants.
 */
export function DayField({
  label,
  placeholder,
  value,
  testId,
  clearLabel,
  disabledDays,
  align = 'start',
  onChange,
}: {
  /** Inline prefix inside the trigger ("Starts", "Ends"). Omit for a bare date. */
  label?: string;
  placeholder: string;
  value?: string;
  testId: string;
  clearLabel: string;
  disabledDays?: { before: Date } | { after: Date };
  align?: 'start' | 'end';
  onChange: (next: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            className="border-border text-foreground hover:bg-accent flex h-[26px] items-center gap-1.5 rounded-[5px] border px-2 text-sm"
          >
            {label && <span className="text-muted-foreground">{label}</span>}
            {value ? formatShort(value) : <span className="text-muted-foreground">{placeholder}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-[10px] p-0" align={align}>
          <Calendar
            mode="single"
            selected={parseDay(value)}
            disabled={disabledDays}
            onSelect={(date) => {
              onChange(date ? format(date, 'yyyy-MM-dd') : undefined);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={clearLabel}
          data-testid={`${testId}-clear`}
          className="text-muted-foreground hover:text-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ── chrome ───────────────────────────────────────────────────────────── */

/** Below `md` the detail replaces the list, so it needs a way back. */
export function BackRow({
  label,
  testId,
  onBack,
}: {
  label: string;
  testId: string;
  onBack: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      data-testid={testId}
      className="text-muted-foreground hover:text-foreground -ml-1 mb-3 flex h-8 items-center gap-1.5 self-start text-sm md:hidden"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

/**
 * The delete zone: label left, outline button right, consequence beneath.
 *
 * `destructive` fills the button, and is spent on exactly one thing in the whole
 * console — the item-type delete, which is the only one that genuinely cannot be
 * undone. Dressing all five the same way is what taught the user to read none of
 * them.
 */
export function DangerZone({
  label,
  consequence,
  testId,
  destructive = false,
  onDelete,
}: {
  label: string;
  consequence: React.ReactNode;
  testId: string;
  destructive?: boolean;
  onDelete: () => void;
}) {
  return (
    <div>
      <div className="bg-border my-4 h-px" />
      <div className="flex items-center gap-4">
        <span className="text-foreground flex-1 text-sm font-medium">{label}</span>
        <button
          type="button"
          onClick={onDelete}
          data-testid={testId}
          className={cn(
            'h-[26px] shrink-0 rounded-[5px] px-3 text-sm',
            destructive
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'text-destructive border-destructive/40 hover:bg-destructive/10 border'
          )}
        >
          Delete
        </button>
      </div>
      <p className="text-muted-foreground mt-2 max-w-[58ch] text-xs">{consequence}</p>
    </div>
  );
}
