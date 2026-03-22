'use client';

import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function SidebarChat() {
  return (
    <div className="border-t border-border bg-background p-2">
      {/* Disabled input container */}
      <div className="rounded-xl border border-border bg-card overflow-hidden opacity-50">
        {/* Text input area - disabled */}
        <div className="relative px-3 py-0">
          {/* Custom placeholder with sparkle icon and coming soon badge */}
          <div className="flex items-center gap-1.5 py-2 text-muted-foreground/60">
            <Sparkles className="h-3 w-3 flex-shrink-0" />
            <span className="text-xs">Do all this for me...</span>
            <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30">
              Coming soon
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
