'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { useUiStore, type DialogId } from '@/stores/ui-store'
import { ConfirmDialog } from './ConfirmDialog'
import { PasswordDialog } from './PasswordDialog'

const lazy = (loader: () => Promise<{ default: ComponentType }>) => dynamic(loader, { ssr: false })

/** Each dialog is code-split: heavy dependencies (OCR, JSZip, mammoth…) load only when the dialog opens. */
const REGISTRY: Partial<Record<DialogId, ComponentType>> = {
  merge: lazy(() => import('./MergeDialog')),
  split: lazy(() => import('./SplitDialog')),
  extract: lazy(() => import('./ExtractDialog')),
  insertPdf: lazy(() => import('./InsertPdfDialog')),
  imagesToPdf: lazy(() => import('./ImagesToPdfDialog')),
  newPdf: lazy(() => import('./NewPdfDialog')),
  dropMode: lazy(() => import('./DropModeDialog')),
  pageSetup: lazy(() => import('./PageSetupDialog')),
  crop: lazy(() => import('./CropDialog')),
  labels: lazy(() => import('./LabelsDialog')),
  headerFooter: lazy(() => import('./HeaderFooterDialog')),
  watermark: lazy(() => import('./WatermarkDialog')),
  metadata: lazy(() => import('./MetadataDialog')),
  security: lazy(() => import('./SecurityDialog')),
  compress: lazy(() => import('./CompressDialog')),
  ocr: lazy(() => import('./OcrDialog')),
  convert: lazy(() => import('./ConvertDialog')),
  sign: lazy(() => import('./SignDialog')),
  print: lazy(() => import('./PrintDialog')),
  projects: lazy(() => import('./ProjectsDialog')),
  shortcuts: lazy(() => import('./ShortcutsDialog')),
  settings: lazy(() => import('./SettingsDialog')),
  about: lazy(() => import('./AboutDialog')),
  toolGuide: lazy(() => import('./ToolGuideDialog')),
  redact: lazy(() => import('./RedactDialog')),
  link: lazy(() => import('./LinkDialog')),
  stamp: lazy(() => import('./StampDialog')),
  fonts: lazy(() => import('./FontsDialog')),
  replace: lazy(() => import('./ReplaceDialog')),
  formData: lazy(() => import('./FormDataDialog')),
  export: lazy(() => import('./ExportDialog')),
}

export function DialogHost() {
  const id = useUiStore((s) => s.dialog)
  const Active = id ? REGISTRY[id] : undefined
  return (
    <>
      {Active && <Active />}
      <PasswordDialog />
      <ConfirmDialog />
    </>
  )
}
