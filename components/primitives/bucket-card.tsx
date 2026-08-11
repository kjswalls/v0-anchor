'use client';

import { ChevronDown, Timer, Sunrise, Sun, Moon } from 'lucide-react';
import { AddIconButton } from '@/components/primitives/add-icon-button';
import { CountBadge } from '@/components/primitives/pills';
import { BUCKET_ORDER } from '@/lib/day-items';
import type { TimeBucket } from '@/lib/planner-types';
import { useViewStore, type BucketStyle } from '@/lib/view-store';
import { cn } from '@/lib/utils';

export const BUCKET_META: Record<
  TimeBucket,
  { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  anytime: { label: 'Anytime', icon: Timer, tint: 'text-anytime' },
  morning: { label: 'Morning', icon: Sunrise, tint: 'text-morning' },
  afternoon: { label: 'Afternoon', icon: Sun, tint: 'text-afternoon' },
  evening: { label: 'Evening', icon: Moon, tint: 'text-evening' },
};

/**
 * The caption's ink, shared with GroupSection's canvas variant so a bucket name
 * and a "Habits" / project heading are one voice. Both are deliberately quieter
 * than the rows they label: in a view whose job is scanning tasks, the furniture
 * naming the groups should be the last thing the eye lands on, not the first.
 * `meta.tint` is no longer spent here, and neither is a ring — the caption is
 * a glyph and a word, at the same weight the Braindump gives a project.
 */
export const BUCKET_LABEL_INK = 'text-muted-foreground/70';

/**
 * Geometry per style × density. One table so day and week cannot drift.
 *
 * VERTICAL RHYTHM lives in two numbers, `capGap` and `gap`, plain px rather
 * than Tailwind classes because the rail reads `gap` too and a class plus a
 * duplicated literal is how those silently drift apart.
 *
 *   capGap  caption → content
 *   gap     this bucket's content → the next bucket's caption
 *
 * `gap` is applied by the PARENT as flex `gap`, never by this component as
 * padding or margin, and that is load-bearing rather than stylistic. The
 * section's border box is the `{bucket}` droppable's rect, so any trailing
 * space inside it pushes the bare bucket's centre DOWN, toward
 * `scheduled:{bucket}:empty` sitting below. Measured on an empty bucket
 * mid-drag with 30px of trailing padding: the bare centre landed 21px from
 * `unscheduled:{bucket}` and 22px from `scheduled:{bucket}:empty` — a 1px
 * margin on a closestCenter decision, i.e. a coin flip between "no time" and
 * "9am", which is exactly the silent mis-resolution lib/dnd/CONTRACT.md warns
 * about. Margin does not help: a flex item is a block-formatting-context root,
 * so a child's bottom margin cannot collapse out of it and the rect still grows.
 * Flex `gap` is the only one of the three that puts the space BETWEEN the boxes
 * instead of inside one, which is why the views read `bucketGap()` below.
 *
 * The rail then has to bridge that space itself — it is absolutely positioned,
 * so it bleeds `-gap` past the section's bottom edge to meet the next section's
 * slice. The two ENDS of the stack are the exceptions; see `isFirst`/`isLast`
 * in the render. The current-bucket mark deliberately does NOT bleed: it stops
 * at the content, so its length reports how much of the day is under you rather
 * than how much air there is.
 */
