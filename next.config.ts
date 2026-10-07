import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

// Strict, privacy-enforcing CSP: the browser itself refuses any network request to a foreign origin,
// so user documents cannot leave the machine even if a bug or dependency tried to send them.
const directives = (analytics: boolean) => [
  "default-src 'self'",
  // Next.js emits inline bootstrap scripts (no nonce on static pages). No eval, ever, in production.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${isProd ? '' : " 'unsafe-eval'"}${analytics ? ' https://www.clarity.ms https://*.clarity.ms' : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${analytics ? ' https://*.clarity.ms https://c.bing.com' : ''}`,
  "font-src 'self' data: blob:",
  "connect-src 'self' blob: data:" + (isProd ? '' : ' ws: wss:') + (analytics ? ' https://*.clarity.ms https://c.bing.com' : ''),
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join('; ')
// Public website pages allow Microsoft Clarity (anonymous usage analytics); the editor never does.
const csp = directives(true)
const strictCsp = directives(false)

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Tool pages live at clean root URLs; older paths redirect permanently so search rankings carry over.
  async redirects() {
    const moved: [string, string][] = [
      ['/tools', '/'], ['/tools/:slug', '/:slug'], ['/pdf-editor', '/edit-pdf'], ['/annotate-pdf', '/edit-pdf'], ['/jpg-to-pdf', '/images-to-pdf'], ['/pdf-to-png', '/pdf-to-jpg'],
      ['/crop-pdf', '/crop-resize-pdf'], ['/watermark-pdf', '/add-watermark'], ['/extract-pdf-pages', '/split-pdf'], ['/delete-pdf-pages', '/organize-pdf'], ['/reorder-pdf-pages', '/organize-pdf'],
    ]
    return moved.map(([source, destination]) => ({ source, destination, permanent: true }))
  },
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      // camera / microphone only for this origin (Scan Document, Thumbmark Maker, Audio → PDF recording)
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ]
    return [
      { source: '/:path*', headers: [...security, { key: 'Content-Security-Policy', value: csp }] },
      // later rules override earlier ones for the same header: the editor keeps the no-outside-connections policy
      { source: '/editor', headers: [{ key: 'Content-Security-Policy', value: strictCsp }] },
      // Service worker must always be revalidated so updates roll out.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
    ]
  },
}

export default nextConfig
