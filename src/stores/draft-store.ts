import { create } from 'zustand'
import type { EditObject } from '@/types'

/** Ephemeral patches shown while dragging/resizing; committed as ONE undoable command on release. */
interface DraftState {
  patches: Record<string, Partial<EditObject>>
  set: (patches: Record<string, Partial<EditObject>>) => void
  clear: () => void
}
export const useDraftStore = create<DraftState>((set) => ({
  patches: {},
  set: (patches) => set({ patches }),
  clear: () => set((s) => (Object.keys(s.patches).length ? { patches: {} } : s)),
}))
