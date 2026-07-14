'use client';

import { createElement, useCallback, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ALL_ICON_ENTRIES,
  CategoryIcon,
  FEATURED_ICON_NAMES,
  getIconByName,
  makeIconToken,
} from '@/lib/category-icons';
import { cn } from '@/lib/utils';

/**
 * Lucide icon picker — the replacement for the old emoji swatch popovers.
 * The trigger shows the current glyph (icon token or legacy emoji) resolved to
 * a Lucide icon; the content is a searchable grid over the full lucide set.
 *
 * Empty search shows the whole curated set (featured icons first, then the
 * rest) in a scrollable grid; a query filters it by case-insensitive substring.
 * The set is ~195 icons, small enough to render in full. Selecting a cell emits
 * an `icon:<PascalName>` token.
 */

interface IconPickerProps {
  /** Current stored glyph (icon token or legacy emoji) shown on the trigger. */
  value?: string;
  /** Category name — drives the trigger's fallback icon when `value` is a
   *  legacy emoji or empty (without it the fallback derives from "" → Music). */
  name?: string;
  /** Receives an icon token from makeIconToken. */
  onSelect: (token: string) => void;
  /** Extra classes for the trigger button (e.g. to size it h-10 w-10). */
  className?: string;
}

export function IconPicker({ value, name = '', onSelect, className }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wheelCleanup = useRef<(() => void) | null>(null);

  // The picker lives inside modal Dialogs whose scroll-lock (react-remove-scroll)
  // preventDefaults wheel on this portalled popover. Drive the scroll ourselves
  // with a non-passive listener. Attach via a ref CALLBACK (not an effect) so it
  // binds exactly when Radix mounts the grid node — an effect raced the portal.
  const gridRef = useCallback((el: HTMLDivElement | null) => {
    wheelCleanup.current?.();
    wheelCleanup.current = null;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight <= el.clientHeight) return;
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    wheelCleanup.current = () => el.removeEventListener('wheel', onWheel);
  }, []);

  const q = query.trim().toLowerCase();

  const { entries, matchedTotal } = useMemo(() => {
    if (!q) {
      // Featured first, then everything else — whole set, scrollable.
      const featuredSet = new Set(FEATURED_ICON_NAMES);
      const featured: [string, LucideIcon][] = [];
      for (const name of FEATURED_ICON_NAMES) {
        const icon = getIconByName(name);
        if (icon) featured.push([name, icon]);
      }
      const rest = ALL_ICON_ENTRIES.filter(([name]) => !featuredSet.has(name));
      const all = [...featured, ...rest];
      return { entries: all, matchedTotal: all.length };
    }
    const matched = ALL_ICON_ENTRIES.filter(([name]) => name.toLowerCase().includes(q));
    return { entries: matched, matchedTotal: matched.length };
  }, [q]);

  const handleSelect = (name: string) => {
    onSelect(makeIconToken(name));
    setQuery('');
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn('h-9 w-9 flex-shrink-0', className)}
        >
          <CategoryIcon glyph={value} name={name} className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons..."
          className="mb-2 h-8 text-sm"
        />
        <div ref={gridRef} className="grid grid-cols-8 gap-1 max-h-64 overflow-y-auto">
          {entries.map(([name, Icon]) => {
            const selected = value === makeIconToken(name);
            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => handleSelect(name)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded hover:bg-secondary',
                  selected && 'bg-secondary ring-1 ring-primary'
                )}
              >
                {createElement(Icon, { className: 'h-4 w-4' })}
              </button>
            );
          })}
        </div>
        {q && matchedTotal === 0 && (
          <p className="mt-2 px-1 text-2xs text-muted-foreground">
            No icons match “{query}”.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
