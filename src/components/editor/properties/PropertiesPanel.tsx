'use client'

import { useMemo } from 'react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDownToLine, ArrowUp, ArrowUpToLine, Bold, Copy, FlipHorizontal2, FlipVertical2, ImageIcon, Italic, Link2, Lock, LockOpen, Strikethrough, Trash2, Underline, ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { runCommand } from '@/features/commands'
import { parseLibKey } from '@/lib/font-library'
import { FontPicker } from '../FontPicker'
import { historyForObject } from '@/services/history'
import { ensureFontKey, siblingFace } from '@/services/fonts'
import { replaceSelectedImage } from '@/services/insert'
import { duplicateObjects, moveToLayer, patchObjects, removeObjects, reorderObjects } from '@/services/pdf/annotation-service'
import { useActiveLayers, useActiveObjects } from '@/stores/annotation-store'
import { useHistoryStore } from '@/stores/history-store'
import { usePageStore, useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { useActiveDocInfo, usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_FILTERS, type EditObject, type FieldObj, type FontFamilyKey, type ImageObj, type LinkObj, type TextObj } from '@/types'
import { ColorField, NumberField, Row, Section, SliderField } from '../controls'
import { formatBytes } from '@/utils/format'
import { displaySize } from '@/lib/geometry'
import { getAssetInfo } from '@/services/assets'
import { cn } from '@/lib/utils'
import { validateValue } from '@/services/pdf/form-service'

export function PropertiesPanel() {
  const docId = usePdfStore((s) => s.activeId)
  const objects = useActiveObjects()
  const selIds = useSelectionStore((s) => s.objectIds)
  const sel = useMemo(() => objects.filter((o) => selIds.includes(o.id)), [objects, selIds])
  useHistoryStore((s) => (docId ? s.byDoc[docId] : undefined))
  if (!docId) return <div className="p-4 text-sm text-muted-foreground">Open a document to see its properties.</div>
  return (
    <ScrollArea className="h-full" data-testid="properties-panel">
      {sel.length ? <ObjectProps docId={docId} sel={sel} /> : <PageProps docId={docId} />}
    </ScrollArea>
  )
}

/* ------------------------------------------------------------- page / doc */

function PageProps({ docId }: { docId: string }) {
  const pages = useActivePages()
  const cur = useCurrentPageIndex()
  const doc = useActiveDocInfo()
  const page = pages[cur]
  const d = page ? displaySize(page) : null
  const ocrCount = doc ? Object.keys(doc.ocr).length : 0
  void docId
  return (
    <div>
      <Section title="Page">
        {page && d && (
          <div className="space-y-1.5 text-xs">
            <Row label="Page">{cur + 1} of {pages.length}</Row>
            <Row label="Size">{Math.round(d.w)} × {Math.round(d.h)} pt ({(d.w / 72).toFixed(2)} × {(d.h / 72).toFixed(2)} in)</Row>
            <Row label="Rotation">{page.rotation}°{page.intrinsic ? ` (+${page.intrinsic}° built in)` : ''}</Row>
            <Row label="Crop / frame">{page.crop || page.frame ? 'Modified' : 'Original'}</Row>
            <Row label="Source">{page.sourceId ? `Page ${page.sourceIndex + 1} of source` : 'Blank page'}</Row>
          </div>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void runCommand('pages.rotateCw')}>Rotate</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void runCommand('pages.crop')}>Crop…</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void runCommand('pages.setup')}>Size & margins…</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void runCommand('pages.addBlank')}>Add blank</Button>
        </div>
      </Section>
      {doc && (
        <Section title="Document">
          <div className="space-y-1.5 text-xs">
            <Row label="File">{doc.name}</Row>
            <Row label="Pages">{pages.length}</Row>
            <Row label="Size">{formatBytes(doc.size)}</Row>
            <Row label="Title">{doc.metadata.title || <span className="text-muted-foreground">—</span>}</Row>
            <Row label="Author">{doc.metadata.author || <span className="text-muted-foreground">—</span>}</Row>
            <Row label="Forms">{doc.hasForms ? 'Has form fields' : 'No form fields'}</Row>
            <Row label="Encryption">{doc.encrypted ? 'Opened with password' : 'None'}</Row>
            <Row label="OCR">{ocrCount ? `${ocrCount} page(s) recognised` : 'None'}</Row>
          </div>
          <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={() => void runCommand('file.metadata')}>Edit metadata…</Button>
        </Section>
      )}
      <Section title="Tip">
        <p className="text-xs text-muted-foreground">Select an object on the page to edit its properties here. Pick a tool in the toolbar to draw new objects.</p>
      </Section>
    </div>
  )
}