const GEO = {
  /**
   * Rail and dots, from day-schedule. One hairline runs the height of the day
   * in a gutter, each bucket pins a solid bead to it, and the bucket itself is
   * a card parked BESIDE the line — `cardX` clears the bead rather than
   * overlapping it. An earlier pass threaded the card under the rail (the line
   * crossing its shoulder); this is the flat reading of the same idea, and it
   * matches how the schedule view already draws a day.
   */
  spine: {
    full: {
      rail: 11, // x of the 1px hairline
      /**
       * The schedule view's start bead, verbatim: a 6px solid disc on the line,
       * punched out of whatever it sits on by a 1px halo. It marks WHERE on the
       * day this bucket begins, which is the rail's job — identity moved into
       * the caption, where the glyph now sits beside the name.
       */
      dot: 6,
      /** The caption row's vertical centre from the section's top — half the
       *  26px header. The dot is positioned against the SECTION (its x is the
       *  rail's), so it cannot inherit that centre from the header's box. */
      dotY: 13,
      node: 0,   // tray-only: the spine has a dot, not an icon-bead
      /** CategoryIcon's size — a bucket glyph and a project glyph are one thing. */
      nodeIcon: 'h-3.5 w-3.5',
      /**
       * The card's left edge, 4px clear of the dot's (8..14). The rail runs in
       * the gutter BESIDE the card rather than through it: the card is parked
       * on the line, not threaded under it.
       */
      cardX: 18,
      /**
       * The caption is the rows' column HEADER, so it indents to their columns
       * rather than sitting on the card's outer edge:
       *
       *   pl  40  = 18 cardX + 14 body pad + 8 TaskRow px-2 → the checkbox's x
       *   pr  22  =            14 body pad + 8 TaskRow px-2 → the trailing
       *                                                       pills' right edge
       *
       * The glyph lands on the checkbox column and the + on the pill column, so
       * both ends of the caption are verticals the rows already draw. Flush at
       * cardX (what this was) aligned the LABEL to the checkbox instead, which
       * left the glyph and the label straddling that column without either one
       * touching it, and hung the + 14px past where any row content ends.
       */
      head: 'h-[26px] pl-10 pr-[22px] gap-2',
      /** Glyph → label, sized so the label lands on the TITLE's x:
       *  40 + 16 (checkbox) + 12 (row gap-3) = 68, minus 40 + 14 (glyph). */
      labelGap: 'gap-3.5',
      /** 18 + 14 = 32 row box; TaskRow's px-2 then lands the checkbox at 40. */
      body: 'pl-[14px] pr-[14px] py-4',
      capGap: 6,
      gap: 30,
      /** How far the last bucket's rail takes to dissolve. See `isLast`. */
      tail: 24,
      slotOpen: 'min-h-11',
      slotArmed: 'min-h-[60px]',
      radius: 'rounded-[14px]',
      sliver: 8,
      add: 'md' as const,
    },
    mini: {
      rail: 8,
      dot: 5,
      dotY: 10,  // half the 20px header
      node: 0,
      nodeIcon: 'h-3 w-3',
      cardX: 13,
      // Same arithmetic as full, mini's numbers: 13 + 8 + 8 = 29 (checkbox),
      // 8 + 8 = 16 (pill edge). The glyph is 12px here rather than 14, so the
      // label gap is 2px WIDER than full's — the row's own 16 + 12 to the title
      // is density-independent (TaskRow's compact mode only changes py).
      head: 'h-5 pl-[29px] pr-4 gap-1',
      labelGap: 'gap-4',             // 29 + 16 + 12 = 57, minus 29 + 12
      body: 'pl-2 pr-2 py-2',        // 13 + 8 = 21 row box → checkbox at 29
      capGap: 4,
      // Four of these stack in a 240px column, so the day view's 30 would cost
      // 120px of a column that also has to hold a 60px header.
      gap: 16,
      slotOpen: 'min-h-7',
      slotArmed: 'min-h-[38px]',
      radius: 'rounded-[10px]',
      sliver: 6,
      add: 'sm' as const,
      tail: 14,
    },
  },
  /**
   * No rail; the glyph sits inline in the caption and the rows get a tray.
   * Untouched by the parked-card rework — `dot`/`dotY` exist here only so both
   * variants share one shape, and the render never reads them outside the
   * spine branch.
   */
  tray: {
    full: {
      rail: 0,
      dot: 0,
      dotY: 0,
      // Only drawn as a disc when current. Absolutely positioned and pulled
      // 4px left so growing 14 → 22px cannot reflow the caption row.
      node: 22,
      nodeIcon: 'h-3.5 w-3.5',
      // 1 (the tray's own border) + 14 (its padding) + 8 (TaskRow's px-2).
      // The border counts: forgetting it is what put the label 1px off the
      // checkboxes, which is visible on a 22px caption sitting right above them.
      // 1 (the tray's own border) + 16 (pr-4) + 8 = 25 on the right, mirroring
      // the pl. No inline glyph here (the tray's lives outside, absolutely
      // positioned), so the label itself takes the checkbox column and there is
      // no second vertical for `labelGap` to hit.
      head: 'h-[22px] pl-[23px] pr-[25px] gap-1.5',
      labelGap: 'gap-1.5',
      tail: 0,
      cardX: 0,
      body: 'pl-[14px] pr-4 py-4',
      capGap: 6,
      // The tray draws its own edge, so it needs less air between buckets than
      // the spine does to read as separate — the border is already doing it.
      gap: 20,
      slotOpen: 'min-h-11',
      slotArmed: 'min-h-[60px]',
      radius: 'rounded-[20px]',
      sliver: 8,
      add: 'md' as const,
    },
    mini: {
      rail: 0,
      dot: 0,
      dotY: 0,
      node: 16,
      nodeIcon: 'h-3 w-3',
      head: 'h-4 pl-[17px] pr-[15px] gap-1', // 1 (border) + 8 + 8 / 1 + 6 + 8
      labelGap: 'gap-1',
      tail: 0,
      cardX: 0,
      body: 'pl-2 pr-1.5 py-2',
      capGap: 6,
      gap: 8,
      slotOpen: 'min-h-7',
      slotArmed: 'min-h-[38px]',
      radius: 'rounded-xl',
      sliver: 6,
      add: 'sm' as const,
    },
  },
};

