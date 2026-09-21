'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { pickFiles } from '@/services/import'
import { addCustomFont, listCustomFonts } from '@/services/fonts'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell } from './DialogShell'

export default function FontsDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const [fonts, setFonts] = useState(listCustomFonts())
  return (
    <DialogShell id="fonts" title="Custom fonts" description="Load a TrueType/OpenType font from your computer to use non-Latin scripts and brand fonts. It is embedded (subset) into the PDF on export. Fonts stay local." footer={<Button onClick={close}>Done</Button>}>
      <Button variant="outline" onClick={async () => { const f = (await pickFiles({ accept: '.ttf,.otf,.woff,font/ttf,font/otf,font/woff', multiple: false }))[0]; if (!f) return; try { await addCustomFont(f); setFonts(listCustomFonts()); toast.success(`Loaded ${f.name}`) } catch (e) { toast.error((e as Error).message) } }} data-testid="load-font">Load font file…</Button>
      <ul className="divide-y rounded-md border">
        {!fonts.length && <li className="p-3 text-sm text-muted-foreground">No custom fonts loaded. Standard fonts (Helvetica, Times, Courier) cover Latin text; other characters are exported as images.</li>}
        {fonts.map((f) => <li key={f.key} className="px-3 py-2 text-sm">{f.name}</li>)}
      </ul>
      <p className="text-xs text-muted-foreground">Custom fonts are re-attached when you reopen a saved project that uses them.</p>
    </DialogShell>
  )
}
