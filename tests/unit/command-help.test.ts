import { describe, expect, it } from 'vitest'
import { COMMANDS, helpOf } from '@/features/commands'
import { COMMAND_HELP, FIELD_HELP } from '@/features/command-help'
import { MENUS } from '@/components/editor/toolbar/menus'
import type { MenuEntry } from '@/components/editor/toolbar/CommandItems'

const flat = (items: MenuEntry[]): string[] => items.flatMap((e) => (e === '-' ? [] : typeof e === 'object' ? flat(e.items) : [e]))

describe('tool descriptions', () => {
  it('every command explains what it does', () => {
    const missing = COMMANDS.filter((c) => !helpOf(c)).map((c) => c.id)
    expect(missing).toEqual([])
    for (const c of COMMANDS) expect(helpOf(c).length, c.id).toBeGreaterThan(15)
  })
  it('has no descriptions for commands that do not exist', () => {
    const ids = new Set(COMMANDS.map((c) => c.id))
    expect(Object.keys(COMMAND_HELP).filter((k) => !ids.has(k))).toEqual([])
  })
  it('every menu entry resolves to a command', () => {
    const ids = new Set(COMMANDS.map((c) => c.id))
    for (const m of MENUS) expect(flat(m.items).filter((id) => !ids.has(id)), m.label).toEqual([])
  })
  it('field hints are short, plain sentences', () => {
    for (const [k, v] of Object.entries(FIELD_HELP)) {
      expect(v.length, k).toBeGreaterThan(8)
      expect(v.length, k).toBeLessThan(200)
    }
  })
})
