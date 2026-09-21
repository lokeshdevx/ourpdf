import { pageLabelFor } from '@/services/pdf/page-service'
import { getDoc } from '@/stores/pdf-store'
import { toAlpha, toRoman } from '@/utils/pages'

/** Display label of page `index` ("iv", "A-3", "12") for a document. */
export function getPageLabelText(docId: string, index: number): string {
  const doc = getDoc(docId)
  return pageLabelFor(doc?.pageLabels ?? [], index, toRoman, toAlpha)
}
