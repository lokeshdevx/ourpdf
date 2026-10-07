'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'

const EditorShell = dynamic(() => import('./EditorShell').then((m) => m.EditorShell), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground" role="status">
      Loading OurPDF…
    </div>
  ),
})

export function EditorLoader() {
  useEffect(() => {
    // arriving from a website page (client-side navigation) with analytics loaded: reload the editor without it
    if ((window as unknown as { clarity?: unknown }).clarity) window.location.reload()
  }, [])
  return <EditorShell />
}
