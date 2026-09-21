/* Core domain types for OurPDF. All geometry is in PDF points (1/72 in) in "base space":
 * the page as displayed by PDF.js at scale 1 with its intrinsic /Rotate applied, origin top-left, y down. */

export type Pt = [number, number]
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export type Rotation = 0 | 90 | 180 | 270

/** Output frame of a page: a w×h page in which the visible (cropped) content is drawn at scale `s`
 * with its top-left corner at (x, y). Margins, resize, centre and align are all expressed as a frame. */
export interface Frame {
  w: number
  h: number
  x: number
  y: number
  s: number
}

export interface PageModel {
  id: string
  /** null = blank page created in the editor */
  sourceId: string | null
  sourceIndex: number
  /** Base size in points (intrinsic rotation applied). */
  width: number
  height: number
  /** Intrinsic /Rotate of the source page. */
  intrinsic: Rotation
  /** Source view box in PDF user space [x0, y0, x1, y1]. */
  view: [number, number, number, number]
  /** User-applied rotation on top of the intrinsic one. */
  rotation: Rotation
  /** Visible region of the base page (base space). null = whole page. Content outside is hidden. */
  crop: Rect | null
  frame: Frame | null
  sizeKnown: boolean
}

export type FontFamilyKey = 'helvetica' | 'times' | 'courier' | `custom:${string}`

/** One concrete way to draw text: a font key plus the style flags that apply to standard fonts. */
export interface FontChoice {
  font: FontFamilyKey
  bold: boolean
  italic: boolean
  letterSpacing: number
}

/**
 * Set on text created by "Edit existing text". `home` is the font the original text used (the PDF's embedded font,
 * or its closest match); `alt` is used automatically while the typed text contains characters `home` has no glyph for
 * (embedded fonts are subsets). It is dropped as soon as the user picks a font by hand.
 */
export interface FontSwap {
  /** Font name as found in the PDF, e.g. "DejaVuSerif-Italic". */
  detected: string
  kind: 'embedded' | 'library' | 'standard'
  home: FontChoice
  alt: FontChoice
}

export interface LinkTarget {
  kind: 'url' | 'page' | 'email'
  url?: string
  pageId?: string
  address?: string
  subject?: string
}

export interface ObjBase {
  id: string
  pageId: string
  layerId: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  locked?: boolean
  /** Set for watermark / header / footer objects so the group can be removed as a unit. */
  decoration?: { group: string; kind: 'watermark' | 'header' | 'footer' | 'bates' }
  name?: string
}

export interface TextObj extends ObjBase {
  type: 'text'
  text: string
  font: FontFamilyKey
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color: string
  align: 'left' | 'center' | 'right' | 'justify'
  lineHeight: number
  letterSpacing: number
  bg: string | null
  /** When set the object replaces existing page text: this colour is painted first over `cover`. */
  cover: { color: string; rect: Rect } | null
  /** See FontSwap. */
  fontSwap?: FontSwap
  /** Never wrap lines at the box edge (the box grows with the text). Used by edited existing text. */
  noWrap?: boolean
  autoFit: boolean
  list: 'none' | 'bullet' | 'number'
  border: { color: string; width: number } | null
  radius: number
  /** Callout tail tip, as fractions of the box (may lie outside 0..1). */
  callout: Pt | null
  link: LinkTarget | null
  heading: 0 | 1 | 2 | 3
  /** Expand {page} {total} {date} {label} {bates} tokens (headers, footers, dynamic stamps). */
  tokens?: boolean
  /** Tile repeatedly over the page (watermarks). */
  tile?: { gapX: number; gapY: number } | null
  bates?: { prefix: string; suffix: string; start: number; digits: number }
}

export type MarkupKind = 'highlight' | 'underline' | 'strike' | 'squiggly'
export interface MarkupObj extends ObjBase {
  type: 'markup'
  kind: MarkupKind
  color: string
  /** Rects as fractions of the bounding box. */
  rects: Rect[]
}

export interface NoteObj extends ObjBase {
  type: 'note'
  text: string
  author: string
  color: string
}

export type Brush = 'pen' | 'pencil' | 'marker' | 'brush'
export interface InkObj extends ObjBase {
  type: 'ink'
  brush: Brush
  color: string
  width: number
  /** Points as fractions of the bounding box. */
  pts: Pt[]
}

export type ShapeKind =
  | 'line'
  | 'arrow'
  | 'darrow'
  | 'rect'
  | 'rrect'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'cloud'
  | 'path'
export interface ShapeObj extends ObjBase {
  type: 'shape'
  shape: ShapeKind
  stroke: string
  fill: string | null
  strokeWidth: number
  dash: 'solid' | 'dashed' | 'dotted'
  /** Points as fractions of the bounding box (line, polygon, path). */
  pts: Pt[]
  closed?: boolean
  radius?: number
  sides?: number
}

