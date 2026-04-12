'use client';

import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Breadcrumb {
  id: string;
  name: string;
  emoji: string;
}

interface AtlasBreadcrumbsProps {
  breadcrumbs: Breadcrumb[];
  onNavigate: (index: number) => void;
  onBack: () => void;
  canGoBack: boolean;
}

export function AtlasBreadcrumbs({
  breadcrumbs,
  onNavigate,
  onBack,
  canGoBack,
}: AtlasBreadcrumbsProps) {
  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 px-4 py-2">
      {/* Back button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack}
        disabled={!canGoBack}
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      {/* Breadcrumb trail */}
      <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const isFirst = index === 0;
          
          return (
            <div key={crumb.id} className="flex items-center gap-1">
              <button
                onClick={() => onNavigate(index)}
                disabled={isLast}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-sm transition-colors',
                  isLast
                    ? 'font-medium text-foreground cursor-default'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <span className="text-sm">{crumb.emoji}</span>
                <span className={cn(
                  'whitespace-nowrap',
                  isFirst && 'hidden sm:inline'
                )}>
                  {crumb.name}
                </span>
              </button>
              
              {!isLast && (
                <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