/* ---------------------------------------------------------------- objects */

function ObjectProps({ docId, sel }: { docId: string; sel: EditObject[] }) {
  const layers = useActiveLayers()
  const first = sel[0]
  const single = sel.length === 1
  const same = sel.every((o) => o.type === first.type)
  const ids = sel.map((o) => o.id)
  const anyLocked = sel.some((o) => o.locked)
  const native = single && first.type === 'field' && first.native
  const patch = (p: Partial<EditObject>, label?: string, merge?: string) => patchObjects(docId, ids, p, label, merge ?? `prop:${Object.keys(p).join()}:${ids.join()}`)
  const geometryDisabled = anyLocked || native
  return (
    <div data-testid="object-props">
      <Section title={single ? `${labelOf(first)}` : `${sel.length} objects`}>
        <div className="flex flex-wrap gap-0.5">
          <IconBtn label="Duplicate" onClick={() => { const c = duplicateObjects(docId, ids); useSelectionStore.getState().setObjects(c.map((o) => o.id)) }}><Copy className="size-3.5" /></IconBtn>
          <IconBtn label={anyLocked ? 'Unlock' : 'Lock'} onClick={() => patch({ locked: !anyLocked }, anyLocked ? 'Unlock' : 'Lock')} pressed={anyLocked}>{anyLocked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}</IconBtn>
          <IconBtn label="Bring to front" onClick={() => reorderObjects(docId, ids, 'front')}><ArrowUpToLine className="size-3.5" /></IconBtn>
          <IconBtn label="Bring forward" onClick={() => reorderObjects(docId, ids, 'forward')}><ArrowUp className="size-3.5" /></IconBtn>
          <IconBtn label="Send backward" onClick={() => reorderObjects(docId, ids, 'backward')}><ArrowDown className="size-3.5" /></IconBtn>
          <IconBtn label="Send to back" onClick={() => reorderObjects(docId, ids, 'back')}><ArrowDownToLine className="size-3.5" /></IconBtn>
          <IconBtn label="Delete" onClick={() => removeObjects(docId, ids)} danger><Trash2 className="size-3.5" /></IconBtn>
        </div>
        {native && <p className="text-[11px] text-muted-foreground">This field comes from the PDF. Its value can be changed and it can be deleted; its position is fixed.</p>}
      </Section>

      {single && (
        <Section title="Position & size">
          <div className="grid grid-cols-2 gap-2">
            <Row2 label="X"><NumberField value={first.x} onChange={(v) => patch({ x: v }, 'Move', `x:${first.id}`)} label="X" disabled={geometryDisabled} suffix="pt" /></Row2>
            <Row2 label="Y"><NumberField value={first.y} onChange={(v) => patch({ y: v }, 'Move', `y:${first.id}`)} label="Y" disabled={geometryDisabled} suffix="pt" /></Row2>
            <Row2 label="Width"><NumberField value={first.w} onChange={(v) => patch({ w: v }, 'Resize', `w:${first.id}`)} label="Width" min={1} disabled={geometryDisabled} suffix="pt" /></Row2>
            <Row2 label="Height"><NumberField value={first.h} onChange={(v) => patch({ h: v }, 'Resize', `h:${first.id}`)} label="Height" min={1} disabled={geometryDisabled} suffix="pt" /></Row2>
          </div>
          <Row label="Rotation"><NumberField value={first.rotation} onChange={(v) => patch({ rotation: ((v % 360) + 360) % 360 }, 'Rotate', `rot:${first.id}`)} label="Rotation" min={0} max={360} disabled={geometryDisabled} suffix="°" /></Row>
        </Section>
      )}
      <Section title="Appearance">
        <SliderField label="Opacity" value={Math.round(first.opacity * 100)} min={5} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ opacity: v / 100 }, 'Opacity')} />
        {layers.length > 1 && (
          <Row label="Layer">
            <Select value={first.layerId} onValueChange={(v) => moveToLayer(docId, ids, v)}>
              <SelectTrigger className="h-8 text-xs" aria-label="Layer"><SelectValue /></SelectTrigger>
              <SelectContent>{layers.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </Row>
        )}
      </Section>

      {same && first.type === 'text' && <TextProps sel={sel as TextObj[]} patch={patch} />}
      {same && first.type === 'markup' && (
        <Section title="Markup">
          <Row label="Colour"><ColorField value={first.color} onChange={(v) => v && patch({ color: v }, 'Colour')} label="Markup colour" /></Row>
          <Row label="Style">
            <Select value={first.kind} onValueChange={(v) => patch({ kind: v as never, opacity: v === 'highlight' ? 0.4 : 1 }, 'Change markup style')}>
              <SelectTrigger className="h-8 text-xs" aria-label="Markup style"><SelectValue /></SelectTrigger>
              <SelectContent>{['highlight', 'underline', 'strike', 'squiggly'].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </Row>
        </Section>
      )}
      {same && first.type === 'note' && (
        <Section title="Note">
          <Textarea aria-label="Note text" value={first.text} onChange={(e) => patch({ text: e.target.value }, 'Edit note', `note:${first.id}`)} className="min-h-24 text-xs" placeholder="Type your comment…" />
          <Row label="Author"><Input value={first.author} onChange={(e) => patch({ author: e.target.value }, 'Note author', `na:${first.id}`)} className="h-8 text-xs" aria-label="Author" /></Row>
          <Row label="Colour"><ColorField value={first.color} onChange={(v) => v && patch({ color: v })} label="Note colour" /></Row>
        </Section>
      )}
      {same && first.type === 'ink' && (
        <Section title="Stroke">
          <Row label="Colour"><ColorField value={first.color} onChange={(v) => v && patch({ color: v })} label="Stroke colour" /></Row>
          <Row label="Thickness"><NumberField value={first.width} onChange={(v) => patch({ width: v }, 'Thickness', `tw:${first.id}`)} label="Thickness" min={0.25} max={60} step={0.5} suffix="pt" /></Row>
        </Section>
      )}
      {same && first.type === 'shape' && (
        <Section title="Shape">
          <Row label="Border"><ColorField value={first.stroke} onChange={(v) => v && patch({ stroke: v })} label="Border colour" /></Row>
          {['rect', 'rrect', 'ellipse', 'polygon', 'star', 'cloud'].includes(first.shape) && <Row label="Fill"><ColorField value={first.fill} onChange={(v) => patch({ fill: v })} label="Fill colour" allowNone /></Row>}
          <Row label="Thickness"><NumberField value={first.strokeWidth} onChange={(v) => patch({ strokeWidth: v }, 'Thickness', `tw:${first.id}`)} label="Border thickness" min={0} max={60} step={0.5} suffix="pt" /></Row>
          <Row label="Line style">
            <Select value={first.dash} onValueChange={(v) => patch({ dash: v as never })}>
              <SelectTrigger className="h-8 text-xs" aria-label="Line style"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="solid">Solid</SelectItem><SelectItem value="dashed">Dashed</SelectItem><SelectItem value="dotted">Dotted</SelectItem></SelectContent>
            </Select>
          </Row>
          {first.shape === 'rrect' && <Row label="Radius"><NumberField value={first.radius ?? 10} onChange={(v) => patch({ radius: v }, 'Corner radius', `rr:${first.id}`)} label="Corner radius" min={0} suffix="pt" /></Row>}
          {first.shape === 'star' && <Row label="Points"><NumberField value={first.sides ?? 5} onChange={(v) => patch({ sides: Math.round(v) }, 'Star points', `sp:${first.id}`)} label="Star points" min={3} max={12} /></Row>}
          {['line', 'arrow', 'darrow'].includes(first.shape) && (
            <Row label="Ends">
              <Select value={first.shape} onValueChange={(v) => patch({ shape: v as never })}>
                <SelectTrigger className="h-8 text-xs" aria-label="Line ends"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="line">Plain line</SelectItem><SelectItem value="arrow">Arrow</SelectItem><SelectItem value="darrow">Double arrow</SelectItem></SelectContent>
              </Select>
            </Row>
          )}
        </Section>
      )}
      {same && first.type === 'stamp' && (
        <Section title="Stamp">
          <Row label="Text"><Input value={first.label} onChange={(e) => patch({ label: e.target.value }, 'Stamp text', `st:${first.id}`)} className="h-8 text-xs" aria-label="Stamp text" /></Row>
          <Row label="Colour"><ColorField value={first.color} onChange={(v) => v && patch({ color: v })} label="Stamp colour" /></Row>
          <Row label="Date"><Checkbox checked={first.showDate} onCheckedChange={(v) => patch({ showDate: v === true })} aria-label="Show date" /></Row>
          <Row label="Dynamic"><Checkbox checked={first.dynamic} onCheckedChange={(v) => patch({ dynamic: v === true })} aria-label="Expand {date} and {time}" /></Row>
        </Section>
      )}
      {same && first.type === 'image' && <ImageProps sel={sel as ImageObj[]} patch={patch} />}
      {same && first.type === 'redact' && (
        <Section title="Redaction">
          <Row label="Colour"><ColorField value={first.color} onChange={(v) => v && patch({ color: v })} label="Redaction colour" /></Row>
          <Row label="Reason"><Input value={first.reason} onChange={(e) => patch({ reason: e.target.value }, 'Redaction reason', `rr:${first.id}`)} className="h-8 text-xs" aria-label="Redaction reason" placeholder="e.g. Personal data" /></Row>
          <Row label="Label"><Input value={first.overlayText} onChange={(e) => patch({ overlayText: e.target.value }, 'Redaction label', `rl:${first.id}`)} className="h-8 text-xs" aria-label="Overlay text" placeholder="e.g. REDACTED" /></Row>
          <Button size="sm" variant="destructive" className="h-8 w-full text-xs" onClick={() => void runCommand('sec.applyRedactions')}>Apply redactions permanently…</Button>
          <p className="text-[11px] text-muted-foreground">Until applied, this is only a mark. Exporting always applies it.</p>
        </Section>
      )}
      {same && first.type === 'link' && <LinkProps link={first} patch={patch} />}
      {same && first.type === 'field' && single && <FieldProps f={first} patch={patch} />}

      {single && <ObjectHistory docId={docId} id={first.id} />}
    </div>
  )
}