/**
 * The space a stack of buckets should put BETWEEN its sections, as a flex
 * `gap`. Single-sourced here because the rail's downward bleed has to match it
 * exactly or the day's line breaks at every gap.
 */
export function bucketGap(variant: BucketStyle, density: 'full' | 'mini'): number {
  return GEO[variant][density].gap;
}

/**
 * The last slice's dissolve. A hard stop needs something to stop AGAINST — the
 * top of the rail has the first bead, the bottom has nothing — and giving the
 * line an end-cap would add a mark to a view this pass has otherwise been
 * quieting. So the line runs the length of the last bucket and thins out.
 */
const tailMask = (px: number) => `linear-gradient(to bottom, #000 calc(100% - ${px}px), #0000)`;

interface BucketCardProps {
  bucket: TimeBucket;
  count: number;
  onAdd?: (bucket: TimeBucket, type: 'task' | 'habit') => void;
  /** "You are here". Reads as a lime rail segment ('spine') or a lime disc plus
   *  a rule down the tray's left wall ('tray') — never a ring in either. */
  isCurrent?: boolean;
  /** Drop highlight while dragging over. */
  isDropTarget?: boolean;
  /** A drag is in progress anywhere: open the latent slot. See the note below. */
  dragging?: boolean;
  /** Nothing at all in this bucket — collapses to the caption row. */
  isEmpty?: boolean;
  /** Caps the scrolling content area (week columns). */
  contentMaxH?: number;
  density?: 'full' | 'mini';
  /** Which drawing of a bucket. Defaults to the rail; see BucketStyle. */
  variant?: BucketStyle;
  children: React.ReactNode;
  className?: string;
}

