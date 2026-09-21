import { create } from 'zustand'
import type { DocInfo, DocMetadata } from '@/types'

export const EMPTY_METADATA: DocMetadata = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
  creationDate: null,
  modificationDate: null,
  strip: false,
}

interface PdfState {
  /** Open documents (tabs). Binary data lives in the source registry, never here. */
  docs: DocInfo[]
  activeId: string | null
  addDoc: (doc: DocInfo, activate?: boolean) => void
  updateDoc: (id: string, patch: Partial<DocInfo>) => void
  removeDoc: (id: string) => void
  setActive: (id: string | null) => void
  moveDoc: (from: number, to: number) => void
  markModified: (id: string, modified?: boolean) => void
}

export const usePdfStore = create<PdfState>((set) => ({
  docs: [],
  activeId: null,
  addDoc: (doc, activate = true) =>
    set((s) => ({ docs: [...s.docs, doc], activeId: activate ? doc.id : (s.activeId ?? doc.id) })),
  updateDoc: (id, patch) => set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
  removeDoc: (id) =>
    set((s) => {
      const idx = s.docs.findIndex((d) => d.id === id)
      const docs = s.docs.filter((d) => d.id !== id)
      let activeId = s.activeId
      if (activeId === id) activeId = docs[Math.min(idx, docs.length - 1)]?.id ?? null
      return { docs, activeId }
    }),
  setActive: (id) => set({ activeId: id }),
  moveDoc: (from, to) =>
    set((s) => {
      const docs = [...s.docs]
      const [d] = docs.splice(from, 1)
      docs.splice(to, 0, d)
      return { docs }
    }),
  markModified: (id, modified = true) =>
    set((s) => ({ docs: s.docs.map((d) => (d.id === id && d.modified !== modified ? { ...d, modified } : d)) })),
}))

export const useActiveDocInfo = () => usePdfStore((s) => s.docs.find((d) => d.id === s.activeId) ?? null)
export const getActiveId = () => usePdfStore.getState().activeId
export const getDoc = (id: string) => usePdfStore.getState().docs.find((d) => d.id === id) ?? null
