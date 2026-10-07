'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'

const loading = () => <div className="h-64 animate-pulse rounded-2xl border bg-muted/40" role="status" aria-label="Loading tool" />
const d = (load: () => Promise<ComponentType>) => dynamic(load, { ssr: false, loading })

const pages = () => import('./tools/pages')
const stamp = () => import('./tools/stamp')
const cin = () => import('./tools/convert-in')
const cout = () => import('./tools/convert-out')
const sec = () => import('./tools/security')

/** Each standalone tool's screen, code-split so a page only downloads what it uses. */
const TOOLS: Record<string, ComponentType> = {
  'scan-document': d(() => import('./tools/scan').then((m) => m.ScanDocument)),
  'pdf-workflow': d(() => import('./tools/workflow').then((m) => m.Workflow)),

  'merge-pdf': d(() => pages().then((m) => m.Merge)),
  'alternate-mix-pdf': d(() => pages().then((m) => m.Alternate)),
  'compress-pdf': d(() => pages().then((m) => m.Compress)),
  'split-pdf': d(() => pages().then((m) => m.Split)),
  'split-pdf-by-text': d(() => pages().then((m) => m.SplitByText)),
  'split-pdf-by-bookmarks': d(() => pages().then((m) => m.SplitByBookmarks)),
  'split-pdf-in-half': d(() => pages().then((m) => m.SplitHalf)),
  'split-pdf-by-size': d(() => pages().then((m) => m.SplitBySize)),
  'rotate-pdf': d(() => pages().then((m) => m.Rotate)),
  'flip-pdf': d(() => pages().then((m) => m.Flip)),
  'pages-per-sheet': d(() => pages().then((m) => m.PagesPerSheet)),
  'crop-resize-pdf': d(() => pages().then((m) => m.CropResize)),
  'organize-pdf': d(() => import('./tools/page-tools').then((m) => m.OrganizePdf)),
  'sign-pdf': d(() => import('./tools/page-tools').then((m) => m.SignPdf)),
  'redact-pdf': d(() => import('./tools/page-tools').then((m) => m.RedactPdf)),
  'ocr-pdf': d(() => import('./tools/page-tools').then((m) => m.OcrPdf)),
  'pdf-to-zip': d(() => pages().then((m) => m.PdfToZip)),

  'pdf-to-handwriting': d(() => import('./tools/handwriting').then((m) => m.PdfToHandwriting)),
  'text-to-handwriting': d(() => import('./tools/handwriting').then((m) => m.TextToHandwriting)),
  'thumbmark-maker': d(() => import('./tools/thumbmark').then((m) => m.ThumbmarkMaker)),
  'handwriting-to-pdf': d(() => import('./tools/handwriting-ocr').then((m) => m.HandwritingToPdf)),
  'fill-pdf-form': d(() => stamp().then((m) => m.FillForm)),
  'add-watermark': d(() => stamp().then((m) => m.Watermark)),
  'add-page-numbers': d(() => stamp().then((m) => m.PageNumbers)),
  'bates-numbering': d(() => stamp().then((m) => m.Bates)),
  'headers-footers': d(() => stamp().then((m) => m.HeaderFooter)),
  'flatten-pdf': d(() => stamp().then((m) => m.Flatten)),
  'invert-pdf-colours': d(() => stamp().then((m) => m.InvertColours)),

  'word-to-pdf': d(() => cin().then((m) => m.WordToPdf)),
  'images-to-pdf': d(() => cin().then((m) => m.ImagesToPdf)),
  'excel-to-pdf': d(() => cin().then((m) => m.ExcelToPdf)),
  'powerpoint-to-pdf': d(() => cin().then((m) => m.PowerPointToPdf)),
  'html-to-pdf': d(() => cin().then((m) => m.HtmlToPdf)),
  'create-pdf': d(() => import('./tools/create-pdf').then((m) => m.CreatePdf)),
  'markdown-to-pdf': d(() => cin().then((m) => m.MarkdownToPdf)),
  'resume-builder': d(() => import('./tools/resume').then((m) => m.ResumeBuilder)),
  'csv-pdf': d(() => cin().then((m) => m.CsvPdf)),
  'audio-to-pdf': d(() => import('./tools/audio').then((m) => m.AudioToPdf)),
  'ebook-to-pdf': d(() => cin().then((m) => m.EbookToPdf)),

  'pdf-to-word': d(() => cout().then((m) => m.PdfToWord)),
  'pdf-to-jpg': d(() => cout().then((m) => m.PdfToImages)),
  'edit-pdf-metadata': d(() => cout().then((m) => m.EditMetadata)),
  'extract-images': d(() => cout().then((m) => m.ExtractImages)),
  'pdf-to-excel': d(() => cout().then((m) => m.PdfToExcel)),
  'pdf-to-powerpoint': d(() => cout().then((m) => m.PdfToPowerPoint)),
  'extract-text': d(() => cout().then((m) => m.ExtractText)),
  'pdf-to-html': d(() => cout().then((m) => m.PdfToHtml)),
  'pdf-to-audio': d(() => import('./tools/audio').then((m) => m.PdfToAudio)),
  'pdf-to-epub': d(() => cout().then((m) => m.PdfToEpub)),

  'encrypt-pdf': d(() => sec().then((m) => m.Encrypt)),
  'remove-password': d(() => sec().then((m) => m.RemovePassword)),
  'unlock-pdf': d(() => sec().then((m) => m.UnlockPdf)),
  'auto-redact-pii': d(() => sec().then((m) => m.AutoRedact)),
  'privacy-risk-scanner': d(() => sec().then((m) => m.PrivacyScanner)),
  'fingerprint-generator': d(() => sec().then((m) => m.Fingerprint)),

  'chat-with-pdf': d(() => import('./tools/ai').then((m) => m.ChatWithPdf)),
  'ai-pdf-summarizer': d(() => import('./tools/ai').then((m) => m.Summarizer)),
  'compare-pdfs': d(() => import('./tools/compare').then((m) => m.ComparePdfs)),
  'repair-pdf': d(() => sec().then((m) => m.Repair)),

  'gst-invoice-generator': d(() => import('./tools/invoice').then((m) => m.GstInvoice)),
  'pos-bill-generator': d(() => import('./tools/pos').then((m) => m.PosBilling)),
  'gst-filing-prep': d(() => import('./tools/gst-prep').then((m) => m.GstFilingPrep)),

  'p2p-file-share': d(() => import('./tools/p2p').then((m) => m.P2PShare)),
  'collab-whiteboard': d(() => import('./tools/p2p').then((m) => m.Whiteboard)),
}

export const TOOL_SLUGS = Object.keys(TOOLS)

export function ToolLoader({ slug }: { slug: string }) {
  const C = TOOLS[slug]
  return C ? <div className="tool-ui" data-clarity-mask="true"><C /></div> : <p className="text-muted-foreground">This tool is not available.</p>
}
