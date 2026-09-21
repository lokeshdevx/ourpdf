/** Shortcut combos look like "mod+shift+z" (mod = Ctrl on Windows/Linux, ⌘ on macOS). */

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const ALIASES: Record<string, string> = { ' ': 'space', esc: 'escape', del: 'delete', '+': 'plus', '=': 'plus', '-': 'minus', _: 'minus' }

export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  let key = e.key.toLowerCase()
  key = ALIASES[key] ?? key
  if (['control', 'meta', 'alt', 'shift'].includes(key)) return ''
  // ⌘/Ctrl + "+" is typed as "=" or "+" depending on layout; treat both as plus. Shift+= yields "+".
  if (key === 'plus' && parts.includes('shift')) parts.splice(parts.indexOf('shift'), 1)
  parts.push(key)
  return parts.join('+')
}

export function normalizeCombo(c: string): string {
  const parts = c.toLowerCase().split('+').map((p) => ALIASES[p] ?? p)
  const mods = ['mod', 'alt', 'shift'].filter((m) => parts.includes(m))
  const key = parts.filter((p) => !['mod', 'alt', 'shift'].includes(p))[0] ?? ''
  return [...mods, key].join('+')
}

export function formatCombo(combo: string): string {
  if (!combo) return ''
  const mac = isMac()
  return combo
    .split('+')
    .map((p) => {
      switch (p) {
        case 'mod':
          return mac ? '⌘' : 'Ctrl'
        case 'alt':
          return mac ? '⌥' : 'Alt'
        case 'shift':
          return mac ? '⇧' : 'Shift'
        case 'plus':
          return '+'
        case 'minus':
          return '−'
        case 'escape':
          return 'Esc'
        case 'delete':
          return 'Del'
        case 'space':
          return 'Space'
        default:
          return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)
      }
    })
    .join(mac ? '' : '+')
}