const labelOf = (o: EditObject) => ({ text: 'Text', markup: 'Text markup', note: 'Sticky note', ink: 'Drawing', shape: 'Shape', stamp: 'Stamp', image: o.type === 'image' && o.role === 'signature' ? 'Signature' : 'Image', redact: 'Redaction', link: 'Link', field: 'Form field' })[o.type]

function IconBtn({ label, children, onClick, pressed, danger }: { label: string; children: React.ReactNode; onClick: () => void; pressed?: boolean; danger?: boolean }) {
  return (
    <Button size="icon-sm" variant="outline" className={cn('size-7', danger && 'text-destructive')} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </Button>
  )
}
function Row2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

type PatchFn = (p: Partial<EditObject>, label?: string, merge?: string) => void

/* ------------------------------------------------------------------ text */

function TextProps({ sel, patch }: { sel: TextObj[]; patch: PatchFn }) {
  const t = sel[0]
  useUiStore((s) => s.fontsEpoch)
  const isCustom = t.font.startsWith('custom:')
  const lib = parseLibKey(t.font)
  const sw = t.fontSwap
  const usingAlt = !!sw && t.font === sw.alt.font && t.bold === sw.alt.bold && t.italic === sw.alt.italic && !(t.font === sw.home.font && t.bold === sw.home.bold && t.italic === sw.home.italic)
  // choosing a font by hand: the detected home/alt fonts keep their automatic behaviour, anything else ends it
  const pickFont = (key: FontFamilyKey) => {
    const choice = sw && (key === sw.home.font ? sw.home : key === sw.alt.font ? sw.alt : null)
    if (choice) return patch({ font: choice.font, bold: choice.bold, italic: choice.italic, letterSpacing: choice.letterSpacing }, 'Change font')
    patch({ font: key, ...(key.startsWith('custom:') ? { bold: false, italic: false } : {}), ...(sw ? { fontSwap: undefined, letterSpacing: 0 } : {}) }, 'Change font')
  }
  // library faces are separate files per weight/style: the Bold / Italic buttons switch to the matching face of the family
  const setStyle = async (v: string[]) => {
    const rest = { underline: v.includes('underline'), strike: v.includes('strike') }
    if (!lib) return patch({ bold: v.includes('bold'), italic: v.includes('italic'), ...rest }, 'Text style')
    const key = siblingFace(t.font, { bold: v.includes('bold'), italic: v.includes('italic') })
    if (key && (await ensureFontKey(key))) {
      const swap = sw ? { fontSwap: { ...sw, home: sw.home.font === t.font ? { ...sw.home, font: key } : sw.home, alt: sw.alt.font === t.font ? { ...sw.alt, font: key } : sw.alt } } : {}
      patch({ font: key, ...rest, ...swap }, 'Text style')
    } else patch(rest, 'Text style')
  }
  return (
    <Section title="Text">
      {sel.length === 1 && (
        <Textarea aria-label="Text content" value={t.text} onChange={(e) => patch({ text: e.target.value }, 'Edit text', `txt:${t.id}`)} className="min-h-20 font-mono text-xs" />
      )}
      <Row label="Font"><FontPicker value={t.font} onPick={pickFont} hint={{ bold: t.bold, italic: t.italic }} /></Row>
      {sw ? (
        <p className="text-[11px] leading-snug text-muted-foreground" data-testid="font-note">
          Detected in PDF: <span className="font-medium text-foreground" data-testid="font-detected">{sw.detected || 'unknown font'}</span>
          {sw.kind === 'embedded' ? ' – its embedded font is reused, so edits look identical.' : sw.kind === 'library' ? ' – not embedded, so the closest matching font from the built-in library is used.' : ' – drawn with the closest standard PDF font.'}
          {usingAlt && sw.kind === 'embedded' && ' Some typed characters are not in the PDF’s embedded subset, so the closest match is used for this text.'}
        </p>
      ) : isCustom ? (
        <p className="text-[11px] text-muted-foreground" data-testid="font-note">{lib ? 'Bold and italic switch to the matching face of this font family.' : 'This is one specific font face – bold and italic come from the font itself.'}</p>
      ) : null}
      <Row label="Size"><NumberField value={t.fontSize} onChange={(v) => patch({ fontSize: v, autoFit: false }, 'Font size', `fs:${t.id}`)} label="Font size" min={2} max={400} step={0.5} suffix="pt" /></Row>
      <Row label="Style">
        <ToggleGroup type="multiple" size="sm" value={[(lib ? lib.weight >= 600 : t.bold) && 'bold', (lib ? lib.italic : t.italic) && 'italic', t.underline && 'underline', t.strike && 'strike'].filter(Boolean) as string[]} onValueChange={(v) => void setStyle(v)} aria-label="Text style" className="justify-start">
          <ToggleGroupItem value="bold" aria-label="Bold" disabled={isCustom && !lib}><Bold className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic" disabled={isCustom && !lib}><Italic className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline"><Underline className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="strike" aria-label="Strikethrough"><Strikethrough className="size-3.5" /></ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <Row label="Colour"><ColorField value={t.color} onChange={(v) => v && patch({ color: v }, 'Text colour')} label="Text colour" /></Row>
      <Row label="Highlight"><ColorField value={t.bg} onChange={(v) => patch({ bg: v }, 'Text background')} label="Background colour" allowNone /></Row>
      <Row label="Align">
        <ToggleGroup type="single" size="sm" value={t.align} onValueChange={(v) => v && patch({ align: v as never }, 'Alignment')} aria-label="Alignment" className="justify-start">
          <ToggleGroupItem value="left" aria-label="Left"><AlignLeft className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Centre"><AlignCenter className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Right"><AlignRight className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="justify" aria-label="Justify"><AlignJustify className="size-3.5" /></ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <Row label="Line height"><NumberField value={t.lineHeight} onChange={(v) => patch({ lineHeight: v }, 'Line height', `lh:${t.id}`)} label="Line height" min={0.8} max={4} step={0.05} /></Row>
      <Row label="Spacing"><NumberField value={t.letterSpacing} onChange={(v) => patch({ letterSpacing: v }, 'Character spacing', `ls:${t.id}`)} label="Character spacing" min={-5} max={40} step={0.1} suffix="pt" /></Row>
      <Row label="List">
        <Select value={t.list} onValueChange={(v) => patch({ list: v as never }, 'List style')}>
          <SelectTrigger className="h-8 text-xs" aria-label="List style"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="bullet">Bullets</SelectItem><SelectItem value="number">Numbered</SelectItem></SelectContent>
        </Select>
      </Row>
      <Row label="Wrap"><Checkbox checked={!t.noWrap} onCheckedChange={(v) => patch({ noWrap: v !== true }, 'Text wrapping')} aria-label="Wrap text inside the box" /></Row>
      <Row label="Auto-fit"><Checkbox checked={t.autoFit} onCheckedChange={(v) => patch({ autoFit: v === true }, 'Auto-fit text')} aria-label="Auto-fit text to box" /></Row>
      <Row label="Border"><ColorField value={t.border?.color ?? null} onChange={(v) => patch({ border: v ? { color: v, width: t.border?.width ?? 1 } : null }, 'Text border')} label="Border colour" allowNone /></Row>
      <Row label="Hyperlink">
        <div className="flex items-center gap-1">
          <Input value={t.link?.url ?? ''} placeholder="https://…" onChange={(e) => patch({ link: e.target.value ? { kind: 'url', url: e.target.value } : null }, 'Hyperlink', `lk:${t.id}`)} className="h-8 text-xs" aria-label="Hyperlink URL" />
          {t.link && <Button size="icon-sm" variant="ghost" className="size-7" aria-label="Remove hyperlink" onClick={() => patch({ link: null }, 'Remove hyperlink')}><Link2 className="size-3.5" /></Button>}
        </div>
      </Row>
      {t.cover && <p className="text-[11px] text-muted-foreground">Replaces existing page text: the original is covered by a background patch. Use Redact to remove it permanently.</p>}
    </Section>
  )
}

