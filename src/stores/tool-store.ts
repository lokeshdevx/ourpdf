import { create } from 'zustand'
import type { FontFamilyKey, ToolId } from '@/types'

export interface ToolOptions {
  stroke: string
  fill: string | null
  strokeWidth: number
  opacity: number
  dash: 'solid' | 'dashed' | 'dotted'
  // text
  font: FontFamilyKey
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  textColor: string
  align: 'left' | 'center' | 'right' | 'justify'
  lineHeight: number
  letterSpacing: number
  // markup
  highlightColor: string
  underlineColor: string
  strikeColor: string
  // stamp
  stampLabel: string
  stampColor: string
  stampDate: boolean
  stampDynamic: boolean
  // redaction
  redactColor: string
  redactReason: string
  // link
  linkUrl: string
  // pending image / signature asset to be placed by the "image" tool
  pendingAssetId: string | null
  pendingRole: 'image' | 'signature' | 'initials' | 'stamp'
  pendingWidth: number
  markupMode: 'text' | 'area'
}

const defaults: ToolOptions = {
  stroke: '#e11d48',
  fill: null,
  strokeWidth: 2,
  opacity: 1,
  dash: 'solid',
  font: 'helvetica',
  fontSize: 14,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  textColor: '#111111',
  align: 'left',
  lineHeight: 1.25,
  letterSpacing: 0,
  highlightColor: '#ffe14d',
  underlineColor: '#16a34a',
  strikeColor: '#e11d48',
  stampLabel: 'APPROVED',
  stampColor: '#16a34a',
  stampDate: false,
  stampDynamic: false,
  redactColor: '#000000',
  redactReason: '',
  linkUrl: 'https://',
  pendingAssetId: null,
  pendingRole: 'image',
  pendingWidth: 160,
  markupMode: 'text',
}

interface ToolState {
  tool: ToolId
  /** Keep the tool active after drawing one object. */
  sticky: boolean
  options: ToolOptions
  setTool: (t: ToolId) => void
  setSticky: (b: boolean) => void
  setOptions: (patch: Partial<ToolOptions>) => void
}

export const useToolStore = create<ToolState>((set) => ({
  tool: 'select',
  sticky: false,
  options: defaults,
  setTool: (tool) => set({ tool }),
  setSticky: (sticky) => set({ sticky }),
  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),
}))
