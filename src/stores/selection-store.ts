import { create } from 'zustand'
import type { Rect } from '@/types'

export interface TextSelection {
  pageId: string
  text: string
  /** Rects in base space, one per visual line. */
  rects: Rect[]
}

interface SelectionState {
  objectIds: string[]
  pageIds: string[]
  /** Anchor for shift-range selection in the page organizer. */
  pageAnchor: string | null
  text: TextSelection | null
  editingId: string | null
  setObjects: (ids: string[]) => void
  toggleObject: (id: string) => void
  setPages: (ids: string[], anchor?: string | null) => void
  togglePage: (id: string) => void
  setText: (t: TextSelection | null) => void
  setEditing: (id: string | null) => void
  clear: () => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  objectIds: [],
  pageIds: [],
  pageAnchor: null,
  text: null,
  editingId: null,
  setObjects: (ids) => set((s) => (sameIds(s.objectIds, ids) ? s : { objectIds: ids, editingId: null })),
  toggleObject: (id) =>
    set((s) => ({ objectIds: s.objectIds.includes(id) ? s.objectIds.filter((x) => x !== id) : [...s.objectIds, id] })),
  setPages: (ids, anchor) => set((s) => ({ pageIds: ids, pageAnchor: anchor === undefined ? s.pageAnchor : anchor })),
  togglePage: (id) =>
    set((s) => ({ pageIds: s.pageIds.includes(id) ? s.pageIds.filter((x) => x !== id) : [...s.pageIds, id], pageAnchor: id })),
  setText: (t) => set({ text: t }),
  setEditing: (id) => set({ editingId: id }),
  clear: () => set({ objectIds: [], pageIds: [], pageAnchor: null, text: null, editingId: null }),
}))

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