/**
 * A bucket: a stretch of the day, with its rows on an object.
 *
 * TWO DRAWINGS, ONE STRUCTURE (`variant`, from view-store's BucketStyle). They
 * differ only in where the glyph lives and what the body is at rest —
 * everything below is shared, which is the whole reason this is a prop and not
 * two components:
 *
 *   'spine'  Rail and dots. One 1px hairline runs the height of the day in an
 *            11px gutter and this section draws its own contiguous slice of it,
 *            so the line crosses the gaps and the column reads as one
 *            continuous day. A 6px bead pins each bucket's start to that line —
 *            day-schedule's own marker, not an icon — and the rows sit beside
 *            it on a floating card, parked clear of the bead rather than
 *            threaded under it. The caption stays on the canvas, sharing the
 *            card's left edge.
 *   'tray'   No rail. The icon sits inline in the caption and the rows live in
 *            a bordered, recessed tray — the Figma mockup's depth ordering,
 *            restored (canvas → tray is a real 0.022 L step in both themes; the
 *            mockup's own 0.010 only ever read because a #EEEDED border bounded
 *            it, and light mode keeps that border here too).
 *
 * WHY THE CARD. Rows running the container's full width with only a hairline
 * beside them is the list view with a rail added; what a bucket lacked was
 * object-ness. The card supplies it without a max-width — a narrower centred
 * column was tried and reverted, because the moat read as the view having
 * shrunk rather than as the buckets having become objects.
 *
 * WHY THE COUNT AND THE + ARE ON THE RIGHT. They used to sit against the name,
 * on the argument that at full width a flex spacer would park them ~950px from
 * the word they belong to. That is true of a caption labelling a POINT and
 * false of one heading an OBJECT: the card gives the row a right edge, so the
 * controls hang off the card rather than drifting in open canvas — the
 * Braindump header's arrangement.
 *
 * WHY THE CAPTION IS INDENTED. Not for air: every one of its four x's is a
 * vertical the rows below already draw. The glyph takes the checkbox column,
 * the label the title column, and the + the trailing-pill column, so the
 * caption reads as the card's column header instead of as a label pasted on its
 * top-left corner. It also means the caption is the one place the whole bucket
 * can be measured from — see GEO's head/labelGap/body arithmetic, which is the
 * single source for all of it.
 *
 * WHY NEITHER HAS A HEADER BAND. Once the glyph, name and count live outside
 * the body, the 45px band was holding a caption, not a surface — so its fill
 * and its bottom divider are gone in both, and an empty bucket costs 22px
 * instead of ~100.
 *
 * WHY THE CAPTION IS QUIETER THAN THE ROWS. It is furniture: it names a group
 * you already know the name of, in a view whose job is scanning what is IN the
 * group. So the label takes BUCKET_LABEL_INK (shared with GroupSection), the
 * bead ring is one neutral weight rather than four tints, and the only colour
 * left in the column is lime for "you are here" and whatever the rows carry.
 *
 * WHY THE SLOT OPENS ON DRAG. lib/dnd/CONTRACT.md needs the bare `{bucket}`
 * droppable to have a visible hover state, and four caption-only buckets put
 * their rects ~44px apart — closer than closestCenter can reliably separate. So
 * for the duration of a drag a recess opens: it restores the pitch and gives
 * the drop target a surface to light. In 'tray' the surface is already there
 * and only grows. It is never animated IN (the rect must be stable before the
 * first collision pass) — only its height and fill transition.
 *
 * WHY A COLLAPSED BUCKET STILL TAKES A DROP, AND WHAT IT DROPS ONTO. Collapsing
 * hides the CHILDREN, not the slot: under a drag a shut bucket opens the same
 * empty landing surface an empty one does. That deliberately leaves it without
 * its `unscheduled:{bucket}` and `scheduled:{bucket}:*` droppables, so a drop
 * resolves on the bare `{bucket}` id — which handle-drag-end maps to the exact
 * command `unscheduled:{bucket}` would have produced (bucket, no time), so the
 * outcome is identical and there is no second rect inside the shut card for
 * closestCenter to have to separate. The alternative — rendering the real rows
 * under a drag — would reflow the whole column at drag start, which is the one
 * thing the rect-stability contract forbids.
 *
 * WHY NEITHER USES A RING FOR "NOW". A ring is the grammar of focus. Both
 * variants give the current bucket a mark with EXTENT instead — the rail slice
 * swelling to lime for the bucket's whole box, or a lime rule down the tray's
 * left wall — so a busy current bucket shows a long rule and an empty one a
 * short tick. That is the difference between position and selection.
 *
 * The rail slice is drawn per-section rather than once on the parent because
 * each section must be `relative` to host its own absolutes, which makes it a
 * positioned element later in DOM order whose opaque card would paint over a
 * parent-level line. Within the section the rail is z-2 and the card z-1, which
 * is what puts the line ON the card rather than under it.
 */
