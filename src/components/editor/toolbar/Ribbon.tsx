'use client'

import { useState } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ChevronDown, Command as CommandIcon, Italic, Redo2, Strikethrough, Underline, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getCommand, runCommand, shortcutOf } from '@/features/commands'
import { formatCombo } from '@/features/shortcuts'
import { STAMP_PRESETS } from '@/lib/stamps'
import { FontPicker } from '../FontPicker'
import { useHistoryStore } from '@/stores/history-store'
import { useAnnotationStore } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import type { ToolId } from '@/types'
import { ColorField, NumberField } from '../controls'
import { applyCropFromDraft, trimWhitespace } from '@/services/pdf/crop-actions'
import { cn } from '@/lib/utils'

function CmdButton({ id, active, className, label }: { id: string; active?: boolean; className?: string; label?: string }) {
  const c = getCommand(id)
  if (!c) return null
  const Icon = c.icon
  const sc = formatCombo(shortcutOf(c))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label={label ?? c.title}
          aria-pressed={c.checked ? !!active : undefined}
          data-command={id}
          className={cn('size-8', active && 'bg-primary/15 text-primary ring-1 ring-primary/40', className)}
          onClick={() => void runCommand(id)}
        >
          {Icon ? <Icon className="size-4" /> : c.title[0]}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label ?? c.title}
        {sc && <span className="ml-2 opacity-70">{sc}</span>}
        {c.note && <div className="mt-1 max-w-64 text-[11px] opacity-80">{c.note}</div>}
      </TooltipContent>
    </Tooltip>
  )
}

