'use client'

import { useEffect } from 'react'

/** Registers the offline service worker (production only – it would fight HMR in development, where it is removed). */
export function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      // a worker left over from a production run on this origin would keep serving stale cache-first chunks
      navigator.serviceWorker.getRegistrations().then(async (regs) => {
        if (!regs.length) return
        await Promise.all(regs.map((r) => r.unregister()))
        for (const key of await caches.keys()) if (key.startsWith('pdfstudio-')) await caches.delete(key)
        location.reload()
      }).catch(() => {})
      return
    }
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])
  return null
}
