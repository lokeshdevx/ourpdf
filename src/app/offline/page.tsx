import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Offline', robots: { index: false } }

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">You’re offline</h1>
      <p className="text-muted-foreground">This page isn’t cached yet. OurPDF works offline once you’ve opened the editor online at least once. Your local projects are still available in the editor.</p>
      <Link href="/editor" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Try the editor</Link>
    </main>
  )
}
