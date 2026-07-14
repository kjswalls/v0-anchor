import type { Metadata, Viewport } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { SupabaseProvider } from '@/components/providers/supabase-provider'
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
  // Keep in sync with --surface-0 in app/globals.css (oklch → hex)
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eeede9' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1019' },
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SupabaseProvider>
            {children}
          </SupabaseProvider>
          {/* Bottom-left so the undo toast rises from the same corner as the
              sidebar history controls; offset lifts it clear of the dock.
              Single-value offset in sonner 1.x — tune if it sits too high/low. */}
          <Toaster position="bottom-left" offset={96} closeButton />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
