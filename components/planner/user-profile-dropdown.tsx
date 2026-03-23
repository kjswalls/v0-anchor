'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Settings, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase';

interface UserProfileDropdownProps {
  onOpenSettings: () => void;
}

function getInitials(email: string, name?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function UserProfileDropdown({ onOpenSettings }: UserProfileDropdownProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? null);
        setDisplayName(
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          null
        );
        setAvatarUrl(
          user.user_metadata?.avatar_url ??
          user.user_metadata?.picture ??
          null
        );
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full p-0 hover:ring-2 hover:ring-primary/20 transition-all"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl ?? ''} alt={label} />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
              {email ? initials : <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none truncate">{label}</p>
            {email && displayName && (
              <p className="text-xs leading-none text-muted-foreground truncate">{email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onOpenSettings} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-muted-foreground focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
