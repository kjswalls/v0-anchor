'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Settings, LogOut, Undo2, Redo2, ChevronDown, Flame } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { createClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';

function getInitials(email: string, name?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/**
 * Sidebar footer row: identity + streak on the left, session history
 * (label + undo/redo) on the right. Replaces user-profile-dropdown in the
 * desktop chrome and absorbs action-feed's history list.
 *
 * The action log is in-memory per session, so the whole list is "this
 * session" — the divider renders at the bottom. If the log ever persists,
 * record a session-start index in planner-store and move the divider there.
 */
export function UserCard() {
  const router = useRouter();
  const { openDialog } = useUIStore();
  const { habits, actionLog, historyIndex, undo, redo, canUndo, canRedo } = usePlannerStore();

  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? null);
        setDisplayName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? null);
        setAvatarUrl(user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null);
      }
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const initials = email ? getInitials(email, displayName) : '??';
  const label = displayName ?? email ?? 'User';
  const firstName = (displayName ?? email ?? 'You').split(/[\s@]/)[0];
  const bestStreak = habits.reduce((max, h) => Math.max(max, h.streak ?? 0), 0);

  const displayActions = actionLog.slice(0, 10);
  const currentActionIndex = actionLog.length > 0 ? actionLog.length - historyIndex - 1 : -1;

  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      {/* Identity dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent"
            aria-label="User menu"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatarUrl ?? ''} alt={label} />
              <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                {email ? initials : <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium text-foreground">{firstName}</span>
            {bestStreak > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-2xs font-medium text-warning-text">
                <Flame className="h-3 w-3" />
                {bestStreak}
              </span>
            )}
            <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start" sideOffset={8}>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="truncate text-sm font-medium leading-none">{label}</p>
              {email && displayName && (
                <p className="truncate text-xs leading-none text-muted-foreground">{email}</p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openDialog({ type: 'settings' })} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="cursor-pointer text-muted-foreground focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* History: session label + undo/redo */}
      <div className="ml-auto flex items-center gap-0.5">
        <Popover>
          <PopoverTrigger asChild>
            <button className="max-w-[110px] truncate border-b border-dashed border-muted-foreground/40 pb-px font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground">
              {displayActions[0]?.label ?? 'Session start'}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" side="top" className="w-64 p-2">
            <div className="mb-1.5 px-1 text-2xs font-medium text-muted-foreground">History</div>
            <div className="max-h-60 space-y-0.5 overflow-y-auto">
              {displayActions.map((action, idx) => {
                const isCurrentPosition = idx === currentActionIndex;
                const isUndone = idx < currentActionIndex;
                return (
                  <div
                    key={action.id}
                    className={cn(
                      'truncate rounded px-1.5 py-0.5 font-mono text-2xs leading-tight',
                      isCurrentPosition && 'bg-secondary/50 text-foreground',
                      !isCurrentPosition && !isUndone && 'text-muted-foreground/60',
                      isUndone && 'text-muted-foreground/30 line-through'
                    )}
                    title={action.label}
                  >
                    <span className="mr-1 opacity-40">{isCurrentPosition ? '>' : ' '}</span>
                    {action.label}
                  </div>
                );
              })}
              <div className="px-1.5 pt-1 font-mono text-2xs text-muted-foreground/50">
                — Session start —
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          onClick={undo}
          disabled={!canUndo}
          className="h-7 w-7 text-muted-foreground transition-all hover:text-foreground disabled:opacity-30"
          title="Undo (⌘Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={redo}
          disabled={!canRedo}
          className="h-7 w-7 text-muted-foreground transition-all hover:text-foreground disabled:opacity-30"
          title="Redo (⌘⇧Z)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
