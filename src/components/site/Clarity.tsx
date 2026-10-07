'use client'

import { useEffect } from 'react'

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? 'yu5j05ml1l'

/**
 * Microsoft Clarity (anonymous usage analytics) – loaded only on the public website pages, in production.
 * It is never loaded inside the editor, and the tool area on tool pages is masked (data-clarity-mask), so document
 * names, previews and text are never recorded.
 */
export function Clarity() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !CLARITY_ID) return
    const w = window as unknown as { clarity?: ((...a: unknown[]) => void) & { q?: unknown[][] } }
    if (w.clarity) return
    const q: unknown[][] = []
    const fn = Object.assign((...args: unknown[]) => void q.push(args), { q })
    w.clarity = fn
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.clarity.ms/tag/${CLARITY_ID}`
    document.head.appendChild(s)
  }, [])
  return null
}
