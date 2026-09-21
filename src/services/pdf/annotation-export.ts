import { getObjects } from '@/stores/annotation-store'
import { getPages } from '@/stores/page-store'
import { getDoc } from '@/stores/pdf-store'
import type { EditObject } from '@/types'

/** PSPDFKit "Instant JSON"-style export of all annotations, for interchange and backup (coordinates in points, y-down). */
export function exportAnnotationsJson(docId: string): string {
  const doc = getDoc(docId)
  const pages = getPages(docId)
  const index = new Map(pages.map((p, i) => [p.id, i]))
  const type: Record<EditObject['type'], string> = {
    text: 'pspdfkit/text',
    markup: 'pspdfkit/markup',
    note: 'pspdfkit/note',
    ink: 'pspdfkit/ink',
    shape: 'pspdfkit/shape',
    stamp: 'pspdfkit/stamp',
    image: 'pspdfkit/image',
    redact: 'pspdfkit/markup/redaction',
    link: 'pspdfkit/link',
    field: 'pspdfkit/widget',
  }
  const annotations = getObjects(docId)
    .filter((o) => index.has(o.pageId))
    .map((o) => {
      const { id, pageId, x, y, w, h, rotation, opacity, type: kind, ...rest } = o
      return { v: 2, type: type[kind], objectType: kind, id, pageIndex: index.get(pageId), bbox: [x, y, w, h], rotation, opacity, ...rest }
    })
  return JSON.stringify({ format: 'https://pspdfkit.com/instant-json/v1', generator: 'OurPDF', document: doc?.name, pages: pages.length, annotations }, null, 2)
}
