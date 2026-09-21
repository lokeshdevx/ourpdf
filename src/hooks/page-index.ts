import { usePageStore } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'

export function getCurrentPageIndex(): number {
  const id = usePdfStore.getState().activeId
  return id ? (usePageStore.getState().byDoc[id]?.current ?? 0) : 0
}
