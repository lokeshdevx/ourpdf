import { create } from 'zustand'
import type { PageModel } from '@/types'
import { usePdfStore } from './pdf-store'

interface DocPages {
  pages: PageModel[]
  /** 0-based index of the page currently in view. */
  current: number
}
const EMPTY: DocPages = { pages: [], current: 0 }
export const EMPTY_PAGES: PageModel[] = []

interface PageState {
  byDoc: Record<string, DocPages>
  init: (docId: string, pages: PageModel[]) => void
  setPages: (docId: string, pages: PageModel[]) => void
  patchPage: (docId: string, pageId: string, patch: Partial<PageModel>) => void
  patchMany: (docId: string, patches: Record<string, Partial<PageModel>>) => void
  setCurrent: (docId: string, index: number) => void
  drop: (docId: string) => void
}

export const usePageStore = create<PageState>((set) => ({
  byDoc: {},
  init: (docId, pages) => set((s) => ({ byDoc: { ...s.byDoc, [docId]: { pages, current: 0 } } })),
  setPages: (docId, pages) =>
    set((s) => {
      const cur = s.byDoc[docId] ?? EMPTY
      return { byDoc: { ...s.byDoc, [docId]: { pages, current: Math.min(cur.current, Math.max(0, pages.length - 1)) } } }
    }),
  patchPage: (docId, pageId, patch) =>
    set((s) => {
      const cur = s.byDoc[docId]
      if (!cur) return s
      return { byDoc: { ...s.byDoc, [docId]: { ...cur, pages: cur.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)) } } }
    }),
  patchMany: (docId, patches) =>
    set((s) => {
      const cur = s.byDoc[docId]
      if (!cur) return s
      return { byDoc: { ...s.byDoc, [docId]: { ...cur, pages: cur.pages.map((p) => (patches[p.id] ? { ...p, ...patches[p.id] } : p)) } } }
    }),
  setCurrent: (docId, index) =>
    set((s) => {
      const cur = s.byDoc[docId]
      if (!cur || cur.current === index) return s
      return { byDoc: { ...s.byDoc, [docId]: { ...cur, current: index } } }
    }),
  drop: (docId) =>
    set((s) => {
      const rest = { ...s.byDoc }
      delete rest[docId]
      return { byDoc: rest }
    }),
}))

export const useActivePages = (): PageModel[] => {
  const id = usePdfStore((s) => s.activeId)
  return usePageStore((s) => (id && s.byDoc[id]?.pages) || EMPTY_PAGES)
}
export const useCurrentPageIndex = (): number => {
  const id = usePdfStore((s) => s.activeId)
  return usePageStore((s) => (id && s.byDoc[id]?.current) || 0)
}
export const getPages = (docId: string): PageModel[] => usePageStore.getState().byDoc[docId]?.pages ?? EMPTY_PAGES
