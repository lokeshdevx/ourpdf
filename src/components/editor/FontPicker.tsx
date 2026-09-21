'use client'

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FONT_LIBRARY, libFamily, pickFace, libKey, parseLibKey } from '@/lib/font-library'
import { STANDARD_FAMILIES } from '@/lib/fonts'
import { ensureFontKey, listCustomFonts } from '@/services/fonts'
import { useUiStore } from '@/stores/ui-store'
import type { FontFamilyKey } from '@/types'

const toValue = (k: FontFamilyKey) => {
  const p = parseLibKey(k)
  return p ? `lib:${p.id}` : k
}

/**
 * Font dropdown: fonts found in the open PDF, the user's own fonts, the standard PDF fonts and the bundled open-licence
 * library (loaded on demand). `hint` picks the weight/italic when a library family is chosen.
 */
export function FontPicker({ value, onPick, hint, className = 'h-8 text-xs', ariaLabel = 'Font' }: { value: FontFamilyKey; onPick: (key: FontFamilyKey) => void; hint?: { bold?: boolean; italic?: boolean }; className?: string; ariaLabel?: string }) {
  useUiStore((s) => s.fontsEpoch)
  const all = listCustomFonts()
  const pdf = all.filter((f) => f.origin === 'pdf')
  const user = all.filter((f) => f.origin === 'user')
  const choose = async (v: string) => {
    let key = v as FontFamilyKey
    if (v.startsWith('lib:')) {
      const fam = libFamily(v.slice(4))
      if (!fam) return
      const cur = parseLibKey(value)
      const f = pickFace(fam, cur ? cur.weight : hint?.bold ? 700 : 400, cur ? cur.italic : !!hint?.italic)
      key = libKey(fam.id, f.weight, f.italic)
    }
    if (await ensureFontKey(key)) onPick(key)
  }
  // a font the registry does not know yet (e.g. right after a reload) still needs an item so the trigger shows something
  const known = value === toValue(value) && !value.startsWith('custom:') ? true : all.some((f) => f.key === value) || value.startsWith('lib:') || !!parseLibKey(value)
  return (
    <Select value={toValue(value)} onValueChange={(v) => void choose(v)}>
      <SelectTrigger className={className} aria-label={ariaLabel}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-80">
        {pdf.length > 0 && (
          <SelectGroup>
            <SelectLabel>Fonts in this PDF</SelectLabel>
            {pdf.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}
          </SelectGroup>
        )}
        {user.length > 0 && (
          <SelectGroup>
            <SelectLabel>Your fonts</SelectLabel>
            {user.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}
          </SelectGroup>
        )}
        {!known && <SelectItem value={value}>{value.replace(/^custom:/, '')}</SelectItem>}
        <SelectGroup>
          <SelectLabel>Standard PDF fonts</SelectLabel>
          {STANDARD_FAMILIES.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Font library</SelectLabel>
          {FONT_LIBRARY.map((f) => <SelectItem key={f.id} value={`lib:${f.id}`}>{f.name}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