export function BucketCard({
  bucket,
  count,
  onAdd,
  isCurrent,
  isDropTarget,
  dragging,
  isEmpty,
  contentMaxH,
  density = 'full',
  variant = 'spine',
  children,
  className,
}: BucketCardProps) {
  const meta = BUCKET_META[bucket];
  const Icon = meta.icon;
  const g = GEO[variant][density];
  const isSpine = variant === 'spine';
  // A boolean, not the array: every bucket card subscribes to this, and week
  // renders 28 of them. Selecting the array would re-render all of them
  // whenever any one bucket is toggled.
  const collapsed = useViewStore((s) => s.collapsedBuckets.includes(bucket));
  const toggleCollapsed = useViewStore((s) => s.toggleBucketCollapsed);
  const expandBucket = useViewStore((s) => s.expandBucket);

  // Read off BUCKET_ORDER rather than taken as props: both stacks (day-buckets
  // and week-buckets' columns) render exactly `BUCKET_ORDER.map(...)`, so an
  // index prop would be the same fact stated a third and fourth time, with two
  // more places for it to go stale.
  const isFirst = bucket === BUCKET_ORDER[0];
  const isLast = bucket === BUCKET_ORDER[BUCKET_ORDER.length - 1];

  // An empty bucket has nothing to shut, so it offers no control — a chevron
  // that toggles a stored flag with no visible effect is a dead affordance, and
  // worse here, because "shut" draws a sliver and an empty bucket draws
  // nothing, so collapsing would visibly ADD a mark. The stored flag survives a
  // bucket emptying and re-filling; it just isn't reachable while there is
  // nothing in there.
  const canCollapse = !isEmpty;
  const isShut = collapsed && canCollapse;

  // What sits under the caption, in priority order:
  //   dragging  → the slot (children suppressed while shut — see the note above)
  //   shut      → the sliver: this card, closed
  //   empty     → nothing. An empty bucket is its caption, which is the 22px
  //               that made the redesign worth doing.
  //   otherwise → the card
  const showSlot = dragging || (!isShut && !isEmpty);
  const showSliver = !dragging && isShut;

  return (
    <section
      data-testid="bucket-card"
      data-bucket={bucket}
      data-bucket-style={variant}
      data-current={isCurrent ? 'true' : 'false'}
      data-collapsed={collapsed ? 'true' : 'false'}
      data-drop-target={isDropTarget ? 'true' : 'false'}
      // No trailing space of its own — see the GEO note. The parent spaces
      // these with flex `gap`, sourced from bucketGap() so the rail's bleed
      // below and the actual space between sections cannot drift apart.
      className={cn('group/bucket relative isolate', className)}
    >
      {/* This section's slice of the day's rail. It bleeds `gap` past the
          section's bottom edge — the gap is a margin now, so the box no longer
          reaches — and meets the next section's slice exactly. That is what
          keeps the line unbroken across the gaps, which is the whole point of
          the variant.

          THE TWO ENDS. The line used to start at the top of the first section
          and run out into the container's bottom padding, so it overshot the
          beads at both ends — 13px of rail above the first one pointing at
          nothing, and 80-odd below the last one. Neither end is the same
          problem, so they don't get the same fix:

            top     starts at the FIRST bead's centre. There is nothing before
                    the day's first marker, and the bead (z-3, opaque, with its
                    1px halo) caps the line rather than being pinned to it.
            bottom  cannot stop at the LAST bead — the evening bucket's rows all
                    live below it, and a card with no line beside it reads as
                    having fallen off the day. So the slice runs the length of
                    the last bucket and dissolves over its final `tail` px: it
                    ends where the content does, without an end-cap. */}
      {isSpine && (
        <span
          aria-hidden
          className="absolute z-[2] w-px bg-[var(--bkt-spine)]"
          style={{
            left: g.rail,
            top: isFirst ? g.dotY : 0,
            bottom: isLast ? 0 : -g.gap,
            ...(isLast && { maskImage: tailMask(g.tail), WebkitMaskImage: tailMask(g.tail) }),
          }}
        />
      )}

      {/* "You are here", as a swell of the rail rather than a ring. It grows
          RIGHTWARD from the same left edge, so the line reads as one continuous
          edge that thickens rather than as a separate mark laid beside it.
          Its bottom stops at the content, not at the end of the box: the
          trailing pad belongs to the gap, and running lime through the gap
          would make the mark's length report padding instead of how much of
          the day is under you. An empty current bucket is a 22px tick.
          Its top follows the rail's (the bead, if this is the first bucket);
          its bottom does NOT take the tail dissolve, because lime never takes
          alpha in this app — and because a mark whose job is to measure has to
          have a definite end. It is 2px over the rail's 1px at the same x, so
          when the last bucket is the current one the lime simply covers the
          faded tail and the line ends crisply instead. */}
      {isSpine && isCurrent && (
        <span
          aria-hidden
          className="absolute z-[2] w-[2px] rounded-[1px] bg-primary"
          style={{ left: g.rail, top: isFirst ? g.dotY : 0, bottom: 0 }}
        />
      )}

      {/* The start bead, borrowed from day-schedule verbatim: a solid disc on
          the line, punched out of the ground it sits on by a 1px halo. It says
          WHERE on the day this bucket begins — which is all a rail marker
          should say. Identity moved into the caption, where the glyph now sits
          beside the name the way the Braindump's does. */}
      {isSpine && (
        <span
          aria-hidden
          className={cn(
            'absolute z-[3] rounded-full shadow-[0_0_0_1px_var(--canvas)] transition-colors',
            isCurrent || isDropTarget ? 'bg-primary' : 'bg-muted-foreground/45'
          )}
          style={{
            width: g.dot,
            height: g.dot,
            left: g.rail + 0.5 - g.dot / 2,
            top: g.dotY - g.dot / 2,
          }}
        />
      )}

      {/* The tray variant keeps its own inline glyph — no rail means no bead to
          replace, and its lime disc is the only "now" mark it has. */}
      {!isSpine && (
        <span
          aria-hidden
          className={cn(
            'absolute top-0 z-[3] grid place-items-center rounded-full transition-colors',
            'left-[-4px]',
            isCurrent ? 'bg-primary text-primary-foreground' : BUCKET_LABEL_INK
          )}
          style={{
            width: isCurrent ? g.node : g.node - 8,
            height: isCurrent ? g.node : g.node - 8,
            marginTop: isCurrent ? 0 : 4,
            marginLeft: isCurrent ? 0 : 4,
          }}
        >
          <Icon className={g.nodeIcon} />
        </span>
      )}

      {/* The caption sits on the canvas above the card, indented to the rows'
          own columns rather than to the card's edge: glyph over the checkboxes,
          label over the titles, + over the trailing pills (the arithmetic is in
          GEO's head/labelGap). It heads the card without being on it. A darker
          frame carrying the caption was tried here (the Braindump header's
          surface-3 capsule around a shadowed pill) and removed: a second ground
          behind every bucket made the furniture read heavier than the rows it
          was holding. */}
      <>
        {/* justify-between with two children, not a flex-1 spacer between four:
            the spacer took the header's own `gap` on BOTH sides, and a third
            helping of it landed between the count and the +, which is why those
            two read as unrelated controls rather than one cluster. Now `gap` is
            only the minimum between the name and the cluster, and the cluster
            sets its own. */}
        <header className={cn('flex items-center justify-between', g.head)}>
          {/* h3 wrapping the button, not the other way round: a heading is flow
              content and a button only takes phrasing content, so the usual
              accordion nesting is the only one that validates. The negative
              margin cancels the button's own padding, so the hover target grows
              around the glyph without moving it off the caption's x. */}
          <h3 className="flex min-w-0 items-center">
            {(() => {
              const inner = (
                <>
                  {isSpine && (
                    <Icon className={cn('flex-none', g.nodeIcon, BUCKET_LABEL_INK)} />
                  )}
                  {/* The current bucket steps up one tone, not to full ink. The
                      lime dot and the lime rail segment already say where you
                      are; this only keeps the caption from contradicting them. */}
                  <span
                    className={cn(
                      'truncate font-sans text-xs font-medium',
                      isCurrent ? 'text-muted-foreground' : BUCKET_LABEL_INK
                    )}
                  >
                    {meta.label}
                  </span>
                </>
              );
              // Glyph → label. This is what sets the label's x, and the label's
              // x is what has to equal the row TITLE's below (see GEO's
              // head/body arithmetic) — the header's own `gap` only spaces the
              // title block off the count and the +.
              const gap = g.labelGap;
              return canCollapse ? (
                <button
                  type="button"
                  data-testid="bucket-toggle"
                  aria-expanded={!isShut}
                  onClick={() => toggleCollapsed(bucket)}
                  className={cn(
                    '-mx-1 flex min-w-0 items-center rounded-[5px] px-1 py-0.5 transition-colors hover:bg-accent',
                    gap
                  )}
                >
                  {inner}
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      'h-3 w-3 flex-none text-muted-foreground/50 transition-transform',
                      isShut && '-rotate-90'
                    )}
                  />
                </button>
              ) : (
                <span className={cn('flex min-w-0 items-center', gap)}>{inner}</span>
              );
            })()}
          </h3>

          {/* Count and add live on the RIGHT edge, the Braindump header's
              arrangement: the name owns the left, the controls own the right,
              and the space between them is what tells you the caption spans an
              object rather than labelling a point. They are ONE cluster — a
              readout and the verb that changes it — so they sit at cluster
              spacing, not at the same distance the name is from both. */}
          <div className="flex flex-none items-center gap-1">
            <CountBadge
              count={count}
              testId="bucket-count"
              size={density === 'full' ? 'md' : 'sm'}
            />
            {onAdd && (
              <AddIconButton
                size={g.add}
                // Adding into a shut bucket would drop the new row behind the
                // sliver — same swallow as a drop, same fix.
                onClick={() => {
                  expandBucket(bucket);
                  onAdd(bucket, 'task');
                }}
                aria-label={`Add to ${meta.label}`}
              />
            )}
          </div>
        </header>

        {showSlot && (
          <div
            className={cn(
              'relative transition-[min-height,background-color,box-shadow] duration-150 ease-[var(--ease-out-soft)]',
              g.body,
              g.radius,
              // 'tray' is a real recess at rest, so it carries its fill, its
              // border and its far-wall modelling always. Light keeps the border
              // as well as the value step: the Figma tray only ever read because
              // #EEEDED bounded it, and belt-and-braces is the point of this
              // variant being the conservative one.
              //
              // 'spine' floats its card on the canvas at rest and SINKS it
              // under a drag: the fill drops to the tray value, the float shadow
              // gives way to the recess walls, and the mouth appears. A card
              // that stayed lifted while acting as a drop target would be
              // claiming two depths at once.
              isSpine
                ? dragging
                  ? 'shadow-[var(--bkt-walls)]'
                  : cn(
                      'bg-[var(--bkt-card)]',
                      isCurrent
                        ? 'bg-[var(--bkt-card-now)] shadow-[var(--bkt-card-shadow-now)]'
                        : 'shadow-[var(--bkt-card-shadow)]'
                    )
                : 'border border-border shadow-[var(--bkt-walls)]',
              isDropTarget
                ? cn('bg-[var(--bkt-tray-armed)]', g.slotArmed)
                : dragging
                  ? cn('bg-[var(--bkt-tray)]', g.slotOpen)
                  : !isSpine && 'bg-[var(--bkt-tray)]',
              // The lime rule down the tray's left wall — extent, not a loop, and
              // it follows the radius. 'spine' says the same thing with the rail.
              !isSpine && isCurrent && 'shadow-[var(--bkt-walls),inset_2px_0_0_var(--primary)]'
            )}
            style={{ marginTop: g.capGap, marginLeft: g.cardX }}
          >
            {/* The mouth. A real 1px element, not an inset shadow: the content
                area below can scroll (week caps it), and inset shadows paint
                BELOW child content, so a row scrolled to the top would slide
                over the line. */}
            {(dragging || !isSpine) && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-px"
                style={{ background: isDropTarget ? 'var(--bkt-lip-armed)' : 'var(--bkt-lip)' }}
              />
            )}
            {/* Plain overflow-y-auto, never <ScrollArea> — the Radix wrapper
                silently drops max-h. */}
            <div
              className={cn(contentMaxH != null && 'overflow-y-auto')}
              style={contentMaxH != null ? { maxHeight: contentMaxH } : undefined}
            >
              {/* Shut buckets render no children at all — see the drop note in
                  the component doc for why the droppables going with them is the
                  point rather than a side effect. */}
              {!collapsed && children}
            </div>
          </div>
        )}

        {/* The card, shut. Same edges and the same fill the slot takes under a
            drag — so collapsing reads as the lid coming down on the object that
            was there, rather than as the object being deleted and a rule drawn
            in its place. */}
        {showSliver && (
          <div
            aria-hidden
            className={cn(
              'relative rounded-full bg-[var(--bkt-tray)]',
              isSpine ? 'shadow-[var(--bkt-card-ring)]' : 'border border-border'
            )}
            style={{
              marginTop: g.capGap,
              marginLeft: g.cardX,
              height: g.sliver,
            }}
          />
        )}
      </>
    </section>
  );
}
