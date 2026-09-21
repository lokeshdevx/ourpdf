import type { EditObject, OcrPage, PageLabelRange, PageModel, SecuritySettings } from '@/types'

export interface PlanBookmark {
  title: string
  /** Final (output) page index; null = no destination. */
  pageIndex: number | null
  /** y in base space of that page. */
  y: number
  children: PlanBookmark[]
}

export interface RasterPage {
  bytes: Uint8Array
  mime: 'image/jpeg' | 'image/png'
  /** Pixel size (informational). */
  width: number
  height: number
}

export interface InvisibleTextRun {
  text: string
  /** Base-space rectangle. */
  x: number
  y: number
  w: number
  h: number
}

export interface PlanPage {
  page: PageModel
  objects: EditObject[]
  /** Page content replaced by this raster (redactions applied / unlocked / max compression). Base orientation. */
  raster?: RasterPage
  /** Invisible text (searchable layer) drawn over `raster` or OCR'd pages. */
  invisibleText?: InvisibleTextRun[]
  label: string
}

export interface ExportOptions {
  flattenForms: boolean
  security: SecuritySettings | null
  producer: string
  objectStreams: boolean
  /** Add native /Link annotations for link objects. */
  nativeLinks: boolean
  /** Add native /Text (sticky note) annotations. */
  nativeNotes: boolean
}

export interface ExportPlan {
  sources: Record<string, { bytes: Uint8Array; password?: string }>
  pages: PlanPage[]
  /** Processed image bytes by key; objects map to keys through `imageKeys`. */
  images: Record<string, { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' }>
  imageKeys: Record<string, string>
  /** Rasterised text (for characters standard fonts can't encode), keyed by object id. */
  textRasters: Record<string, { bytes: Uint8Array; width: number; height: number }>
  fonts: Record<string, Uint8Array>
  metadata: {
    title: string
    author: string
    subject: string
    keywords: string
    creator: string
    producer: string
    creationDate: string | null
    modificationDate: string | null
  } | null
  removeMetadata: boolean
  bookmarks: PlanBookmark[]
  pageLabels: PageLabelRange[]
  attachments: { name: string; bytes: Uint8Array }[]
  ocr: Record<string, OcrPage>
  /** Native form fields that were deleted in the editor. */
  removedFields: { sourceId: string; name: string }[]
  options: ExportOptions
  /** Epoch ms used for {date} tokens. */
  now: number
}

export type ProgressFn = (fraction: number, label?: string) => void
