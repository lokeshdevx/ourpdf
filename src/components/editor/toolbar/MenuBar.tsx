'use client'

import Link from 'next/link'
import { BrandMark, Wordmark } from '@/components/brand'
import { Menubar, MenubarContent, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar'
import { ThemeToggle } from '@/components/theme-toggle'
import { CommandMenuItems } from './CommandItems'
import { MobileMenu } from './MobileMenu'
import { MENUS } from './menus'

export function MenuBar() {
  return (
    <div className="flex items-center gap-1 border-b bg-background px-1.5 py-1" data-testid="menubar">
      <Link href="/" className="mr-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-sm font-semibold hover:bg-accent" aria-label="OurPDF home">
        <BrandMark size={24} />
        <Wordmark className="hidden text-sm sm:inline" />
      </Link>
      {/* Desktop / tablet: full menu bar */}
      <Menubar className="hidden h-8 border-0 bg-transparent p-0 shadow-none lg:flex">
        {MENUS.map((m) => (
          <MenubarMenu key={m.label}>
            <MenubarTrigger className="h-7 px-2 text-[13px]">{m.label}</MenubarTrigger>
            <MenubarContent className="max-h-[80vh] min-w-64 max-w-[calc(100vw-1rem)] overflow-auto">
              <CommandMenuItems items={m.items} />
            </MenubarContent>
          </MenubarMenu>
        ))}
      </Menubar>
      {/* Phones & tablets: full-height menu sheet with search and summaries */}
      <MobileMenu />
      <ThemeToggle className="ml-auto" />
    </div>
  )
}
