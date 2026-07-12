'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Sparkles,
  SlashSquare,
  CheckCircle2,
  Flame,
  Settings,
  Keyboard,
  FolderOpen,
  Bug,
} from 'lucide-react';
import { Command as CommandPrimitive } from 'cmdk';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore, openEditFor, openAddDialog } from '@/lib/ui-store';
import { useChatStore } from '@/lib/chat-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { searchItems } from '@/lib/search';
import { cn } from '@/lib/utils';

/**
 * The omnibar (v1): search, quick-add, and /commands from one input at the
 * bottom of the sidebar. Prefixes: '+' add, '/' command, '?' chat (lands in
 * P4 — shows a hint until then). ⌘K focuses it via ui-store.focusOmnibar().
 */

interface OmniCommand {
  id: string;
  label: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

export function Omnibar() {
  const { tasks, habits, addTask, getProjectEmoji, getHabitGroupEmoji } = usePlannerStore();
  const openDialog = useUIStore((s) => s.openDialog);
  const focusToken = useUIStore((s) => s.omnibarFocusToken);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⌘K (and friends) focus request
  useEffect(() => {
    if (focusToken > 0) {
      inputRef.current?.focus();
      setOpen(true);
    }
  }, [focusToken]);

  // Click outside closes the panel
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const commands: OmniCommand[] = useMemo(
    () => [
      {
        id: 'add-task',
        label: 'Add task…',
        keywords: 'add new task create',
        icon: Plus,
        run: () => openAddDialog('task'),
      },
      {
        id: 'add-habit',
        label: 'Add habit…',
        keywords: 'add new habit create',
        icon: Plus,
        run: () => openAddDialog('habit'),
      },
      {
        id: 'settings',
        label: 'Settings',
        keywords: 'settings preferences theme',
        icon: Settings,
        run: () => openDialog({ type: 'settings' }),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        keywords: 'keyboard shortcuts keys help',
        icon: Keyboard,
        run: () => openDialog({ type: 'keyboard-shortcuts' }),
      },
      {
        id: 'categories',
        label: 'Manage projects & groups',
        keywords: 'projects groups categories manage folders',
        icon: FolderOpen,
        run: () => openDialog({ type: 'manage-categories' }),
      },
      {
        id: 'bug',
        label: 'Report a bug',
        keywords: 'bug report feedback issue',
        icon: Bug,
        run: () => openDialog({ type: 'bug-report' }),
      },
    ],
    [openDialog]
  );

  const trimmed = query.trim();
  const isCommandMode = trimmed.startsWith('/');
  const isAddMode = trimmed.startsWith('+');
  const isChatMode = trimmed.startsWith('?');
  const commandQuery = isCommandMode ? trimmed.slice(1).trim().toLowerCase() : '';
  const addTitle = isAddMode ? trimmed.slice(1).trim() : trimmed;
  const chatText = isChatMode ? trimmed.slice(1).trim() : trimmed;

  const results = useMemo(() => {
    if (isCommandMode || isAddMode || isChatMode || !trimmed) return { tasks: [], habits: [] };
    const r = searchItems(trimmed, tasks, habits);
    return { tasks: r.tasks.slice(0, 6), habits: r.habits.slice(0, 4) };
  }, [trimmed, isCommandMode, isAddMode, isChatMode, tasks, habits]);

  const matchedCommands = useMemo(() => {
    if (isAddMode || isChatMode) return [];
    if (isCommandMode)
      return commands.filter(
        (c) => !commandQuery || c.label.toLowerCase().includes(commandQuery) || c.keywords.includes(commandQuery)
      );
    // Free-text mode: surface at most 2 loosely matching commands under Actions
    if (!trimmed) return commands.slice(0, 2);
    return commands
      .filter((c) => c.label.toLowerCase().includes(trimmed.toLowerCase()) || c.keywords.includes(trimmed.toLowerCase()))
      .slice(0, 2);
  }, [commands, isCommandMode, isAddMode, isChatMode, commandQuery, trimmed]);

  const closeAndClear = () => {
    setQuery('');
    setOpen(false);
  };

  const quickAdd = () => {
    if (!addTitle) {
      openAddDialog('task');
      closeAndClear();
      return;
    }
    addTask({ title: addTitle });
    setQuery('');
    inputRef.current?.focus();
  };

  const askBeacon = () => {
    useSidebarStore.getState().setChatExpanded(true);
    if (chatText) useChatStore.getState().send(chatText);
    closeAndClear();
    inputRef.current?.blur();
  };

  return (
    <div ref={containerRef} className="relative" data-tour="omnibar">
      <Command shouldFilter={false} loop className="overflow-visible bg-transparent">
        {/* Panel above the input */}
        {open && (
          <CommandList className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-80 overflow-y-auto rounded-card border border-border bg-popover p-1 shadow-soft-lg">
            {isChatMode && (
              <CommandGroup heading="Chat">
                <CommandItem value="action-chat" onSelect={askBeacon}>
                  <Sparkles className="h-4 w-4 text-ai" />
                  <span className="truncate">
                    Ask Beacon{chatText ? (
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

            {results.tasks.length > 0 && (
              <CommandGroup heading="Tasks">
                {results.tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={`task-${task.id}`}
                    onSelect={() => {
                      openEditFor(task, 'task');
                      closeAndClear();
                    }}
                  >
                    <CheckCircle2
                      className={cn(
                        'h-4 w-4',
                        task.status === 'completed' ? 'text-success' : 'text-muted-foreground/50'
                      )}
                    />
                    {task.project && <span>{getProjectEmoji(task.project)}</span>}
                    <span
                      className={cn(
                        'truncate font-content',
                        task.status === 'completed' && 'text-muted-foreground line-through'
                      )}
                    >
                      {task.title}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.habits.length > 0 && (
              <CommandGroup heading="Habits">
                {results.habits.map((habit) => (
                  <CommandItem
                    key={habit.id}
                    value={`habit-${habit.id}`}
                    onSelect={() => {
                      openEditFor(habit, 'habit');
                      closeAndClear();
                    }}
                  >
                    <Flame className="h-4 w-4 text-warning" />
                    <span>{getHabitGroupEmoji(habit.group)}</span>
                    <span className="truncate font-content">{habit.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!isChatMode && (
              <CommandGroup heading={isCommandMode ? 'Commands' : 'Actions'}>
                {!isCommandMode && (
                  <CommandItem value="action-add" onSelect={quickAdd}>
                    <Plus className="h-4 w-4 text-success-text" />
                    <span className="truncate">
                      Add task{addTitle ? (
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
                {!isCommandMode && !isAddMode && (
                  <CommandItem value="action-chat" onSelect={askBeacon}>
                    <Sparkles className="h-4 w-4 text-ai" />
                    <span className="truncate">
                      Ask Beacon{chatText ? (
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
                {matchedCommands.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={`cmd-${command.id}`}
                    onSelect={() => {
                      command.run();
                      closeAndClear();
                    }}
                  >
                    <command.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{command.label}</span>
                  </CommandItem>
                ))}
                {isCommandMode && matchedCommands.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No matching command</div>
                )}
              </CommandGroup>
            )}

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
          </CommandList>
        )}

        <CommandPrimitive.Input
          ref={inputRef}
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeAndClear();
              inputRef.current?.blur();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              askBeacon();
              return;
            }
            if (e.key === 'Enter' && isAddMode) {
              e.preventDefault();
              quickAdd();
            }
          }}
          placeholder="Search, add a task, start a chat, run a command..."
          aria-label="Omnibar"
          className="h-[48px] w-full rounded-[10px] bg-surface-2 px-[22px] text-sm text-foreground shadow-[1px_4px_5.3px_2px_rgba(0,0,0,0.1)] outline-none transition-shadow placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/30"
        />
      </Command>
    </div>
  );
}
