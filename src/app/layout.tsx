import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SwRegister } from '@/components/sw-register'
import { SITE, SOCIAL_IMAGE } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} – private, in-browser PDF editor`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  manifest: '/manifest.webmanifest',
  openGraph: { type: 'website', siteName: SITE.name, title: SITE.name, description: SITE.description, locale: 'en_US', images: [SOCIAL_IMAGE] },
  twitter: { card: 'summary_large_image', title: SITE.name, description: SITE.description, images: [SOCIAL_IMAGE.url] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  category: 'technology',
  icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icon.png', type: 'image/png' }], apple: '/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0f' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster richColors closeButton position="bottom-right" />
          <SwRegister />
        </ThemeProvider>
      </body>
    </html>
  )
}
