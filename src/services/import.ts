import { toast } from 'sonner'
import { AppError, isCancelled, toUserError } from '@/lib/errors'
import { PAGE_SIZES } from '@/lib/geometry'
import { getDoc, usePdfStore, EMPTY_METADATA } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { usePageStore } from '@/stores/page-store'
import { defaultLayers, useAnnotationStore } from '@/stores/annotation-store'
import { useHistoryStore } from '@/stores/history-store'
import type { DocInfo } from '@/types'
import { detectFile, MAX_FILE_BYTES, sanitizeFilename, WARN_FILE_BYTES, withExtension, type DetectedKind } from '@/utils/file'
import { formatBytes } from '@/utils/format'
import { uid } from '@/utils/id'
import { convertFileToPdf, imagesToPdfBlob } from './convert/to-pdf'
import { openPdfBlob } from './pdf/document-service'
import { blankPage } from './pdf/page-service'
import { runTask } from './tasks'

let passwordResolver: ((pw: string | null) => void) | null = null

/** Asks the user for a PDF password through the password dialog. Resolves null when cancelled. */
export function requestPassword(name: string, incorrect: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    passwordResolver?.(null)
    passwordResolver = resolve
    useUiStore.getState().openDialog('password', { name, incorrect })
  })
}
export function resolvePassword(pw: string | null) {
  const r = passwordResolver
  passwordResolver = null
  r?.(pw)
}

/** Opens a PDF blob, prompting for a password as often as needed. */
export async function openPdfWithPassword(blob: Blob, name: string, opts: { onProgress?: (l: number, t: number) => void } = {}): Promise<string | null> {
  let password: string | undefined
  for (;;) {
    try {
      return await openPdfBlob(blob, name, { password, onProgress: opts.onProgress })
    } catch (e) {
      const err = toUserError(e)
      if (err.code === 'password-required' || err.code === 'password-incorrect') {
        const pw = await requestPassword(name, err.code === 'password-incorrect')
        if (pw === null) return null
        password = pw
        continue
      }
      throw err
    }
  }
}

export interface ImportOptions {
  /** true: merge all dropped PDFs into one document; false: open separately; undefined: ask when >1 PDF. */
  merge?: boolean
  allowDuplicates?: boolean
}

interface Classified {
  file: File
  kind: DetectedKind
}

export async function classifyFiles(files: File[]): Promise<{ ok: Classified[]; rejected: { file: File; reason: string }[] }> {
  const ok: Classified[] = []
  const rejected: { file: File; reason: string }[] = []
  for (const file of files) {
    if (file.size === 0) {
      rejected.push({ file, reason: 'The file is empty.' })
      continue
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ file, reason: `The file is larger than ${formatBytes(MAX_FILE_BYTES)}.` })
      continue
    }
    const kind = await detectFile(file)
    if (kind === 'unknown') rejected.push({ file, reason: 'Unsupported or unrecognised file type (checked by content, not extension).' })
    else ok.push({ file, kind })
  }
  return { ok, rejected }
}

/** Imports any mix of supported files: opens PDFs, converts everything else to PDFs. */
export async function importFiles(files: File[], opts: ImportOptions = {}): Promise<string[]> {
  if (!files.length) return []
  const { ok, rejected } = await classifyFiles(files)
  for (const r of rejected) toast.error(`Cannot open ${r.file.name}`, { description: r.reason })
  if (!ok.length) return []

  const pdfs = ok.filter((c) => c.kind === 'pdf')
  if (pdfs.length > 1 && opts.merge === undefined) {
    useUiStore.getState().openDialog('dropMode', { files: ok.map((o) => o.file) })
    return []
  }
  if (opts.merge && pdfs.length > 1) {
    const { mergeFilesIntoDoc } = await import('./pdf/merge-service')
    const id = await runTask('Merging PDFs', (ctx) => mergeFilesIntoDoc(pdfs.map((p) => p.file), ctx))
    return id ? [id] : []
  }

  const opened: string[] = []
  const images = ok.filter((c) => ['png', 'jpeg', 'webp', 'tiff'].includes(c.kind))
  const others = ok.filter((c) => !images.includes(c))

  for (const { file, kind } of others) {
    if (!opts.allowDuplicates) {
      const dup = usePdfStore.getState().docs.find((d) => d.name === file.name && d.size === file.size)
      if (dup) {
        usePdfStore.getState().setActive(dup.id)
        toast.info(`${file.name} is already open`, { action: { label: 'Open another copy', onClick: () => void importFiles([file], { ...opts, allowDuplicates: true }) } })
        continue
      }
    }
    if (file.size > WARN_FILE_BYTES) toast.warning(`Large file (${formatBytes(file.size)})`, { description: 'Pages are streamed and rendered on demand, but exports may need a lot of memory.' })
    const id = await runTask(
      kind === 'pdf' ? `Opening ${file.name}` : `Converting ${file.name}`,
      async (ctx) => {
        if (kind === 'pdf') return openPdfWithPassword(file, file.name, { onProgress: (l, t) => ctx.progress(t ? l / t : undefined) })
        const { blob } = await convertFileToPdf(file)
        return openPdfWithPassword(blob, withExtension(file.name, 'pdf'))
      },
      { quiet: true },
    )
    if (id) opened.push(id)
  }

  if (images.length) {
    const name = images.length === 1 ? withExtension(images[0].file.name, 'pdf') : 'Images.pdf'
    const id = await runTask(
      `Converting ${images.length} image${images.length > 1 ? 's' : ''}`,
      async (ctx) => {
        const blob = await imagesToPdfBlob(images.map((i) => i.file), undefined, (f) => ctx.progress(f))
        return openPdfWithPassword(blob, name)
      },
      { quiet: true },
    )
    if (id) opened.push(id)
  }
  if (opened.length) toast.success(opened.length === 1 ? 'Document opened' : `${opened.length} documents opened`)
  return opened
}

