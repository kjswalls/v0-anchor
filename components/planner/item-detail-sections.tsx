'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isAfter, startOfDay, startOfWeek, subWeeks } from 'date-fns';
import { ArrowUp, Check, Plus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlannerStore } from '@/lib/planner-store';
import {
  fetchItemEvents,
  getItemEventsAvailable,
  type ItemEvent,
} from '@/lib/db';
import { itemChatStore } from '@/lib/chat-store';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { useExtensionsStore } from '@/lib/extensions-store';
import { EXT_HABIT_HEATMAP, resolveEnabled } from '@/lib/extension-registry';
import { getItemTypeConfig, itemTypeName } from '@/lib/item-registry';
import { BandLabel } from '@/components/planner/item-bands';
import { isBulkPaste, MAX_BULK_ITEMS, splitBulkLinesWithMeta } from '@/lib/bulk-add';
import { toast } from 'sonner';
import type { Item, TaskItem } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * The item detail sections — what the dialog never had room for. One component
 * serves both sizes of the surface: stacked inside the edit panel, and
 * re-parented into columns on /item/[id] (memory/plans/item-surface-growth.md).
 *
 * Which sections render is registry capability config (`subtasks`,
 * `agentAssignable`), the same way chips are — a custom type opts in with
 * zero work here.
 */

/**
 * The sections' heading is the BAND label — one component, so the chips above
 * (Project, Routine, Program, Goal, When) and the sections below read as one
 * grammar instead of two that happen to look alike. See components/planner/
 * item-bands.tsx.
 */
const SectionLabel = BandLabel;

// ── Subtasks ─────────────────────────────────────────────────────────────────

function SubtasksSection({ item }: { item: Item }) {
  const { items, addTask, addTasksBulk, deleteTask, toggleTaskStatus } = usePlannerStore();
  const [title, setTitle] = useState('');

  // Live children — the edit dialog holds a SNAPSHOT of the parent, but the
  // subtask list must reflect toggles immediately.
  const children = items.filter(
    (i): i is TaskItem => i.type !== 'habit' && i.parentItemId === item.id
  );

  const addSubtask = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({ title: trimmed, parentItemId: item.id });
    setTitle('');
  };

  const done = children.filter((c) => c.status === 'completed').length;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>
        Subtasks{children.length > 0 ? ` · ${done} of ${children.length}` : ''}
      </SectionLabel>
      {children.map((child) => (
        <div key={child.id} className="group flex items-center gap-2" data-testid="subtask-row">
          <button
            type="button"
            onClick={() => toggleTaskStatus(child.id)}
            aria-label={child.status === 'completed' ? 'Mark not done' : 'Mark done'}
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              child.status === 'completed'
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/45 hover:border-primary'
            )}
          >
            {child.status === 'completed' && (
              <Check className="text-primary-foreground size-3" strokeWidth={3} />
            )}
          </button>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              child.status === 'completed' && 'text-muted-foreground line-through'
            )}
          >
            {child.title}
          </span>
          <button
            type="button"
            onClick={() => deleteTask(child.id)}
            aria-label={`Delete subtask ${child.title}`}
            className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Plus className="text-muted-foreground size-4 shrink-0" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add subtask…"
          data-sub-input
          data-testid="subtask-add-input"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addSubtask();
          }}
          // A multi-line paste commits inline — every line becomes a subtask
          // of THIS parent, one set(), one ⌘Z. No bulk-add dialog hop here:
          // the dialog knows nothing of parents, and the rows land visibly in
          // the list right below the field.
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text/plain');
            if (!isBulkPaste(pasted)) return;
            e.preventDefault();
            const { titles, truncated } = splitBulkLinesWithMeta(pasted);
            addTasksBulk(
              'task',
              titles.map((line) => ({ title: line, parentItemId: item.id }))
            );
            // The parser's contract: a capped tail is surfaced, never silent.
            // This surface has no dialog to say it in, so the toast does.
            if (truncated) {
              toast(`Added the first ${MAX_BULK_ITEMS} subtasks — the paste had more.`);
            }
            setTitle('');
          }}
        />
      </div>
    </div>
  );
}

// ── Agent assignment ─────────────────────────────────────────────────────────

