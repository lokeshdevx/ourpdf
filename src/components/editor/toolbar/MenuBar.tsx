'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { BrandMark, Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Menubar, MenubarContent, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar'
import { formatCombo } from '@/features/shortcuts'
import { getCommand, isEnabled, runCommand, shortcutOf } from '@/features/commands'
import { ThemeToggle } from '@/components/theme-toggle'
import { CommandMenuItems, type MenuEntry } from './CommandItems'
import { MENUS } from './menus'

function MobileItems({ items }: { items: MenuEntry[] }) {
  return (
    <>
      {items.map((e, i) => {
        if (e === '-') return <DropdownMenuSeparator key={`s${i}`} />
        if (typeof e === 'object')
          return (
            <DropdownMenuSub key={e.sub}>
              <DropdownMenuSubTrigger>{e.sub}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[60vh] overflow-auto">
                <MobileItems items={e.items} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        const c = getCommand(e)
        if (!c) return null
        const sc = formatCombo(shortcutOf(c))
        return (
          <DropdownMenuItem key={c.id} disabled={!isEnabled(c)} onSelect={() => void runCommand(c.id)}>
            {c.title}
            {sc && <span className="ml-auto text-xs text-muted-foreground">{sc}</span>}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

export function MenuBar() {
  return (
    <div className="flex items-center gap-1 border-b bg-background px-1.5 py-1" data-testid="menubar">
      <Link href="/" className="mr-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-sm font-semibold hover:bg-accent" aria-label="OurPDF home">
        <BrandMark size={24} />
        <Wordmark className="hidden text-sm sm:inline" />
      </Link>
      {/* Desktop / tablet: full menu bar */}
      <Menubar className="hidden h-8 border-0 bg-transparent p-0 shadow-none md:flex">
        {MENUS.map((m) => (
          <MenubarMenu key={m.label}>
            <MenubarTrigger className="h-7 px-2 text-[13px]">{m.label}</MenubarTrigger>
            <MenubarContent className="max-h-[80vh] min-w-56 overflow-auto">
              <CommandMenuItems items={m.items} />
            </MenubarContent>
          </MenubarMenu>
        ))}
      </Menubar>
      {/* Mobile: one hamburger with nested menus */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Menu">
            <Menu className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[80vh] w-64 overflow-auto">
          {MENUS.map((m) => (
            <DropdownMenuSub key={m.label}>
              <DropdownMenuSubTrigger>{m.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[60vh] w-64 overflow-auto">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{m.label}</DropdownMenuLabel>
                <MobileItems items={m.items} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ThemeToggle className="ml-auto" />
    </div>
  )
}
