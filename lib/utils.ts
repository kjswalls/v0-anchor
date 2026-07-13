import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge our custom content-typeface utilities (app/globals.css):
// text-content sets font-size+line-height; font-content sets family+weight.
// Without this, twMerge misreads text-content as a text-COLOR class and drops
// it whenever a real color class (e.g. text-muted-foreground) follows.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': ['text-content'],
      'font-family': ['font-content'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