/** Honey is the agent's hue everywhere in Anchor (--ai tokens). */
function AgentSection({ item }: { item: Item }) {
  const { items, updateTask } = usePlannerStore();
  const provider = useAISettingsStore((s) => s.provider);
  const live = (items.find((i) => i.id === item.id) ?? item) as TaskItem;
  const agentName = provider === 'openclaw' ? 'OpenClaw' : 'Beacon';

  if (item.type === 'habit') return null;

  if (!live.assignee) {
    return (
      <button
        type="button"
        data-testid="assign-agent"
        onClick={() =>
          updateTask(item.id, { assignee: provider === 'openclaw' ? 'openclaw' : 'beacon', aiStatus: 'queued' })
        }
        className={cn(
          'inline-flex h-7 w-fit items-center gap-1.5 rounded-sm border border-dashed px-2.5',
          'border-input text-muted-foreground hover-wash text-xs transition-colors',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
        )}
      >
        <Sparkles className="size-3" />
        Assign to {agentName}
      </button>
    );
  }

  return (
    <div className="bg-warning/10 flex flex-col gap-1 rounded-md px-2.5 py-2" data-testid="agent-block">
      <div className="flex items-center gap-2">
        <Sparkles className="text-warning-text size-3.5 shrink-0" />
        <span className="text-warning-text text-xs font-semibold capitalize">{live.assignee}</span>
        {live.aiStatus && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase',
              // 'blocked' is the only state that wants something FROM you, so
              // it's the only one that gets to raise its voice. The rest are
              // progress you're free to ignore.
              live.aiStatus === 'blocked'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-warning text-warning-foreground'
            )}
          >
            {live.aiStatus}
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            updateTask(item.id, { assignee: undefined, aiStatus: undefined, aiResult: undefined })
          }
          className="text-muted-foreground hover:text-foreground ml-auto text-[10px]"
        >
          Unassign
        </button>
      </div>
      {live.aiResult && (
        <p className="text-warning-text/85 text-xs leading-relaxed">{live.aiResult}</p>
      )}
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────

function eventLabel(e: ItemEvent): string {
  if (e.action === 'create') return 'Created';
  if (e.action === 'delete') return 'Deleted';
  // A check-in note reads here as well as on the goal page. It is the one event
  // whose payload is something the user WROTE, so showing the action alone
  // would hide the only part worth reading — and an item whose notes live
  // exclusively on another surface is an item whose own page lies about its
  // history.
  if (e.action === 'checkin') {
    const note = typeof e.payload?.note === 'string' ? e.payload.note.trim() : '';
    return note ? `Checked in — ${note}` : 'Checked in';
  }
  const payload = e.payload ?? {};
  // The container ids ride along with every re-file (migration 027) and are an
  // internal mirror of the name beside them — listing both turns "Updated
  // project" into "Updated project, projectId", which names a column the user
  // has never seen. Dropped from the LABEL only; the payload keeps them.
  const keys = Object.keys(payload).filter((k) => k !== 'projectId' && k !== 'groupId');
  if ('assignee' in payload) {
    return payload.assignee ? `Assigned to ${payload.assignee}` : 'Unassigned';
  }
  if ('aiStatus' in payload && payload.aiStatus) return `Agent: ${payload.aiStatus}`;
  if ('status' in payload) {
    return payload.status === 'completed' ? 'Completed' : `Status → ${payload.status}`;
  }
  if (keys.length === 0) return 'Updated';
  return `Updated ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}`;
}

