'use client'

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
  return <EditorShell />
}
