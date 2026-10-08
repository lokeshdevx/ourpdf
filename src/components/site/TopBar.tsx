'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme-toggle'
import { BrandMark, Wordmark } from '@/components/brand'
import { cn } from '@/lib/utils'
import { TOOLS, toolHref } from '@/tools/registry'
import { ToolIcon } from '@/tools/ui/ToolIcon'
import { InstallAppButton } from './InstallAppButton'
import { SidebarNav } from './SidebarNav'

/** Header search: type to jump straight to a tool (⌘/Ctrl + K to focus). */
function QuickSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const query = q.trim().toLowerCase()
  const results = useMemo(() => (query ? TOOLS.filter((t) => `${t.name} ${t.description} ${t.keywords.join(' ')}`.toLowerCase().includes(query)).slice(0, 8) : []), [query])
  const go = (href: string) => {
    setQ('')
    setOpen(false)
    input.current?.blur()
    router.push(href)
  }
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={input} type="search" value={q} role="combobox" aria-expanded={open && results.length > 0} aria-controls="quick-search-list" aria-label="Search tools"
        placeholder="Search tools…" className="h-10 w-full rounded-xl border bg-muted/50 pl-9 pr-14 text-sm outline-none transition focus:bg-background focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
          if (e.key === 'Enter' && results[sel]) go(toolHref(results[sel]))
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-background px-1.5 text-[10px] text-muted-foreground sm:block">Ctrl K</kbd>
      {open && results.length > 0 && (
        <ul id="quick-search-list" role="listbox" className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-xl border bg-popover p-1 shadow-xl">
          {results.map((t, i) => (
            <li key={t.slug} role="option" aria-selected={i === sel}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); go(toolHref(t)) }} onMouseEnter={() => setSel(i)} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === sel && 'bg-accent')}>
                <ToolIcon name={t.icon} className="size-4 shrink-0 text-primary" />
                <span className="min-w-0"><span className="block font-medium">{t.name}</span><span className="block truncate text-xs text-muted-foreground">{t.description}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TopBar() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 sm:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open tools menu" data-testid="mobile-nav-trigger"><Menu className="size-5" /></Button>
        </SheetTrigger>
        {/* focus the panel, not the search box: no keyboard popping up on phones until you tap Search */}
        <SheetContent side="left" className="sidebar-blue w-[300px] border-0 p-0 pt-2 outline-none [&>button]:text-white" data-testid="mobile-nav" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus() }}>
          <SheetHeader className="px-4 pb-1"><SheetTitle className="text-left"><span className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-white"><BrandMark size={22} /></span><span className="text-lg font-extrabold tracking-tight text-white">Our<span className="text-sky-200">PDF</span></span></span></SheetTitle></SheetHeader>
          <div className="h-[calc(100dvh-4rem)]"><SidebarNav onNavigate={() => setOpen(false)} /></div>
        </SheetContent>
      </Sheet>
      <Link href="/" aria-label="OurPDF home" className="flex items-center gap-2 lg:hidden"><BrandMark size={28} priority /><Wordmark className="text-lg" /></Link>
      <div className="hidden flex-1 sm:flex"><QuickSearch /></div>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <InstallAppButton />
        <Link href="/editor" className="hidden h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:inline-flex">Open editor</Link>
      </div>
    </header>
  )
}