function ActivitySection({ itemId }: { itemId: string }) {
  const [events, setEvents] = useState<ItemEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchItemEvents(itemId).then((rows) => {
      if (!cancelled) setEvents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  // Quiet when the table isn't deployed or nothing happened yet — the feed is
  // a bonus surface, never an empty-state to explain.
  if (!getItemEventsAvailable() || !events || events.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Activity</SectionLabel>
      {events.slice(0, 8).map((e) => (
        <div key={e.id} className="text-muted-foreground flex items-baseline gap-2 text-xs">
          <span className="bg-muted-foreground/60 size-1 shrink-0 translate-y-[-2px] rounded-full" />
          <span className="min-w-0 flex-1 truncate">{eventLabel(e)}</span>
          <time className="text-muted-foreground/70 shrink-0 font-mono text-[10px]">
            {format(new Date(e.createdAt), 'MMM d · HH:mm')}
          </time>
        </div>
      ))}
    </div>
  );
}

// ── Habit heatmap (extension: habit-heatmap) ────────────────────────────────

const HEATMAP_WEEKS = 26;

/**
 * A six-month completion grid — the habit-heatmap extension's whole surface.
 * Columns are calendar weeks (aligned to the user's week start), rows are
 * days; the vocabulary is the dialog's streak strip scaled up: a done day is a
 * solid bead in the -text role (bright in dark), a missed day is a faint
 * day-off wash, the future is blank. Data is completedDates, already on the
 * client — no fetch, and quiet-null when there's nothing to draw (the
 * ActivitySection convention: a bonus surface, never an empty state).
 */
function HeatmapSection({ item }: { item: Item }) {
  const weekStartDay = usePlannerStore((s) => s.weekStartDay);
  const completedDates = (item as { completedDates?: string[] }).completedDates;

  const grid = useMemo(() => {
    if (!completedDates || completedDates.length === 0) return null;
    const done = new Set(completedDates);
    const today = startOfDay(new Date());
    const weekStartsOn = weekStartDay === 'monday' ? 1 : weekStartDay === 'saturday' ? 6 : 0;
    const start = startOfWeek(subWeeks(today, HEATMAP_WEEKS - 1), { weekStartsOn });
    let count = 0;
    const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = addDays(start, w * 7 + d);
        if (isAfter(date, today)) return 'future' as const;
        if (done.has(format(date, 'yyyy-MM-dd'))) {
          count += 1;
          return 'done' as const;
        }
        return 'miss' as const;
      })
    );
    return { weeks, count };
  }, [completedDates, weekStartDay]);

  if (!grid || grid.count === 0) return null;

  return (
    <div className="flex flex-col gap-1.5" data-testid="habit-heatmap">
      <div className="flex items-baseline justify-between">
        <SectionLabel>History</SectionLabel>
        <span className="text-muted-foreground/70 font-mono text-[10px]">
          {grid.count} in 6 months
        </span>
      </div>
      <div className="flex gap-[3px]">
        {grid.weeks.map((week, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {week.map((day, d) => (
              <span
                key={d}
                className={cn(
                  'size-[5px] rounded-[1.5px]',
                  day === 'done' && 'bg-warning-text',
                  day === 'miss' && 'bg-day-off/25',
                  day === 'future' && 'opacity-0'
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Per-item thread ──────────────────────────────────────────────────────────

export function ItemThread({ item, className }: { item: Item; className?: string }) {
  // Store identity is cached per item id (itemChatStore), so the hook target
  // is stable across renders and hook ORDER never changes.
  const useThread = useMemo(() => itemChatStore(item.id), [item.id]);
  const { messages, isLoading, isTyping, send, hydrate, syncOpenclawInfo } = useThread();
  const provider = useAISettingsStore((s) => s.provider);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    hydrate();
    syncOpenclawInfo();
  }, [hydrate, syncOpenclawInfo]);

  // Scroll ONLY the thread's own list, and only on new messages — never on
  // the initial hydrate. scrollIntoView would scroll every ancestor too,
  // yanking the edit panel (or the page) down to the thread on open.
  useEffect(() => {
    const el = listRef.current;
    const prev = prevCount.current;
    prevCount.current = messages.length;
    if (!el || prev === 0 || messages.length <= prev) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || isLoading) return;
    setDraft('');
    void send(text);
  };

  const agentName = provider === 'openclaw' ? 'OpenClaw' : 'Beacon';

  return (
    <div className={cn('flex min-h-0 flex-col gap-1.5', className)} data-testid="item-thread">
      <SectionLabel>Thread</SectionLabel>
      {messages.length > 0 && (
        <div ref={listRef} className="flex max-h-64 min-h-0 flex-col gap-2 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[92%] rounded-md px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-secondary text-foreground self-end'
                  : 'bg-warning/10 text-foreground self-start'
              )}
            >
              {m.content ||
                (isTyping || isLoading ? '…' : '')}
            </div>
          ))}
        </div>
      )}
      <div className="border-input flex items-center gap-1.5 rounded-md border px-2 py-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Ask ${agentName} about this item…`}
          data-sub-input
          data-testid="item-thread-input"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-xs outline-none"
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey) return;
            e.preventDefault();
            handleSend();
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          disabled={!draft.trim() || isLoading}
          onClick={handleSend}
          aria-label="Send"
        >
          <ArrowUp className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── The stack ────────────────────────────────────────────────────────────────

/** Subtasks + agent + activity, gated by the type's capability config.
 *  The thread is exported separately so the page can column it. */
export function ItemDetailSections({ item, withThread }: { item: Item; withThread?: boolean }) {
  const config = getItemTypeConfig(itemTypeName(item));
  // Extension gate + capability gate: the heatmap is opt-in (Settings →
  // Extensions) and only meaningful where the registry says a streak exists.
  const heatmapOn = useExtensionsStore((s) => resolveEnabled(s.enabled, EXT_HABIT_HEATMAP));
  return (
    // data-sub-input on the CONTAINER: the dialog's Enter-submit guard checks
    // closest('[data-sub-input]'), and everything in here — inputs AND buttons
    // (subtask toggles, assign/unassign, send) — handles its own Enter. Without
    // this, Enter on a focused subtask checkbox saves-and-closes the panel.
    <div className="flex flex-col gap-4" data-sub-input>
      {config.subtasks && <SubtasksSection item={item} />}
      {config.agentAssignable && <AgentSection item={item} />}
      {heatmapOn && config.counters.streak && <HeatmapSection item={item} />}
      <ActivitySection itemId={item.id} />
      {withThread && <ItemThread item={item} />}
    </div>
  );
}