export interface StampObj extends ObjBase {
  type: 'stamp'
  label: string
  color: string
  /** Show current date under the label. */
  showDate: boolean
  dynamic: boolean
}

export interface ImageFilters {
  brightness: number
  contrast: number
  saturation: number
  grayscale: number
  blur: number
  sharpen: number
}
export const DEFAULT_FILTERS: ImageFilters = { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, blur: 0, sharpen: 0 }

export interface ImageObj extends ObjBase {
  type: 'image'
  assetId: string
  role: 'image' | 'signature' | 'initials' | 'stamp'
  flipH: boolean
  flipV: boolean
  filters: ImageFilters
  /** Crop in fractions of the source image. */
  crop: Rect | null
  /** JPEG quality (0..1) used when the image is embedded on export; 1 = lossless PNG. */
  quality: number
}

export interface RedactObj extends ObjBase {
  type: 'redact'
  color: string
  reason: string
  overlayText: string
}

export interface LinkObj extends ObjBase {
  type: 'link'
  target: LinkTarget
  border: { color: string; width: number; style: 'solid' | 'dashed' | 'none' }
}

export type FieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'listbox' | 'button' | 'date' | 'signature'
export interface FieldValidation {
  kind: 'none' | 'number' | 'email' | 'regex' | 'maxlength'
  pattern?: string
  max?: number
  message?: string
}
export interface FieldObj extends ObjBase {
  type: 'field'
  ftype: FieldType
  fieldName: string
  value: string | boolean
  defaultValue: string | boolean
  options: string[]
  /** Radio group export value. */
  exportValue: string
  required: boolean
  readOnly: boolean
  multiline: boolean
  tooltip: string
  fontSize: number
  label: string
  validation: FieldValidation
  tabIndex: number
  /** True when the field already exists in the source PDF (its geometry is locked; value/delete supported). */
  native: boolean
}

export type EditObject =
  | TextObj
  | MarkupObj
  | NoteObj
  | InkObj
  | ShapeObj
  | StampObj
  | ImageObj
  | RedactObj
  | LinkObj
  | FieldObj
export type ObjType = EditObject['type']

export interface Layer {
  id: string
  name: string
  visible: boolean
  locked: boolean
}
export const DEFAULT_LAYER_ID = 'layer-default'

export interface Bookmark {
  id: string
  title: string
  pageId: string | null
  y: number
  children: Bookmark[]
  collapsed?: boolean
}

export interface PageLabelRange {
  /** Index of the first page (in current order) the range applies to. */
  from: number
  style: 'decimal' | 'roman' | 'ROMAN' | 'alpha' | 'ALPHA' | 'none'
  prefix: string
  start: number
}

export interface DocMetadata {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
  creationDate: string | null
  modificationDate: string | null
  /** Strip all metadata on export. */
  strip: boolean
}

export interface OcrWord {
  text: string
  x: number
  y: number
  w: number
  h: number
  conf: number
}
export interface OcrPage {
  text: string
  lang: string
  words: OcrWord[]
  confidence: number
}

export interface AttachmentInfo {
  id: string
  name: string
  size: number
  /** true when it was added in the editor and is not yet in the source file */
  staged: boolean
  blobKey?: string
}

export interface SecuritySettings {
  userPassword: string
  ownerPassword: string
  allowPrint: boolean
  allowCopy: boolean
  allowModify: boolean
  allowAnnotate: boolean
}

export interface DocInfo {
  id: string
  name: string
  /** Total size of all sources in bytes. */
  size: number
  createdAt: number
  modified: boolean
  metadata: DocMetadata
  originalMetadata: DocMetadata
  bookmarks: Bookmark[]
  pageLabels: PageLabelRange[]
  attachments: AttachmentInfo[]
  ocr: Record<string, OcrPage>
  /** Password required to decrypt this document (kept in memory only). */
  hasForms: boolean
  encrypted: boolean
}

export interface AssetInfo {
  id: string
  mime: string
  width: number
  height: number
  size: number
  name: string
}

export type ViewMode = 'continuous' | 'single' | 'two' | 'two-cover'
export type ScrollDir = 'vertical' | 'horizontal'
export type FitMode = 'custom' | 'width' | 'page' | 'height'
export type RenderQuality = 'low' | 'standard' | 'high' | 'ultra'

export type ToolId =
  | 'select'
  | 'hand'
  | 'text'
  | 'edit-text'
  | 'heading'
  | 'list'
  | 'callout'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'squiggly'
  | 'note'
  | 'pen'
  | 'pencil'
  | 'marker'
  | 'brush'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'darrow'
  | 'rect'
  | 'rrect'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'cloud'
  | 'path'
  | 'stamp'
  | 'image'
  | 'redact'
  | 'redact-text'
  | 'link'
  | 'crop'
  | 'field-text'
  | 'field-checkbox'
  | 'field-radio'
  | 'field-dropdown'
  | 'field-listbox'
  | 'field-button'
  | 'field-date'
  | 'field-signature'
