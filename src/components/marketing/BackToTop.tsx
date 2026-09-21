'use client'

import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Floating "back to top" button – the marketing pages are long, especially on phones. */
export function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 900)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!show) return null
  return (
    <button
      type="button"
      aria-label="Back to top"
      data-testid="back-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed right-4 bottom-4 z-30 grid size-11 place-items-center rounded-full border bg-background/90 text-foreground shadow-lg backdrop-blur transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  )
}
