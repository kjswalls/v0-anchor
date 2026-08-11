'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { BUCKET_LABEL_INK } from '@/components/primitives/bucket-card';
import { CategoryIcon } from '@/lib/category-icons';
import { usePlannerStore } from '@/lib/planner-store';
import { cn } from '@/lib/utils';

/**
 * Section heading: a category icon (lib/category-icons) + label in the content
 * color + a chevron that collapses/expands the rows. When the label names a
 * project or habit group, its stored glyph (a picked icon token) drives the
 * icon — resolved from the live store so editing a project's icon updates the
 * heading; otherwise the icon derives from the label name. Icon matches the
 * label's font color.
 * The whole heading row is the hit target — hovering anywhere reveals the
 * chevron and a subtle highlight, Linear-style. Collapse state is local.
 *
 * `variant` picks the surface. 'sidebar' (default, the Braindump) keeps the
 * leading type icon and the content-color label. 'canvas' (the body/day
 * views) drops the icon and uses the muted-gray label from the mockups — the
 * icon and heavier color there were noise that hurt row readability.
 */
export function GroupSection({
  label,
  children,
  className,
  variant = 'sidebar',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'canvas' | 'sidebar';
}) {
  const isCanvas = variant === 'canvas';
  const [collapsed, setCollapsed] = useState(false);
  // Subscribe to the arrays (not the getter fns) so a glyph edit re-renders.
  const projects = usePlannerStore((s) => s.projects);
  const habitGroups = usePlannerStore((s) => s.habitGroups);
  const lower = label.toLowerCase();
  const glyph =
    projects.find((p) => p.name === label)?.emoji ||
    habitGroups.find((g) => g.name.toLowerCase() === lower)?.emoji ||
    undefined;

  return (
    <div className={className}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className={cn(
          'group/heading flex w-full items-center gap-1 rounded-[5px] py-1 text-xs font-medium hover:bg-accent',
          // px-2 on canvas, matching TaskRow's own px-2, so this label lands on
          // the checkbox column instead of 4px shy of it. That near-miss was
          // invisible while the bucket caption above sat out on the card's edge;
          // now that the caption indents to the rows' columns it is the only
          // thing on this left edge not on one.
          isCanvas ? 'px-2' : 'px-1',
          // BUCKET_LABEL_INK — the canvas heading and the bucket caption above
          // it are the same voice, and both sit UNDER the rows in the reading
          // order on purpose. Imported rather than re-typed so muting one can't
          // silently leave the other behind.
          isCanvas ? BUCKET_LABEL_INK : 'text-foreground/70'
        )}
      >
        {!isCanvas && (
          <CategoryIcon glyph={glyph} name={label} className="mr-0.5 text-foreground/70" />
        )}
        {label}
        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground transition-transform',
            collapsed && '-rotate-90'
          )}
        />
      </button>
      {!collapsed && <div className="space-y-0">{children}</div>}
    </div>
  );
}
