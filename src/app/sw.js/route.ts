import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { STANDALONE } from '@/tools/registry'

// Generated at request time from the actual build output, so the precache list always matches the deployed assets.
export const dynamic = 'force-dynamic'

function walk(dir: string, base: string, out: string[], filter: (f: string) => boolean) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, `${base}/${name}`, out, filter)
    else if (filter(name)) out.push(`${base}/${name}`)
  }
}

export function GET() {
  const root = process.cwd()
  const assets: string[] = []
  walk(join(root, '.next/static'), '/_next/static', assets, (f) => /\.(js|css|woff2?|wasm)$/.test(f))
  const pub: string[] = []
  walk(join(root, 'public/pdfjs'), '/pdfjs', pub, (f) => /\.(mjs|wasm|pfb|ttf|icc)$/.test(f) && !/cmaps/.test(f))
  walk(join(root, 'public/workers'), '/workers', pub, (f) => f.endsWith('.js'))
  const pages = ['/', '/editor', '/offline', '/features', '/privacy', '/other-tools', ...STANDALONE.map((t) => `/${t.slug}`), '/manifest.webmanifest', '/icon.png', '/logo-mark.png', '/icon-192.png', '/icon-512.png', '/tesseract/worker.min.js']
  const version = String(Date.now())
  const precache = [...new Set([...pages, ...assets, ...pub])]

  const body = `/* OurPDF service worker – generated. Caches the app shell and static assets. User documents are never cached. */
const VERSION = ${JSON.stringify(version)}
const SHELL = 'pdfstudio-shell-' + VERSION
const RUNTIME = 'pdfstudio-runtime-v1'
const PRECACHE = ${JSON.stringify(precache)}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    // Best effort per URL: one failure must not abort the whole install.
    await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('pdfstudio-shell-') && key !== SHELL) await caches.delete(key)
    await self.clients.claim()
  })())
})

const isStatic = (url) => /^\\/(_next\\/static|pdfjs|tesseract|tessdata|fonts|icon|apple-touch)/.test(url.pathname)

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // never touch cross-origin traffic
  if (url.pathname === '/sw.js') return

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        const copy = res.clone()
        if (res.ok) caches.open(RUNTIME).then((c) => c.put(req, copy))
        return res
      } catch {
        const cached = (await caches.match(req)) || (await caches.match(url.pathname)) || (await caches.match('/editor')) || (await caches.match('/offline'))
        return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      }
    })())
    return
  }

  if (isStatic(url)) {
    // Cache-first; large OCR language data / cmaps are cached the first time they are used.
    event.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)) }
      return res
    })())
    return
  }

  // RSC / data requests: network first, cache fallback.
  event.respondWith((async () => {
    try {
      const res = await fetch(req)
      if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)) }
      return res
    } catch {
      return (await caches.match(req)) || new Response('', { status: 504 })
    }
  })())
})
`
  return new Response(body, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Service-Worker-Allowed': '/' } })
}
