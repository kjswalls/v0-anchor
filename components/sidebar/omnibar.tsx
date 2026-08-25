'use client';

import { useRouter } from 'next/navigation';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Sparkles, SlashSquare, CheckCircle2, Flame, X,
  Target,
} from 'lucide-react';
import { Command as CommandPrimitive } from 'cmdk';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { RelayField } from '@/components/primitives/relay-field';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore, openEditFor, openAddDialog, openBulkAdd } from '@/lib/ui-store';
import { isBulkPaste } from '@/lib/bulk-add';
import { useChatStore } from '@/lib/chat-store';
import { groupResults, searchGoals, searchItems, type SearchGroup } from '@/lib/search';
import { sortGoalsForDisplay } from '@/lib/goals';
import { getItemTypeConfig } from '@/lib/item-registry';
import { suppressionReason } from '@/lib/active';
import { toDateStr } from '@/lib/recurrence';
import { CategoryIcon } from '@/lib/category-icons';
import { RELAY } from '@/lib/relay-config';
import { cn } from '@/lib/utils';
import {
  formatKeys,
  groupRows,
  isAvailable,
  matchArgOptions,
  matchCommands,
  matchEntityOptions,
  itemContainer,
  itemIcon,
  recentRows,
  resolveLabel,
  RECENT_HEADING,
  type Command as AnchorCommand,
  type CommandArgOption,
  type CommandEntityOption,
  type CommandRow,
} from '@/lib/commands';
import { useCommandUsageStore } from '@/lib/command-usage-store';
import { useShortcutBindings } from '@/lib/keyboard-shortcuts-store';
import { useCommandContext } from '@/hooks/use-command-context';

/**
 * The omnibar: search, quick-add, /commands and chat from one input. Prefixes:
 * '+' add, '/' command, '?' chat.
 *
 * ONE COMPONENT, TWO SHELLS (`variant`). The same input logic renders in two
 * chromes: the resting `dock` bar at the bottom of the sidebar, and the
 * summoned `launcher` modal. All four modes work in both — the shells differ
 * only in emphasis, default state, Enter semantics, and copy. Every difference
 * reads off `variant`; everything else is shared, which is the whole reason
 * this is a prop and not two components.
 *
 * Commands AND their keyboard bindings are NOT declared here — they come from
 * lib/commands/registry.ts, so this component only knows how to render and run
 * whatever the registry exposes (and focuses on ui-store's focus token).
 */

/** Mobile has ~320px of panel above a docked input; desktop can scroll. */
const MOBILE_ROW_LIMIT = 8;
const FREE_TEXT_COMMAND_LIMIT = 4;

/** Which shell is hosting the shared input. See the component doc-comment. */
export type OmnibarVariant = 'dock' | 'launcher';

/**
 * @param variant which shell is hosting this instance — 'dock' (sidebar,
 *   default) or 'launcher' (the summoned command modal). Exposed as
 *   `data-omnibar-variant` so tests can target one shell unambiguously when
 *   both are mounted.
 * @param onAskBeacon overrides where "Ask Beacon" opens the chat. Desktop
 *   grows the sidebar dock (default); mobile switches to the Chat tab.
 * @param onFocusChange reports the input's focus state to the parent (the dock
 *   drives its ambient relay from this — a stable signal, unlike container
 *   focus-within which sticks when a menu returns focus or a child unmounts).
 * @param onPulse fires on the INSTANT focus arrives (and on every ⌘K), for a
 *   one-shot flourish. Not derivable from onFocusChange: ⌘K on an already
 *   focused input fires no focus event but should still register.
 */
