'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, ToasterProps } from 'sonner'

/**
 * Toaster restyled to the redesign: a soft-shadowed surface-2 card with a lime
 * action button and chrome (Inter) type — cohesive with the sidebar dock /
 * history popover it floats above. Position + placement (above the history
 * controls) is set where it's mounted + a globals.css override.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            'group !gap-3 !rounded-[12px] !border !border-border !bg-popover !px-4 !py-3.5 !shadow-[var(--shadow-soft-lg)]',
          title: '!text-sm !font-medium !text-foreground',
          description: '!text-xs !text-muted-foreground',
          actionButton:
            '!h-7 !rounded-[8px] !bg-primary !px-3 !text-xs !font-medium !text-primary-foreground hover:!bg-primary/90',
          closeButton:
            '!border-border !bg-surface-3 !text-muted-foreground hover:!text-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
