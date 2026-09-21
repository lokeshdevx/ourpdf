import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

// Strict, privacy-enforcing CSP: the browser itself refuses any network request to a foreign origin,
// so user documents cannot leave the machine even if a bug or dependency tried to send them.
const csp = [
  "default-src 'self'",
  // Next.js emits inline bootstrap scripts (no nonce on static pages). No eval, ever, in production.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "connect-src 'self' blob: data:" + (isProd ? '' : ' ws: wss:'),
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ]
    return [
      { source: '/:path*', headers: [...security, { key: 'Content-Security-Policy', value: csp }] },
      // Service worker must always be revalidated so updates roll out.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
    ]
  },
}

export default nextConfig
