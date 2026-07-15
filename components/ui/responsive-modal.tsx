'use client';

import * as React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

/**
 * A modal that renders a centered shadcn Dialog on desktop and a vaul bottom
 * Drawer on mobile, sharing the exact same children. Lets a single dialog be a
 * premium bottom sheet on phones without forking its content. Desktop output is
 * byte-identical to the plain Dialog (same components, same props).
 */
const MobileCtx = React.createContext(false);

function ResponsiveModal({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const Root = isMobile ? Drawer : Dialog;
  return (
    <MobileCtx.Provider value={isMobile}>
      <Root open={open} onOpenChange={onOpenChange}>
        {children}
      </Root>
    </MobileCtx.Provider>
  );
}

/** `className` styles the desktop DialogContent; mobile is a bottom sheet with
 *  its own scroll + safe-area. Extra props (onKeyDown, etc.) pass to both. */
function ResponsiveModalContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const isMobile = React.useContext(MobileCtx);
  if (isMobile) {
    return (
      <DrawerContent {...props}>
        <div className="overflow-y-auto overflow-x-hidden px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          {children}
        </div>
      </DrawerContent>
    );
  }
  return (
    <DialogContent className={className} {...props}>
      {children}
    </DialogContent>
  );
}

function ResponsiveModalHeader({ className, ...props }: React.ComponentProps<'div'>) {
  const isMobile = React.useContext(MobileCtx);
  const C = isMobile ? DrawerHeader : DialogHeader;
  return <C className={cn(isMobile && 'px-0 text-left', className)} {...props} />;
}

function ResponsiveModalTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = React.useContext(MobileCtx);
  const C = isMobile ? DrawerTitle : DialogTitle;
  return <C className={className} {...props} />;
}

function ResponsiveModalDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const isMobile = React.useContext(MobileCtx);
  const C = isMobile ? DrawerDescription : DialogDescription;
  return <C className={className} {...props} />;
}

export {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
};
