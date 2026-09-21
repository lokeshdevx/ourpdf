'use client'

import {
  MenubarCheckboxItem,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
} from '@/components/ui/menubar'
import { formatCombo } from '@/features/shortcuts'
import { getCommand, isEnabled, runCommand, shortcutOf } from '@/features/commands'

export type MenuEntry = string | '-' | { sub: string; items: MenuEntry[] }

export function CommandMenuItems({ items }: { items: MenuEntry[] }) {
  return (
    <>
      {items.map((entry, i) => {
        if (entry === '-') return <MenubarSeparator key={`s${i}`} />
        if (typeof entry === 'object')
          return (
            <MenubarSub key={entry.sub}>
              <MenubarSubTrigger>{entry.sub}</MenubarSubTrigger>
              <MenubarSubContent className="max-h-[70vh] overflow-auto">
                <CommandMenuItems items={entry.items} />
              </MenubarSubContent>
            </MenubarSub>
          )
        const c = getCommand(entry)
        if (!c) return null
        const Icon = c.icon
        const sc = formatCombo(shortcutOf(c))
        const disabled = !isEnabled(c)
        if (c.checked) {
          return (
            <MenubarCheckboxItem key={c.id} checked={c.checked()} disabled={disabled} onSelect={() => void runCommand(c.id)} data-command={c.id}>
              {c.title}
              {sc && <MenubarShortcut>{sc}</MenubarShortcut>}
            </MenubarCheckboxItem>
          )
        }
        return (
          <MenubarItem key={c.id} disabled={disabled} onSelect={() => void runCommand(c.id)} data-command={c.id}>
            {Icon && <Icon className="size-4" aria-hidden />}
            {c.title}
            {sc && <MenubarShortcut>{sc}</MenubarShortcut>}
          </MenubarItem>
        )
      })}
    </>
  )
}
