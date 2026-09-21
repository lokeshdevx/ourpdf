'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const LINKS = [
  { href: '/features', label: 'All features' },
  { href: '/#tools', label: 'Tools' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/#faq', label: 'FAQ' },
]

export function MobileNav({ tools }: { tools: { slug: string; label: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation menu" data-testid="mobile-nav-trigger">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto" data-testid="mobile-nav">
        <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4 pb-8">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-base font-medium hover:bg-accent">{l.label}</Link>
          ))}
          <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">PDF tools</div>
          {tools.map((t) => (
            <Link key={t.slug} href={`/${t.slug}`} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm hover:bg-accent">{t.label}</Link>
          ))}
          <Link href="/editor" onClick={() => setOpen(false)} className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">Open editor</Link>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