export function openFilesFromInput(list: FileList | null) {
  if (!list?.length) return
  void importFiles(Array.from(list))
}

interface OpenPickerWindow {
  showOpenFilePicker?: (o: unknown) => Promise<{ getFile: () => Promise<File> }[]>
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.html,.htm,.docx,.xlsx,application/pdf,image/*'

/** File picker: File System Access API when available, `<input type=file>` otherwise. */
export async function pickFiles(opts: { accept?: string; multiple?: boolean } = {}): Promise<File[]> {
  const accept = opts.accept ?? ACCEPT
  const w = window as unknown as OpenPickerWindow
  // Automated browsers (navigator.webdriver) use the plain <input type=file> path, which they can drive.
  if (typeof w.showOpenFilePicker === 'function' && !opts.accept && !navigator.webdriver) {
    try {
      const handles = await w.showOpenFilePicker({
        multiple: opts.multiple ?? true,
        types: [
          { description: 'PDF', accept: { 'application/pdf': ['.pdf'] } },
          { description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'] } },
          { description: 'Documents', accept: { 'text/plain': ['.txt'], 'text/html': ['.html', '.htm'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } },
        ],
      })
      return await Promise.all(handles.map((h) => h.getFile()))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return []
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = opts.multiple ?? true
    input.style.display = 'none'
    let settled = false
    input.onchange = () => {
      settled = true
      resolve(Array.from(input.files ?? []))
      input.remove()
    }
    input.addEventListener('cancel', () => {
      if (!settled) resolve([])
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  })
}

export async function openFileDialog() {
  const files = await pickFiles()
  if (files.length) await importFiles(files)
}

/** Reads the clipboard for PDFs/images (permission-gated) – used by "Import from clipboard". */
export async function importFromClipboard(): Promise<void> {
  try {
    if (!navigator.clipboard?.read) throw new AppError('unsupported', 'Reading the clipboard is not supported by this browser. Use Ctrl/Cmd+V on the page instead.')
    const items = await navigator.clipboard.read()
    const files: File[] = []
    for (const item of items) {
      for (const type of item.types) {
        if (type === 'application/pdf' || type.startsWith('image/')) {
          const blob = await item.getType(type)
          files.push(new File([blob], `Clipboard ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${type === 'application/pdf' ? 'pdf' : type.split('/')[1]}`, { type }))
        }
      }
    }
    if (!files.length) throw new AppError('invalid-input', 'The clipboard has no PDF or image.')
    await importFiles(files)
  } catch (e) {
    if (isCancelled(e)) return
    const err = toUserError(e)
    toast.error('Could not import from clipboard', { description: err.message })
  }
}

/** Creates a document made only of blank pages (PDF generated from scratch). */
export function createBlankDocument(opts: { pages: number; size: keyof typeof PAGE_SIZES | 'custom'; width?: number; height?: number; landscape?: boolean; name?: string }): string {
  let [w, h] = opts.size === 'custom' ? [opts.width ?? 595, opts.height ?? 842] : PAGE_SIZES[opts.size]
  if (opts.landscape) [w, h] = [h, w]
  const pages = Array.from({ length: Math.max(1, Math.min(500, opts.pages)) }, () => blankPage(w, h))
  const id = uid('doc')
  const name = withExtension(opts.name ?? 'Untitled', 'pdf')
  const info: DocInfo = {
    id,
    name: sanitizeFilename(name),
    size: 0,
    createdAt: Date.now(),
    modified: true,
    metadata: { ...EMPTY_METADATA },
    originalMetadata: { ...EMPTY_METADATA },
    bookmarks: [],
    pageLabels: [],
    attachments: [],
    ocr: {},
    hasForms: false,
    encrypted: false,
  }
  usePageStore.getState().init(id, pages)
  useAnnotationStore.getState().init(id, [], defaultLayers())
  useHistoryStore.getState().clear(id)
  usePdfStore.getState().addDoc(info, true)
  return id
}

export { getDoc }