/* ----------------------------------------------------------------- image */

function ImageProps({ sel, patch }: { sel: ImageObj[]; patch: PatchFn }) {
  const im = sel[0]
  const info = getAssetInfo(im.assetId)
  const f = im.filters
  const crop = im.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const setCrop = (side: 'left' | 'right' | 'top' | 'bottom', pct: number) => {
    const l = side === 'left' ? pct / 100 : crop.x
    const r = side === 'right' ? pct / 100 : 1 - crop.x - crop.w
    const t = side === 'top' ? pct / 100 : crop.y
    const b = side === 'bottom' ? pct / 100 : 1 - crop.y - crop.h
    const c = { x: Math.min(l, 0.9), y: Math.min(t, 0.9), w: Math.max(0.05, 1 - Math.min(l, 0.9) - r), h: Math.max(0.05, 1 - Math.min(t, 0.9) - b) }
    const empty = c.x === 0 && c.y === 0 && Math.abs(c.w - 1) < 1e-6 && Math.abs(c.h - 1) < 1e-6
    // keep displayed scale: resize the box so the visible part is not distorted
    patch({ crop: empty ? null : c, w: im.w * (c.w / crop.w), h: im.h * (c.h / crop.h), x: im.x + (c.x - crop.x) * (im.w / crop.w), y: im.y + (c.y - crop.y) * (im.h / crop.h) }, 'Crop image', `crop:${im.id}`)
  }
  return (
    <>
      <Section title="Image">
        {info && <p className="text-[11px] text-muted-foreground">{info.width} × {info.height} px · {formatBytes(info.size)}</p>}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => void replaceSelectedImage()}><ImageIcon className="size-3.5" /> Replace…</Button>
          <IconBtn label="Flip horizontally" onClick={() => patch({ flipH: !im.flipH }, 'Flip horizontal')} pressed={im.flipH}><FlipHorizontal2 className="size-3.5" /></IconBtn>
          <IconBtn label="Flip vertically" onClick={() => patch({ flipV: !im.flipV }, 'Flip vertical')} pressed={im.flipV}><FlipVertical2 className="size-3.5" /></IconBtn>
        </div>
        <Row label="Compression"><SliderField label="JPEG quality (100% = lossless)" value={Math.round(im.quality * 100)} min={10} max={100} step={1} format={(v) => (v >= 100 ? 'Lossless' : `${v}%`)} onChange={(v) => patch({ quality: v / 100 }, 'Image compression', `q:${im.id}`)} /></Row>
        {im.quality < 0.999 && <p className="text-[11px] text-muted-foreground">Below 100% the image is embedded as JPEG (transparency becomes white).</p>}
      </Section>
      <Section title="Crop (%)">
        <div className="grid grid-cols-2 gap-2">
          <Row2 label="Left"><NumberField value={Math.round(crop.x * 100)} onChange={(v) => setCrop('left', v)} label="Crop left" min={0} max={90} suffix="%" /></Row2>
          <Row2 label="Right"><NumberField value={Math.round((1 - crop.x - crop.w) * 100)} onChange={(v) => setCrop('right', v)} label="Crop right" min={0} max={90} suffix="%" /></Row2>
          <Row2 label="Top"><NumberField value={Math.round(crop.y * 100)} onChange={(v) => setCrop('top', v)} label="Crop top" min={0} max={90} suffix="%" /></Row2>
          <Row2 label="Bottom"><NumberField value={Math.round((1 - crop.y - crop.h) * 100)} onChange={(v) => setCrop('bottom', v)} label="Crop bottom" min={0} max={90} suffix="%" /></Row2>
        </div>
        {im.crop && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => patch({ crop: null, w: im.w / crop.w, h: im.h / crop.h, x: im.x - crop.x * (im.w / crop.w), y: im.y - crop.y * (im.h / crop.h) }, 'Reset crop')}>Reset crop</Button>}
      </Section>
      <Section title="Adjustments">
        <SliderField label="Brightness" value={Math.round(f.brightness * 100)} min={20} max={200} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ filters: { ...f, brightness: v / 100 } }, 'Brightness', `br:${im.id}`)} />
        <SliderField label="Contrast" value={Math.round(f.contrast * 100)} min={20} max={200} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ filters: { ...f, contrast: v / 100 } }, 'Contrast', `co:${im.id}`)} />
        <SliderField label="Saturation" value={Math.round(f.saturation * 100)} min={0} max={300} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ filters: { ...f, saturation: v / 100 } }, 'Saturation', `sa:${im.id}`)} />
        <SliderField label="Grayscale" value={Math.round(f.grayscale * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ filters: { ...f, grayscale: v / 100 } }, 'Grayscale', `gr:${im.id}`)} />
        <SliderField label="Blur" value={f.blur} min={0} max={20} step={1} format={(v) => `${v}px`} onChange={(v) => patch({ filters: { ...f, blur: v } }, 'Blur', `bl:${im.id}`)} />
        <SliderField label="Sharpen" value={Math.round(f.sharpen * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ filters: { ...f, sharpen: v / 100 } }, 'Sharpen', `sh:${im.id}`)} />
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => patch({ filters: { ...DEFAULT_FILTERS } }, 'Reset adjustments')}>Reset adjustments</Button>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ link */