export function Omnibar({
  variant = 'dock',
  onAskBeacon,
  onFocusChange,
  onPulse,
}: {
  variant?: OmnibarVariant;
  onAskBeacon?: () => void;
  onFocusChange?: (focused: boolean) => void;
  onPulse?: () => void;
} = {}) {
  const {
    tasks,
    habits,
    addTask,
    getProjectEmoji,
    getHabitGroupEmoji,
    userTimezone,
    routines,
    programs,
    goals,
  } = usePlannerStore();
  const router = useRouter();
  // Today, not selectedDate — the omnibar carries no date of its own.
  const searchTz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const searchTodayStr = toDateStr(new Date(), searchTz);
  const focusToken = useUIStore((s) => s.omnibarFocusToken);

  const [query, setQuery] = useState('');
  // The launcher opens with its resting panel already showing (it's a summoned
  // modal); the dock starts closed and opens on focus. Derived at init rather
  // than set in an effect so no synchronous setState-in-effect is needed.
  const [open, setOpen] = useState(variant === 'launcher');
  const [focused, setFocused] = useState(false);
  /** Set once a command needing an argument is picked — the "chip" state. */
  const [activeCommand, setActiveCommand] = useState<AnchorCommand | null>(null);
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const ctx = useCommandContext({ openChat: onAskBeacon });
  const usage = useCommandUsageStore((s) => s.usage);
  const bindings = useShortcutBindings();

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);

  /** Resolved key hint per shortcut id, for the right-aligned label. */
  const keyHints = useMemo(() => {
    const map = new Map<string, string>();
    for (const binding of bindings) map.set(binding.id, formatKeys(binding.keys, isMac).join(' '));
    return map;
  }, [bindings, isMac]);

  // Held in a ref so it stays OUT of the focusToken effect's deps. That effect
  // fires a pulse on every run, and its `focusToken > 0` guard stays true once
  // tripped — so an unmemoised onPulse in the deps would re-fire the wave on
  // every parent render.
  const onPulseRef = useRef(onPulse);
  useEffect(() => {
    onPulseRef.current = onPulse;
  });

  // ⌘K (and friends) focus request. Pulses unconditionally: when the input is
  // already focused, .focus() fires no focus event, and the shortcut should
  // still register as *something* happening.
  useEffect(() => {
    if (focusToken > 0) {
      inputRef.current?.focus();
      setOpen(true);
      onPulseRef.current?.();
    }
  }, [focusToken]);

  // The launcher is a summoned modal: it must open already focused (its resting
  // panel is shown via the initial `open` state above). The dock instead grabs
  // focus on demand via the focus token; here focus arrives with the mount.
  // Radix autofocus usually lands on the first focusable, but cmdk's combobox
  // input makes that unreliable, so claim it explicitly. `variant` is stable
  // per instance, so this runs once, on mount.
  useEffect(() => {
    if (variant !== 'launcher') return;
    inputRef.current?.focus();
  }, [variant]);

  // Report focus up so the dock can light its relay off a reliable signal.
  useEffect(() => {
    onFocusChange?.(focused);
  }, [focused, onFocusChange]);

  // Click outside closes the panel
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const trimmed = query.trim();
  // Prefixes are suspended while a command is waiting for its argument — a
  // project called "/etc" has to be typeable.
  const isCommandMode = !activeCommand && trimmed.startsWith('/');
  const isAddMode = !activeCommand && trimmed.startsWith('+');
  const isChatMode = !activeCommand && trimmed.startsWith('?');
  const commandQuery = isCommandMode ? trimmed.slice(1).trim() : '';
  const addTitle = isAddMode ? trimmed.slice(1).trim() : trimmed;
  // Every prefix is stripped, not just '?': ⌘Enter sends to Beacon from any
  // mode, and it must not send the literal '+' or '/' along with the text.
  const chatText =
    isChatMode || isAddMode || isCommandMode ? trimmed.slice(1).trim() : trimmed;

  /* ── argument mode ─────────────────────────────────────────────────── */

  const argument = activeCommand?.argument;

  const argOptions = useMemo(() => {
    if (!activeCommand || argument?.kind !== 'enum') return [];
    return matchArgOptions(activeCommand, query, ctx);
  }, [activeCommand, argument, query, ctx]);

  /**
   * Entity picker rows. `tasks`/`habits` are in the deps because the search
   * reads them off the store non-reactively — without them, completing an item
   * would leave it sitting in the list for the next pick.
   */
  const entityOptions = useMemo(() => {
    if (!activeCommand || argument?.kind !== 'entity') return [];
    return matchEntityOptions(activeCommand, query, ctx);
    // tasks/habits look unused to the linter and are not: the search reads the
    // store non-reactively, so these are what re-run it after a mutation.
    // Without them, completing an item leaves it in the list for the next pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCommand, argument, query, ctx, tasks, habits]);

  const argError = useMemo(() => {
    if (argument?.kind !== 'text' || !query.trim()) return null;
    return argument.validate?.(query) ?? null;
  }, [argument, query]);

  /* ── rows ──────────────────────────────────────────────────────────── */

  /**
   * Goals, resolved BESIDE the item sections rather than inside them — a goal
   * is not an Item, needs a navigate action rather than an edit, and the key
   * `goal` would collide with a custom item type of that name. See searchGoals.
   */
  const goalHits = useMemo(() => {
    // Same four-mode gate the item results carry. Without it a `/`, `+` or `?`
    // prefix still ran a substring search — and since a goal's `why` is
    // paragraph-shaped, prose containing a slash meant pressing `/` could
    // render a Goals section above the command palette.
    if (activeCommand || isCommandMode || isAddMode || isChatMode) return [];
    const trimmed = query.trim();
    if (!trimmed) return [];
    // Ended goals sort last inside the cap. They stay findable — searching by
    // name is how you reach a record — but four achieved goals must not push
    // the one you are running off the list.
    return sortGoalsForDisplay(searchGoals(trimmed, goals)).slice(0, 4);
  }, [query, goals, activeCommand, isCommandMode, isAddMode, isChatMode]);

  /** Search hits as one section per item type; row caps live in groupResults. */
  const results = useMemo<SearchGroup[]>(() => {
    if (activeCommand || isCommandMode || isAddMode || isChatMode || !trimmed) return [];
    return groupResults(searchItems(trimmed, tasks, habits));
  }, [trimmed, activeCommand, isCommandMode, isAddMode, isChatMode, tasks, habits]);

  /**
   * The "Recently used" rows, kept out of `commandRows` so they render as
   * their own labelled section rather than blending into the actions that are
   * always on offer. Only shown when you have not typed a query — once you are
   * searching, relevance is the only ordering that makes sense.
   *
   * Add task and Ask Beacon are excluded: the inline rows below already are
   * those two commands, so a recent entry for either would render twice.
   */
  const recentCommandRows = useMemo<CommandRow[]>(() => {
    if (activeCommand || isAddMode || isChatMode) return [];
    if (trimmed && !(isCommandMode && !commandQuery)) return [];
    return recentRows(ctx, usage, 6)
      .filter((row) => row.command.id !== 'create.task' && row.command.id !== 'rituals.chat')
      .slice(0, ctx.isMobile ? 3 : 4);
  }, [activeCommand, isAddMode, isChatMode, isCommandMode, commandQuery, trimmed, ctx, usage]);

  const commandRows = useMemo<CommandRow[]>(() => {
    if (activeCommand || isAddMode || isChatMode) return [];

    // Resting state: nothing but the recents section above and the inline
    // add / chat rows below.
    if (!trimmed) return [];

    if (isCommandMode) {
      const rows = matchCommands(commandQuery, ctx, { usage });
      return ctx.isMobile ? rows.slice(0, MOBILE_ROW_LIMIT) : rows;
    }

    // Free text: the inline quick-add and Ask Beacon rows below already ARE
    // those two commands, so drop the duplicates before capping. Per-goal
    // "Open X" commands go the same way and for the same reason — the Goals
    // section above is those rows, with the same destination — and leaving both
    // in also spent one of a capped four slots on a repeat. In COMMAND mode
    // they stay: the goal channel is gated off there, so the command row is the
    // only way to reach a goal by typing.
    return matchCommands(trimmed, ctx, { usage })
      .filter(
        (row) =>
          row.command.id !== 'create.task' &&
          row.command.id !== 'rituals.chat' &&
          !row.command.id.startsWith('goal.open.'),
      )
      .slice(0, ctx.isMobile ? 3 : FREE_TEXT_COMMAND_LIMIT);
  }, [activeCommand, isAddMode, isChatMode, isCommandMode, commandQuery, trimmed, ctx, usage]);

  /**
   * Grouped headings only in the full palette on desktop. On mobile the panel
   * is 320px tall and nine group headings would eat most of it before a row
   * rendered, so it stays a flat ranked list there.
   */
  const grouped = useMemo(
    // commandRows.length matters: groupRows([]) is an empty ARRAY, which is
    // truthy, so `grouped?.map` would render nothing while `!grouped` also
    // skipped the fallback — leaving an empty popover for a query like "/zzz".
    () =>
      isCommandMode && !ctx.isMobile && commandRows.length > 0 ? groupRows(commandRows) : null,
    [isCommandMode, ctx.isMobile, commandRows]
  );

  /* ── actions ───────────────────────────────────────────────────────── */

  const closeAndClear = () => {
    setQuery('');
    setActiveCommand(null);
    setOpen(false);
  };

  const clearArgument = () => {
    setActiveCommand(null);
    setQuery('');
    inputRef.current?.focus();
  };

  const runCommand = (command: AnchorCommand, arg?: string) => {
    if (!isAvailable(command, ctx)) return;

    // Needs a value and doesn't have one yet — chip it and wait.
    if (command.argument && arg === undefined) {
      setActiveCommand(command);
      setQuery('');
      inputRef.current?.focus();
      return;
    }

    command.run(ctx, arg);
    useCommandUsageStore.getState().record(command.id);
    closeAndClear();
  };

  const quickAdd = () => {
    if (!addTitle) {
      openAddDialog('task');
      useCommandUsageStore.getState().record('create.task');
      closeAndClear();
      return;
    }
    addTask({ title: addTitle });
    setQuery('');
    inputRef.current?.focus();
  };

  const askBeacon = () => {
    ctx.openChat();
    useCommandUsageStore.getState().record('rituals.chat');
    if (chatText) useChatStore.getState().send(chatText);
    closeAndClear();
    inputRef.current?.blur();
  };

  /* ── rendering ─────────────────────────────────────────────────────── */

  const renderCommandRow = (row: CommandRow) => {
    const Icon = row.arg?.icon ?? row.command.icon;
    const needsArgument = !!row.command.argument && !row.arg;

    // Right-hand hint: the key binding if there is one, otherwise the token you
    // can type to reach the row. The slash form is only truthful in command
    // mode, so the alias hint is confined to it.
    const keyHint =
      row.command.shortcut && !ctx.isMobile ? keyHints.get(row.command.shortcut.id) : undefined;
    const alias = (row.arg?.aliases ?? row.command.aliases)?.[0];
    const hint = keyHint ?? (isCommandMode && alias ? `/${alias}` : undefined);

    return (
      <CommandItem
        key={row.value}
        value={row.value}
        disabled={row.disabled}
        data-testid="omnibar-row"
        // The command id, not the row copy. Row labels collide with their own
        // group headings ('Settings' is both a command and a group), so text
        // matching resolves by scoring accident and becomes a strict-mode
        // violation the moment keywords change.
        data-command-id={row.command.id}
        data-arg={row.arg?.value ?? ''}
        onSelect={() => runCommand(row.command, row.arg?.value)}
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">
          {row.label}
          {needsArgument && <span className="text-muted-foreground">…</span>}
        </span>
        {hint && (
          <CommandShortcut className={cn(!keyHint && 'font-mono tracking-normal')}>
            {hint}
          </CommandShortcut>
        )}
      </CommandItem>
    );
  };

  /**
   * Its own labelled section so a recent command never reads as one of the
   * fixed actions. Position differs by mode on purpose: at rest it sits BELOW
   * the actions, so Enter still means "add a task"; in /command mode it sits on
   * top, where it is the whole point and would otherwise be buried under
   * thirty rows nobody scrolls to.
   */
  const recentGroup =
    recentCommandRows.length > 0 ? (
      <CommandGroup heading={RECENT_HEADING}>
        {recentCommandRows.map(renderCommandRow)}
      </CommandGroup>
    ) : null;

  /**
   * An item row inside the picker. Deliberately shaped like the search results
   * further down — same glyphs, same strikethrough for done, same container
   * icon — so picking "which item" looks the same wherever you are doing it.
   */
  const renderEntityOption = (option: CommandEntityOption) => {
    const Icon = option.icon;
    return (
      <CommandItem
        key={option.value}
        value={`arg:${option.value}`}
        // Addressable for the same reason renderCommandRow is: an entity row's
        // only other handle is its label, and item titles are user data. The
        // command id rides along so a picker row is unambiguous about which
        // command it would run.
        data-command-id={activeCommand?.id}
        data-arg={option.value}
        onSelect={() => activeCommand && runCommand(activeCommand, option.value)}
      >
        <Icon
          className={cn('h-4 w-4', option.done ? 'text-success' : 'text-muted-foreground/50')}
        />
        {option.container && (
          <CategoryIcon glyph={option.container.glyph} name={option.container.name} />
        )}
        <span
          className={cn(
            'truncate font-content text-content',
            option.done && 'text-muted-foreground line-through'
          )}
        >
          {option.label}
        </span>
        {option.detail && <CommandShortcut>{option.detail}</CommandShortcut>}
      </CommandItem>
    );
  };

  const renderArgOption = (option: CommandArgOption) => {
    const Icon = option.icon;
    return (
      <CommandItem
        key={option.value}
        value={`arg:${option.value}`}
        onSelect={() => activeCommand && runCommand(activeCommand, option.value)}
      >
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : <span className="w-4" />}
        <span className="truncate">{option.label}</span>
        {option.active && <CommandShortcut>current</CommandShortcut>}
      </CommandItem>
    );
  };

  return (
    <div ref={containerRef} className="relative" data-tour="omnibar" data-omnibar-variant={variant}>
      <Command shouldFilter={false} loop className="overflow-visible bg-transparent">
        {/* Panel above the input */}
        {open && (
          <CommandList
            data-testid="omnibar-panel"
            className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-80 overflow-y-auto rounded-card border border-border bg-popover p-1 shadow-soft-lg"
          >
            {/* Argument mode owns the whole panel — nothing else is relevant
                while a command is waiting for its value. */}
            {activeCommand ? (
              <CommandGroup heading={argument?.placeholder ?? 'Value'}>
                {argument?.kind === 'text' ? (
                  <CommandItem
                    value="arg-submit"
                    disabled={!!argError || !query.trim()}
                    onSelect={() => runCommand(activeCommand, query.trim())}
                  >
                    <activeCommand.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">
                      {argError ? (
                        <span className="text-destructive">{argError}</span>
                      ) : query.trim() ? (
                        <>
                          {resolveLabel(activeCommand, ctx)}{' '}
                          <span className="font-content">“{query.trim()}”</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{argument.placeholder}</span>
                      )}
                    </span>
                  </CommandItem>
                ) : argument?.kind === 'entity' ? (
                  entityOptions.length > 0 ? (
                    entityOptions.map(renderEntityOption)
                  ) : (
                    // The command's own copy, not "No match": the picker is
                    // pre-filtered to what this command can act on, so an empty
                    // list usually means nothing QUALIFIES, not that the query
                    // was wrong.
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {argument.emptyLabel}
                    </div>
                  )
                ) : argOptions.length > 0 ? (
                  argOptions.map(renderArgOption)
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No match</div>
                )}
              </CommandGroup>
            ) : (
              <>
                {isChatMode && (
                  <CommandGroup heading="Chat">
                    <CommandItem value="action-chat" onSelect={askBeacon}>
                      <Sparkles className="h-4 w-4 text-ai" />
                      <span className="truncate">
                        Ask Beacon
                        {chatText ? (
                          <>
                            {' '}
                            <span className="font-content">“{chatText}”</span>
                          </>
                        ) : (
                          '…'
                        )}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}

                {/* Goals first: they are containers, so a hit here reframes
                    every item row beneath it. Four at most — this is a jump,
                    not a browse. */}
                {goalHits.length > 0 && (
                  <CommandGroup heading="Goals">
                    {goalHits.map((goal) => (
                      <CommandItem
                        key={goal.id}
                        value={`goal-${goal.id}`}
                        data-testid="omnibar-goal-result"
                        data-goal-id={goal.id}
                        onSelect={() => {
                          closeAndClear();
                          router.push(`/goal/${goal.id}`);
                        }}
                      >
                        <Target className="size-4 shrink-0" />
                        <span className="truncate">{goal.name}</span>
                        {goal.state !== 'active' && (
                          <span className="text-muted-foreground ml-auto text-[11px]">
                            {goal.state === 'achieved' ? 'Achieved' : 'Set aside'}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* One section per item type, in registry order. A custom type
                    gets its own heading and its own glyph instead of being
                    filed under Tasks because it rides the task pipeline. */}
                {results.map((group) => (
                  <CommandGroup key={group.type} heading={group.heading}>
                    {group.items.map((item) => {
                      const Icon = itemIcon(item);
                      const container = itemContainer(item);
                      // Task-shaped only. A habit's completion is per-DATE
                      // (completedDates), not the scalar status, and these rows
                      // carry no date — so habits render undone, as before.
                      const done =
                        item.type !== 'habit' &&
                        item.status === getItemTypeConfig(group.type).doneStatus;
                      // Search deliberately keeps finding paused items — looking
                      // something up by name is explicit intent, and this is one
                      // of the few places a set-aside item can still be reached.
                      // It just says so, quietly.
                      const paused = !!suppressionReason(item, searchTodayStr, {
                        userTimezone: searchTz,
                        routines,
                        programs,
                      });
                      return (
                        <CommandItem
                          key={item.id}
                          value={`${group.type}-${item.id}`}
                          data-testid="omnibar-result"
                          data-item-id={item.id}
                          data-item-type={group.type}
                          data-paused={paused || undefined}
                          onSelect={() => {
                            openEditFor(item, item.type === 'habit' ? 'habit' : 'task');
                            closeAndClear();
                          }}
                        >
                          <Icon
                            className={cn(
                              'h-4 w-4',
                              group.type === 'habit'
                                ? 'text-warning'
                                : done
                                  ? 'text-success'
                                  : 'text-muted-foreground/50'
                            )}
                          />
                          {container && (
                            <CategoryIcon glyph={container.glyph} name={container.name} />
                          )}
                          <span
                            className={cn(
                              'truncate font-content text-content',
                              done && 'text-muted-foreground line-through'
                            )}
                          >
                            {item.title}
                          </span>
                          {/* Short on purpose: the panel is ~320px and the
                              title truncates against it. */}
                          {paused && <CommandShortcut>Paused</CommandShortcut>}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}

                {isCommandMode && recentGroup}

                {/* Grouped palette — /command mode on desktop */}
                {grouped?.map((group) => (
                  <CommandGroup key={group.id} heading={group.heading}>
                    {group.rows.map(renderCommandRow)}
                  </CommandGroup>
                ))}

                {/* Flat list: mobile, or the free-text slice beside search.
                    Rendered before the recents so Enter at rest still lands on
                    Add task rather than on whatever you last ran. */}
                {!grouped && !isChatMode && (
                  <CommandGroup heading={isCommandMode ? 'Commands' : 'Actions'}>
                    {!isCommandMode && (
                      <CommandItem value="action-add" data-testid="omnibar-add-row" onSelect={quickAdd}>
                        <Plus className="h-4 w-4 text-success-text" />
                        <span className="truncate">
                          Add task
                          {addTitle ? (
                            <>
                              {' '}
                              <span className="font-content">“{addTitle}”</span>
                            </>
                          ) : (
                            '…'
                          )}
                        </span>
                      </CommandItem>
                    )}
                    {commandRows.map(renderCommandRow)}
                    {!isCommandMode && !isAddMode && (
                      <CommandItem value="action-chat" onSelect={askBeacon}>
                        <Sparkles className="h-4 w-4 text-ai" />
                        <span className="truncate">
                          Ask Beacon
                          {chatText ? (
                            <>
                              {' '}
                              <span className="font-content">“{chatText}”</span>
                            </>
                          ) : (
                            '…'
                          )}
                        </span>
                      </CommandItem>
                    )}
                    {isCommandMode && commandRows.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No matching command
                      </div>
                    )}
                  </CommandGroup>
                )}

                {!isCommandMode && recentGroup}

                {!isChatMode && !isCommandMode && !trimmed && (
                  <div className="flex items-center gap-3 px-3 py-1.5 text-2xs text-muted-foreground/70">
                    <span className="flex items-center gap-1">
                      <Plus className="h-3 w-3" /> add
                    </span>
                    <span className="flex items-center gap-1">
                      <SlashSquare className="h-3 w-3" /> commands
                    </span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> ? chat
                    </span>
                  </div>
                )}
              </>
            )}
          </CommandList>
        )}

        <div className="relative isolate">
          {RELAY.omnibar && (
            <RelayField
              className="absolute -inset-3 z-0"
              focalY={0.5}
              pitch={30}
              period={3.2}
              idleIntensity={0}
              activeIntensity={0.7}
              active={focused}
              mask="radial-gradient(closest-side, black, transparent)"
            />
          )}
          {/* Resting: a raised pill floating above the dock. Focus: it presses
              down into it — the drop shadow cross-fades to an inner one, the
              surface darkens a hair toward the well, and it nudges 1px lower.
              A tactile "key pressed" feel.

              The states live on this WRAPPER rather than on the input, because
              the input now shares the pill with the argument chip. They are
              driven off the same `focused` state the relay uses, not
              :focus-within, which sticks when a child unmounts.

              All three properties animate, so all three need an explicit
              resting value, and every animated property is named in the
              transition list. Two things that look like details but are not:
                • Tailwind v4 presses via the standalone `translate` property,
                  NOT `transform` — listing `transform` here animates nothing.
                • The shadow uses the --shadow-key-* PAIR rather than
                  elev-sm → inset-sm. A box-shadow list whose layers disagree on
                  `inset` is uninterpolable and hard-swaps mid-transition; the
                  pair is padded so it actually cross-fades. See globals.css. */}
          <div
            // The pill LOOKS like the text field, so all of it has to behave
            // like one. The input is a flex item roughly 20px tall inside a
            // 48px pill, which leaves dead bands above and below it plus the
            // side padding; a click there would otherwise focus nothing. The
            // target check keeps the chip button's own clicks intact — it only
            // redirects hits that landed on this wrapper itself.
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              inputRef.current?.focus();
            }}
            className={cn(
              'relative z-10 flex h-[48px] w-full items-center gap-2 rounded-[10px] bg-surface-2',
              activeCommand ? 'pl-2.5 pr-[22px]' : 'px-[22px]',
              'translate-y-0 shadow-[var(--shadow-key-rest)]',
              'transition-[box-shadow,translate,background-color] duration-150 ease-[var(--ease-out-soft)]',
              // Hover, only while NOT focused (focus keeps its clean pressed
              // look): a 1px inner hairline traces the pill on top of its raised
              // rest shadow — parity with the braindump quick-add tray.
              '[&:hover:not(:focus-within)]:shadow-[var(--shadow-key-rest),inset_0_0_0_1px_var(--border)]',
              focused &&
                'translate-y-px bg-[var(--surface-2-pressed)] shadow-[var(--shadow-key-pressed)]'
            )}
          >
            {activeCommand && (
              <button
                type="button"
                onClick={clearArgument}
                aria-label={`Cancel ${activeCommand.label}`}
                // A real hit target, not just Escape: phones have no Escape key
                // and backspace-on-empty is not reliable under an IME.
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary/15 pl-2 pr-1.5 text-xs font-medium text-foreground"
              >
                <activeCommand.icon className="h-3.5 w-3.5" />
                <span className="max-w-[140px] truncate">{resolveLabel(activeCommand, ctx)}</span>
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                setOpen(true);
              }}
              onFocus={() => {
                setOpen(true);
                setFocused(true);
                onPulseRef.current?.();
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  // Consumed here, not left to bubble: an enclosing surface
                  // (a dialog, a future host) may have its own Escape handler,
                  // and dismissing search must not also dismiss that.
                  e.stopPropagation();
                  if (activeCommand) {
                    clearArgument();
                    return;
                  }
                  closeAndClear();
                  inputRef.current?.blur();
                  return;
                }
                // Backspace on an empty value pops the chip, the way a token in
                // a mail "To:" field does.
                if (e.key === 'Backspace' && activeCommand && query === '') {
                  e.preventDefault();
                  clearArgument();
                  return;
                }
                // Not while a chip is pending — ⌘Enter there would abandon the
                // command and send the half-typed argument as a chat message.
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !activeCommand) {
                  e.preventDefault();
                  askBeacon();
                  return;
                }
                // Submit a text argument explicitly rather than relying on cmdk
                // having re-selected the row the moment validation flipped it
                // from disabled to enabled.
                if (e.key === 'Enter' && activeCommand && argument?.kind === 'text') {
                  e.preventDefault();
                  const value = query.trim();
                  if (value && !argument.validate?.(value)) runCommand(activeCommand, value);
                  return;
                }
                if (e.key === 'Enter' && isAddMode) {
                  e.preventDefault();
                  quickAdd();
                }
              }}
              // A multi-line paste can't be a search and can't be typed into a
              // single-line input without folding — treat it as a list and hand
              // it to the bulk-add dialog. Chat mode keeps native paste (a
              // pasted paragraph is a legitimate question for Beacon), and so
              // does a pending command chip (its argument is a value, not a
              // list). The typed query survives, as the braindump's draft
              // does: the paste is what's being promoted, not the draft.
              onPaste={(e) => {
                if (isChatMode || activeCommand) return;
                const pasted = e.clipboardData.getData('text/plain');
                if (isBulkPaste(pasted)) {
                  e.preventDefault();
                  openBulkAdd({ text: pasted });
                  setOpen(false);
                  inputRef.current?.blur();
                }
              }}
              placeholder={
                activeCommand
                  ? (activeCommand.argument?.placeholder ?? '')
                  : 'Search, add a task, start a chat, run a command...'
              }
              aria-label="Omnibar"
              // cmdk gives this input role="combobox", and Playwright's
              // getByLabel does not resolve aria-label on it (verified: 0
              // matches while [aria-label="Omnibar"] matches 1). A testid is
              // the one handle that cannot silently stop matching.
              data-testid="omnibar-input"
              // Identifiers typed as an argument (a project name is the key
              // every task references) must not be autocapitalised, and neither
              // should an item title you are searching for.
              //
              // Only autoCapitalize is set here: cmdk's Input spreads its own
              // autoComplete/autoCorrect/spellCheck AFTER the caller's props,
              // so passing those would look like it worked and do nothing.
              // cmdk already pins autoCorrect and spellCheck off for us.
              autoCapitalize={argument && argument.kind !== 'enum' ? 'off' : 'sentences'}
              // self-stretch, not the flex row's default centring: it makes the
              // input as tall as the pill so a click anywhere down its column
              // lands in the text and places the caret, rather than hitting the
              // wrapper. An input centres its own text, so this costs nothing
              // visually. See the wrapper's onMouseDown for the side padding.
              className="min-w-0 flex-1 self-stretch bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
      </Command>
    </div>
  );
}
