'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Blocks, ChevronDown, Home, LayoutGrid, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORIES, TOOLS, toolHref } from '@/tools/registry'
import { ToolIcon } from '@/tools/ui/ToolIcon'

const KEY = 'ourpdf.sidebar.closed'

/** Shorter labels so every tool fits the narrow rail (the page title keeps the full name). */
const SHORT: Record<string, string> = {
  'split-pdf-by-bookmarks': 'Split by Bookmarks', 'split-pdf-by-text': 'Split by Text', 'split-pdf-by-size': 'Split by Size', 'split-pdf-in-half': 'Split in Half',
  'pages-per-sheet': 'Pages per Sheet', 'edit-pdf': 'Edit PDF', 'csv-pdf': 'CSV ↔ PDF', 'extract-images': 'Extract Images', 'ocr-pdf': 'OCR (Searchable PDF)',
  'gst-invoice-generator': 'GST Invoice', 'pdf-workflow': 'Workflow Builder', 'encrypt-pdf': 'Encrypt PDF', 'chat-with-pdf': 'Chat with PDF',
}

/** All tools grouped by category, with a filter box. Every tool is a real link (crawlable). */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname()
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<string[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore collapsed groups saved in this browser
      if (raw) setClosed(JSON.parse(raw))
    } catch {
      /* storage unavailable */
    }
  }, [])
  const toggle = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id]
    setClosed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  const query = q.trim().toLowerCase()
  const match = useMemo(() => (query ? TOOLS.filter((t) => `${t.name} ${t.keywords.join(' ')}`.toLowerCase().includes(query)) : TOOLS), [query])
  const item = (href: string, label: React.ReactNode, icon: React.ReactNode, extra?: string) => {
    const active = path === href
    return (
      <Link href={href} title={typeof label === 'string' ? label : undefined} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cn('group flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-semibold leading-snug transition-colors duration-150', active ? 'bg-white text-[var(--side-active)] shadow-sm' : 'text-white/85 hover:bg-white/10 hover:text-white', extra)}>
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </Link>
    )
  }
  return (
    <nav aria-label="Tools" className="flex h-full flex-col" data-testid="sidebar-nav">
      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Find a tool</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-white/60" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tool…" className="h-10 w-full rounded-lg border-0 bg-white/12 pl-8 pr-2 text-sm font-medium text-white outline-none transition placeholder:text-white/60 focus:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/50" />
        </label>
      </div>
      <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-3 pb-6">
        {!query && (
          <div className="mb-3 space-y-0.5 border-b border-white/15 pb-3">
            {item('/', 'All tools', <Home className="size-4 shrink-0" aria-hidden />)}
            {item('/editor', 'Full PDF editor', <LayoutGrid className="size-4 shrink-0" aria-hidden />)}
            {item('/features', 'Features', <Sparkles className="size-4 shrink-0" aria-hidden />)}
            {item('/privacy', 'Privacy', <ShieldCheck className="size-4 shrink-0" aria-hidden />)}
            {item('/other-tools', 'Other tools', <Blocks className="size-4 shrink-0" aria-hidden />)}
          </div>
        )}
        {CATEGORIES.map((c) => {
          const items = match.filter((t) => t.category === c.id)
          if (!items.length) return null
          const open = !!query || !closed.includes(c.id) || items.some((t) => path === toolHref(t))
          return (
            <div key={c.id} className="pb-1">
              <button type="button" onClick={() => toggle(c.id)} aria-expanded={open} className="flex w-full items-center justify-between rounded-md px-2.5 py-2 mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55 hover:text-white">
                {c.title}
                <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} aria-hidden />
              </button>
              {open && <div className="space-y-0.5">{items.map((t) => <div key={t.slug}>{item(toolHref(t), SHORT[t.slug] ?? t.name.replace(/ – .*$/, ''), <ToolIcon name={t.icon} className={cn('size-4 shrink-0', path === toolHref(t) ? 'text-[var(--side-active)]' : 'text-white/70 group-hover:text-white')} />)}</div>)}</div>}
            </div>
          )
        })}
        {query && !match.length && <p className="px-2.5 py-4 text-sm text-white/70">No tool matches “{q}”.</p>}
        {!query && (
          <div className="mt-4 rounded-xl bg-white/10 p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4" aria-hidden /> 100% private</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-white/75">Every tool runs in your browser. Your files are never uploaded.</p>
          </div>
        )}
      </div>
    </nav>
  )
}