function LinkProps({ link, patch }: { link: LinkObj; patch: PatchFn }) {
  const t = link.target
  return (
    <Section title="Link">
      <Row label="Type">
        <Select value={t.kind} onValueChange={(v) => patch({ target: v === 'url' ? { kind: 'url', url: 'https://' } : v === 'email' ? { kind: 'email', address: '' } : { kind: 'page', pageId: undefined } } as never, 'Link type')}>
          <SelectTrigger className="h-8 text-xs" aria-label="Link type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="url">Web address</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="page">Page in this document</SelectItem></SelectContent>
        </Select>
      </Row>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => useUiStore.getState().openDialog('link', { objectId: link.id })}>Edit target…</Button>
      <Row label="Border"><ColorField value={link.border.color} onChange={(v) => v && patch({ border: { ...link.border, color: v } } as never, 'Link border')} label="Link border colour" /></Row>
      <Row label="Style">
        <Select value={link.border.style} onValueChange={(v) => patch({ border: { ...link.border, style: v } } as never, 'Link style')}>
          <SelectTrigger className="h-8 text-xs" aria-label="Link border style"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">Invisible</SelectItem><SelectItem value="solid">Solid</SelectItem><SelectItem value="dashed">Dashed</SelectItem></SelectContent>
        </Select>
      </Row>
      <Row label="Width"><NumberField value={link.border.width} onChange={(v) => patch({ border: { ...link.border, width: v } } as never, 'Link border width', `lw:${link.id}`)} label="Link border width" min={0} max={10} step={0.5} suffix="pt" /></Row>
    </Section>
  )
}