/** A button that shows the last-used tool of a group and opens a dropdown for the rest. */
function ToolGroup({ ids, label }: { ids: string[]; label: string }) {
  const tool = useToolStore((s) => s.tool)
  const [last, setLast] = useState(ids[0])
  const activeId = ids.find((id) => getCommand(id)?.checked?.())
  const shown = activeId ?? last
  const c = getCommand(shown)!
  const Icon = c.icon
  const active = !!activeId
  void tool
  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={active ? 'secondary' : 'ghost'} size="icon-sm" className={cn('size-8 rounded-r-none', active && 'bg-primary/15 text-primary ring-1 ring-primary/40')} aria-label={c.title} aria-pressed={active} data-command={shown} onClick={() => void runCommand(shown)}>
            {Icon && <Icon className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{c.title}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="h-8 w-4 rounded-l-none px-0" aria-label={`${label} tools`}>
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {ids.map((id) => {
            const cc = getCommand(id)!
            const I = cc.icon
            return (
              <DropdownMenuItem key={id} data-command={id} onSelect={() => { setLast(id); void runCommand(id) }}>
                {I && <I className="size-4" />}
                {cc.title}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const Sep = () => <Separator orientation="vertical" className="mx-1 h-6" />

export function Ribbon() {
  const docId = usePdfStore((s) => s.activeId)
  const canUndo = useHistoryStore((s) => (docId ? (s.byDoc[docId]?.undo.length ?? 0) > 0 : false))
  const canRedo = useHistoryStore((s) => (docId ? (s.byDoc[docId]?.redo.length ?? 0) > 0 : false))
  const tool = useToolStore((s) => s.tool)
  const sticky = useToolStore((s) => s.sticky)
  useAnnotationStore((s) => s.byDoc)
  const disabled = !docId
  return (
    <div className="border-b bg-background" data-testid="ribbon">
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1 scroll-thin" role="toolbar" aria-label="Tools" aria-orientation="horizontal">
        <Button variant="ghost" size="icon-sm" className="size-8" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={() => void runCommand('edit.undo')} data-command="edit.undo">
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" className="size-8" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!canRedo} onClick={() => void runCommand('edit.redo')} data-command="edit.redo">
          <Redo2 className="size-4" />
        </Button>
        <Sep />
        <div className={cn('flex items-center gap-0.5', disabled && 'pointer-events-none opacity-50')}>
          <CmdButton id="tool.select" active={tool === 'select'} />
          <CmdButton id="tool.hand" active={tool === 'hand'} />
          <Sep />
          <CmdButton id="text.add" active={tool === 'text'} />
          <CmdButton id="text.edit" active={tool === 'edit-text'} />
          <Sep />
          <ToolGroup label="Markup" ids={['tool.highlight', 'tool.underline', 'tool.strike', 'tool.squiggly']} />
          <CmdButton id="tool.note" active={tool === 'note'} />
          <ToolGroup label="Draw" ids={['tool.pen', 'tool.pencil', 'tool.marker', 'tool.brush']} />
          <CmdButton id="tool.eraser" active={tool === 'eraser'} />
          <ToolGroup label="Shapes" ids={['tool.rect', 'tool.rrect', 'tool.ellipse', 'tool.line', 'tool.arrow', 'tool.darrow', 'tool.polygon', 'tool.star', 'tool.cloud', 'tool.path']} />
          <CmdButton id="tool.callout" active={tool === 'callout'} />
          <Sep />
          <CmdButton id="tool.stamp" active={tool === 'stamp'} />
          <CmdButton id="image.insert" />
          <CmdButton id="sign.create" />
          <CmdButton id="annotate.link" active={tool === 'link'} />
          <CmdButton id="sec.redact" active={tool === 'redact'} />
          <CmdButton id="pages.cropTool" active={tool === 'crop'} />
          <Sep />
          <ToolGroup label="Form fields" ids={['form.field-text', 'form.field-checkbox', 'form.field-radio', 'form.field-dropdown', 'form.field-listbox', 'form.field-button', 'form.field-date', 'form.field-signature']} />
        </div>
        <div className="ml-auto flex items-center gap-1 pl-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => document.dispatchEvent(new CustomEvent('pdfstudio:palette'))} aria-label="Open command palette" data-testid="palette-button">
            <CommandIcon className="size-3.5" /> <span className="hidden sm:inline">Search tools</span> <kbd className="hidden rounded border px-1 text-[10px] sm:inline">Ctrl K</kbd>
          </Button>
        </div>
      </div>
      <OptionsBar tool={tool} sticky={sticky} />
    </div>
  )
}

const DRAW_TOOLS: ToolId[] = ['pen', 'pencil', 'marker', 'brush']
const SHAPE_TOOLS: ToolId[] = ['line', 'arrow', 'darrow', 'rect', 'rrect', 'ellipse', 'polygon', 'star', 'cloud', 'path']
const TEXT_TOOLS: ToolId[] = ['text', 'heading', 'list', 'callout']
const MARKUP_TOOLS: ToolId[] = ['highlight', 'underline', 'strike', 'squiggly']

function OptionsBar({ tool, sticky }: { tool: ToolId; sticky: boolean }) {
  const o = useToolStore((s) => s.options)
  const set = useToolStore((s) => s.setOptions)
  const cropDraft = useUiStore((s) => s.cropDraft)
  const formMode = useUiStore((s) => s.formMode)
  const wrap = 'flex min-h-9 items-center gap-2 overflow-x-auto border-t bg-muted/30 px-2 py-1 text-xs scroll-thin'
  const hint = (t: string) => <span className="text-muted-foreground">{t}</span>
  const stickyToggle = (
    <Toggle size="sm" pressed={sticky} onPressedChange={(v) => useToolStore.getState().setSticky(v)} className="h-7 px-2 text-xs" aria-label="Keep tool active after each use">
      Keep tool
    </Toggle>
  )
  if (tool === 'select') return <div className={wrap}>{hint('Select objects to edit them. Double-click text to edit. Drag empty space to select page text. Use the Properties panel for details.')}</div>
  if (tool === 'hand') return <div className={wrap}>{hint('Drag to pan. Hold Space for temporary panning in any tool. Ctrl/Cmd + wheel or pinch to zoom.')}</div>
  if (TEXT_TOOLS.includes(tool)) {
    return (
      <div className={wrap} data-testid="options-text">
        <FontPicker value={o.font} onPick={(k) => set({ font: k })} hint={{ bold: o.bold, italic: o.italic }} className="h-8 w-40 text-xs" />
        <NumberField value={o.fontSize} onChange={(v) => set({ fontSize: v })} label="Font size" min={4} max={300} className="w-16" />
        <ToggleGroup type="multiple" size="sm" value={[o.bold && 'bold', o.italic && 'italic', o.underline && 'underline', o.strike && 'strike'].filter(Boolean) as string[]} onValueChange={(v) => set({ bold: v.includes('bold'), italic: v.includes('italic'), underline: v.includes('underline'), strike: v.includes('strike') })} aria-label="Text style">
          <ToggleGroupItem value="bold" aria-label="Bold"><Bold className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic"><Italic className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline"><Underline className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="strike" aria-label="Strikethrough"><Strikethrough className="size-3.5" /></ToggleGroupItem>
        </ToggleGroup>
        <ColorField value={o.textColor} onChange={(v) => v && set({ textColor: v })} label="Text colour" />
        <ToggleGroup type="single" size="sm" value={o.align} onValueChange={(v) => v && set({ align: v as typeof o.align })} aria-label="Alignment">
          <ToggleGroupItem value="left" aria-label="Align left"><AlignLeft className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align centre"><AlignCenter className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right"><AlignRight className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="justify" aria-label="Justify"><AlignJustify className="size-3.5" /></ToggleGroupItem>
        </ToggleGroup>
        {hint('Click or drag on the page, type, then click away (Ctrl+Enter) to place.')}
        {stickyToggle}
      </div>
    )
  }
  if (tool === 'edit-text')
    return <div className={wrap}>{hint('Click a line of text to edit it, or drag over several lines to edit a paragraph. The original is covered and replaced with an overlay – use Redact to remove content permanently.')}</div>
  if (MARKUP_TOOLS.includes(tool)) {
    const key = tool === 'highlight' ? 'highlightColor' : tool === 'underline' ? 'underlineColor' : 'strikeColor'
    return (
      <div className={wrap} data-testid="options-markup">
        <ColorField value={o[key]} onChange={(v) => v && set({ [key]: v })} label="Markup colour" />
        <ToggleGroup type="single" size="sm" value={o.markupMode} onValueChange={(v) => v && set({ markupMode: v as 'text' | 'area' })} aria-label="Markup mode">
          <ToggleGroupItem value="text" className="px-2 text-xs">Text</ToggleGroupItem>
          <ToggleGroupItem value="area" className="px-2 text-xs">Area</ToggleGroupItem>
        </ToggleGroup>
        {hint(o.markupMode === 'text' ? 'Select text on the page to mark it.' : 'Drag a rectangle to mark an area (useful on scans).')}
        {stickyToggle}
      </div>
    )
  }
  if (DRAW_TOOLS.includes(tool) || SHAPE_TOOLS.includes(tool)) {
    const isDraw = DRAW_TOOLS.includes(tool)
    const closed = ['rect', 'rrect', 'ellipse', 'polygon', 'star', 'cloud'].includes(tool)
    return (
      <div className={wrap} data-testid="options-shape">
        <ColorField value={tool === 'marker' ? o.highlightColor : o.stroke} onChange={(v) => v && set(tool === 'marker' ? { highlightColor: v } : { stroke: v })} label="Border colour" />
        {closed && <ColorField value={o.fill} onChange={(v) => set({ fill: v })} label="Fill colour" allowNone />}
        <NumberField value={o.strokeWidth} onChange={(v) => set({ strokeWidth: v })} label="Border width" min={0.25} max={40} step={0.5} className="w-24" suffix="pt" />
        {!isDraw && (
          <Select value={o.dash} onValueChange={(v) => set({ dash: v as typeof o.dash })}>
            <SelectTrigger className="h-8 w-24 text-xs" aria-label="Line style"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="dashed">Dashed</SelectItem>
              <SelectItem value="dotted">Dotted</SelectItem>
            </SelectContent>
          </Select>
        )}
        <NumberField value={Math.round(o.opacity * 100)} onChange={(v) => set({ opacity: v / 100 })} label="Opacity" min={5} max={100} step={5} className="w-24" suffix="%" />
        {tool === 'polygon' && hint('Click to add points; double-click, Enter, or click the first point to finish.')}
        {tool === 'path' && hint('Click to add curve points; double-click or Enter to finish.')}
        {tool === 'eraser' && hint('Drag over strokes and shapes to erase them.')}
        {stickyToggle}
      </div>
    )
  }
  if (tool === 'eraser') return <div className={wrap}>{hint('Drag over pen strokes, shapes, notes and markup to erase them.')}{stickyToggle}</div>
  if (tool === 'stamp') {
    return (
      <div className={wrap} data-testid="options-stamp">
        <Select value={STAMP_PRESETS.find((p) => p.label === o.stampLabel)?.id ?? 'custom'} onValueChange={(id) => { const p = STAMP_PRESETS.find((x) => x.id === id); if (p) set({ stampLabel: p.label, stampColor: p.color, stampDate: !!p.showDate, stampDynamic: !!p.dynamic }) }}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Stamp preset"><SelectValue placeholder="Custom" /></SelectTrigger>
          <SelectContent>{STAMP_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={o.stampLabel} onChange={(e) => set({ stampLabel: e.target.value })} className="h-8 w-44 text-xs" aria-label="Stamp text" placeholder="Custom text ({date} {time})" />
        <ColorField value={o.stampColor} onChange={(v) => v && set({ stampColor: v })} label="Stamp colour" />
        <Toggle size="sm" pressed={o.stampDate} onPressedChange={(v) => set({ stampDate: v })} className="h-7 px-2 text-xs">Show date</Toggle>
        <Toggle size="sm" pressed={o.stampDynamic} onPressedChange={(v) => set({ stampDynamic: v })} className="h-7 px-2 text-xs" title="Expand {date} and {time} placeholders">Dynamic</Toggle>
        {hint('Click on the page to stamp.')}
        {stickyToggle}
      </div>
    )
  }
  if (tool === 'redact')
    return (
      <div className={wrap} data-testid="options-redact">
        <ColorField value={o.redactColor} onChange={(v) => v && set({ redactColor: v })} label="Redaction colour" />
        <Input value={o.redactReason} onChange={(e) => set({ redactReason: e.target.value })} className="h-8 w-48 text-xs" aria-label="Redaction reason" placeholder="Reason (optional)" />
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void runCommand('sec.redactText')}>Redact text…</Button>
        <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => void runCommand('sec.applyRedactions')}>Apply redactions…</Button>
        <Toggle size="sm" pressed={useUiStore.getState().redactPreview} onPressedChange={(v) => useUiStore.getState().set({ redactPreview: v })} className="h-7 px-2 text-xs">Preview</Toggle>
        {hint('Drag to mark. Marks are permanent only after “Apply”; export always applies them.')}
        {stickyToggle}
      </div>
    )
  if (tool === 'link')
    return (
      <div className={wrap}>
        <Input value={o.linkUrl} onChange={(e) => set({ linkUrl: e.target.value })} className="h-8 w-64 text-xs" aria-label="Default link URL" />
        {hint('Drag a rectangle, then set the target in the dialog (URL, email or page).')}
      </div>
    )
  if (tool === 'crop')
    return (
      <div className={wrap} data-testid="options-crop">
        {hint(cropDraft ? 'Adjust the crop rectangle, then apply.' : 'Drag on a page to draw the crop area.')}
        <Button size="sm" className="h-8 text-xs" disabled={!cropDraft} onClick={() => applyCropFromDraft('current')}>Apply to this page</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!cropDraft} onClick={() => applyCropFromDraft('selected')}>Selected pages</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!cropDraft} onClick={() => applyCropFromDraft('all')}>All pages</Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void trimWhitespace()}>Trim white margins</Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { useUiStore.getState().set({ cropDraft: null }); useToolStore.getState().setTool('select') }}>Cancel</Button>
      </div>
    )
  if (tool === 'image') return <div className={wrap}>{hint('Click or drag on the page to place the image. Resize with the corner handles.')}</div>
  if (tool === 'note') return <div className={wrap}>{hint('Click on the page to add a sticky note, then type in the Properties panel.')}{stickyToggle}</div>
  if (tool.startsWith('field-'))
    return (
      <div className={wrap}>
        {hint('Drag to draw the field. Configure name, validation, required, tooltip and more in the Properties panel.')}
        <ToggleGroup type="single" size="sm" value={formMode} onValueChange={(v) => v && useUiStore.getState().set({ formMode: v as 'fill' | 'edit' })} aria-label="Form mode">
          <ToggleGroupItem value="edit" className="px-2 text-xs">Edit fields</ToggleGroupItem>
          <ToggleGroupItem value="fill" className="px-2 text-xs">Fill</ToggleGroupItem>
        </ToggleGroup>
        {stickyToggle}
      </div>
    )
  return null
}
