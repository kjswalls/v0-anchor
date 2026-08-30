import type { Metadata, Viewport } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { SupabaseProvider } from '@/components/providers/supabase-provider'
import { ConsoleSlotGuard } from '@/components/providers/console-slot-guard'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// Variable font: full weight range + optical sizing; italic for serif microcopy
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-source-serif',
})

export const metadata: Metadata = {
  title: 'Anchor — ADHD-Friendly Daily Planning',
  description: 'A calm, minimal daily planner designed for neurodivergent minds. Plan your day with gentle structure.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Anchor',
  },
  icons: {
    icon: [
      {
        url: '/icons/icon-16.png',
        sizes: '16x16',
        type: 'image/png',
      },
      {
        url: '/icons/icon-32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: '/icons/icon-180.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // Keep in sync with --surface-0 in app/globals.css (oklch → hex), AND with
  // the 'default' entry in lib/theme-palettes.ts — the palette sync effect
  // rewrites these metas per palette and restores this pair for the default.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1014' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${sourceSerif.variable} font-sans antialiased`}>
        {/* Palette pre-hydration: stamp <html data-theme> from the raw
            localStorage key before first paint, the way next-themes pre-applies
            the .dark class — without this a non-default palette flashes the
            stock ground on every hard load. The key literal and slug grammar
            mirror lib/theme-palettes.ts (PALETTE_STORAGE_KEY); `?reset-theme`
            is the escape hatch for a palette bad enough to hide the UI that
            would undo it. The reset also sets a one-shot sessionStorage flag —
            hydrateSettings consumes it and persists 'default' server-side,
            otherwise the server row would re-apply the broken palette one
            settings round-trip later. Unknown slugs stamp harmlessly (no CSS
            block answers) and the provider effect re-syncs them after mount. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(/[?&]reset-theme\\b/.test(location.search)){localStorage.removeItem('anchor-palette');sessionStorage.setItem('anchor-palette-reset','1')}else{var p=localStorage.getItem('anchor-palette');if(p&&p!=='default'&&/^[a-z][a-z0-9-]{0,31}$/.test(p)){document.documentElement.dataset.theme=p}}}catch(e){}",
          }}
        />
        {/* No `disableTransitionOnChange`: it injected `transition: none` across
            the document and repainted every colour in one frame, which reads as
            a page reload. lib/theme-transition.ts + the `data-theme-changing`
            rule in globals.css grant a short, colour-only transition instead. */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SupabaseProvider>
            {/* Route-level, not shell-level, because its whole job is to notice
                that you have LEFT the shell. See the component. */}
            <ConsoleSlotGuard />
            {children}
          </SupabaseProvider>
          {/* Bottom-left, above the sidebar history controls. Exact placement
              (clear of the dock on either shell) is a
              globals.css override — sonner 1.x only takes a single offset. */}
          <Toaster position="bottom-left" closeButton />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
