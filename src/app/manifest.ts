import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} – Private PDF Editor`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/editor',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2b5fd9',
    categories: ['productivity', 'utilities'],
    file_handlers: [{ action: '/editor', accept: { 'application/pdf': ['.pdf'] } }] as never,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
