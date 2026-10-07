'use client'

import { useState } from 'react'
import { Note, Panel, Segmented } from '../kit'
import { SplitBySize } from './pages'

const PRESETS = [
  ['scn', 'SCN reply (DRC-06)', 5],
  ['appeal', 'Appeal (APL-01 / APL-05)', 5],
  ['refund', 'Refund documents (RFD-01)', 5],
  ['small', 'Strict 2 MB limit', 2],
] as const

export function GstFilingPrep() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number][0]>('scn')
  const p = PRESETS.find((x) => x[0] === preset)!
  return (
    <div className="space-y-6">
      <Panel title="Filing type">
        <Segmented value={preset} onChange={setPreset} options={PRESETS.map(([id, label]) => [id, label] as const)} />
        <div className="mt-4 space-y-3">
          <Note>The GST portal rejects attachments over its size limit (typically {p[2]} MB per file for this form). This tool compresses your compiled PDF and, if it is still too big, splits it into numbered parts that each fit. Limits change – check the current one on the portal before uploading.</Note>
          <p className="text-xs text-muted-foreground">Tip: name parts in order (e.g. “Annexure-1 part1”, “part2”) and mention the split in your reply so the officer reads them together.</p>
        </div>
      </Panel>
      <SplitBySize key={preset} presetMb={p[2] - 0.1} compressFirst />
    </div>
  )
}