/* ------------------------------------------------------------------ field */

function FieldProps({ f, patch }: { f: FieldObj; patch: PatchFn }) {
  const err = validateValue(f, f.value)
  return (
    <Section title={`Form field · ${f.ftype}`}>
      <Row label="Name"><Input value={f.fieldName} disabled={f.native} onChange={(e) => patch({ fieldName: e.target.value.replace(/\s+/g, '_') }, 'Rename field', `fn:${f.id}`)} className="h-8 text-xs" aria-label="Field name" /></Row>
      {(f.ftype === 'text' || f.ftype === 'date') && <Row label="Value"><Input value={String(f.value)} onChange={(e) => patch({ value: e.target.value }, 'Field value', `fv:${f.id}`)} className="h-8 text-xs" aria-label="Field value" /></Row>}
      {(f.ftype === 'text' || f.ftype === 'date') && <Row label="Default"><Input value={String(f.defaultValue)} onChange={(e) => patch({ defaultValue: e.target.value }, 'Default value', `fd:${f.id}`)} className="h-8 text-xs" aria-label="Default value" /></Row>}
      {(f.ftype === 'checkbox' || f.ftype === 'radio') && <Row label="Checked"><Checkbox checked={f.value === true} onCheckedChange={(v) => patch({ value: v === true, defaultValue: v === true }, 'Field value')} aria-label="Checked" /></Row>}
      {f.ftype === 'radio' && <Row label="Choice value"><Input value={f.exportValue} onChange={(e) => patch({ exportValue: e.target.value }, 'Radio value', `fe:${f.id}`)} className="h-8 text-xs" aria-label="Radio export value" /></Row>}
      {(f.ftype === 'dropdown' || f.ftype === 'listbox') && (
        <Row label="Options">
          <Textarea value={f.options.join('\n')} disabled={f.native} onChange={(e) => patch({ options: e.target.value.split('\n') }, 'Field options', `fo:${f.id}`)} className="min-h-20 text-xs" aria-label="Options, one per line" placeholder="One option per line" />
        </Row>
      )}
      {f.ftype === 'button' && <Row label="Label"><Input value={f.label} onChange={(e) => patch({ label: e.target.value }, 'Button label', `fl:${f.id}`)} className="h-8 text-xs" aria-label="Button label" /></Row>}
      <Row label="Tooltip"><Input value={f.tooltip} onChange={(e) => patch({ tooltip: e.target.value }, 'Tooltip', `ft:${f.id}`)} className="h-8 text-xs" aria-label="Tooltip" /></Row>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <Label className="flex items-center gap-1.5 font-normal"><Checkbox checked={f.required} onCheckedChange={(v) => patch({ required: v === true }, 'Required')} /> Required</Label>
        <Label className="flex items-center gap-1.5 font-normal"><Checkbox checked={f.readOnly} onCheckedChange={(v) => patch({ readOnly: v === true }, 'Read-only')} /> Read-only</Label>
        {f.ftype === 'text' && <Label className="flex items-center gap-1.5 font-normal"><Checkbox checked={f.multiline} onCheckedChange={(v) => patch({ multiline: v === true }, 'Multiline')} /> Multi-line</Label>}
      </div>
      <Row label="Font size"><NumberField value={f.fontSize} onChange={(v) => patch({ fontSize: v }, 'Field font size', `ffs:${f.id}`)} label="Field font size" min={4} max={40} suffix="pt" /></Row>
      <Row label="Tab order"><NumberField value={f.tabIndex} onChange={(v) => patch({ tabIndex: Math.round(v) }, 'Tab order', `fto:${f.id}`)} label="Tab order" min={0} max={999} /></Row>
      {(f.ftype === 'text' || f.ftype === 'date') && (
        <>
          <Row label="Validation">
            <Select value={f.validation.kind} onValueChange={(v) => patch({ validation: { ...f.validation, kind: v as never } }, 'Field validation')}>
              <SelectTrigger className="h-8 text-xs" aria-label="Validation"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="maxlength">Max length</SelectItem>
                <SelectItem value="regex">Pattern (regex)</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          {f.validation.kind === 'regex' && <Row label="Pattern"><Input value={f.validation.pattern ?? ''} onChange={(e) => patch({ validation: { ...f.validation, pattern: e.target.value } }, 'Validation pattern', `vp:${f.id}`)} className="h-8 font-mono text-xs" aria-label="Validation pattern" /></Row>}
          {f.validation.kind === 'maxlength' && <Row label="Max"><NumberField value={f.validation.max ?? 10} onChange={(v) => patch({ validation: { ...f.validation, max: Math.round(v) } }, 'Max length', `vm:${f.id}`)} label="Maximum length" min={1} /></Row>}
          {f.validation.kind !== 'none' && <Row label="Message"><Input value={f.validation.message ?? ''} onChange={(e) => patch({ validation: { ...f.validation, message: e.target.value } }, 'Validation message', `vg:${f.id}`)} className="h-8 text-xs" aria-label="Validation message" /></Row>}
        </>
      )}
      {err && <p className="text-[11px] text-destructive" role="alert">Current value: {err}</p>}
    </Section>
  )
}

/* --------------------------------------------------------- object history */

function ObjectHistory({ docId, id }: { docId: string; id: string }) {
  const items = historyForObject(docId, id).slice(0, 8)
  if (!items.length) return null
  return (
    <Section title="History of this object">
      <ol className="space-y-0.5 text-[11px] text-muted-foreground">
        {items.map((c) => (
          <li key={c.id} className="flex justify-between gap-2">
            <span className="truncate">{c.label}</span>
            <time dateTime={new Date(c.time).toISOString()}>{new Date(c.time).toLocaleTimeString()}</time>
          </li>
        ))}
      </ol>
    </Section>
  )
}

export { usePageStore }
