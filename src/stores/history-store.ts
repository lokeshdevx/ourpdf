import { create } from 'zustand'

export type CommandScope = 'page' | 'annotation' | 'text' | 'image' | 'form' | 'document'

/**
 * A reversible edit. Commands capture only the *delta* they change (object patches, page-list snapshots of
 * small metadata) – never a copy of the PDF bytes.
 */
export interface Command {
  id: string
  label: string
  scope: CommandScope
  /** Objects touched by this command; enables per-object history. */
  objectIds?: string[]
  time: number
  /** Consecutive commands with the same key inside `mergeWindow` collapse (drags, sliders). */
  mergeKey?: string
  do: () => void
  undo: () => void
}

interface DocHistory {
  undo: Command[]
  redo: Command[]
}
const EMPTY: DocHistory = { undo: [], redo: [] }

interface HistoryState {
  byDoc: Record<string, DocHistory>
  limit: number
  setLimit: (n: number) => void
  push: (docId: string, cmd: Command) => void
  popUndo: (docId: string) => Command | undefined
  popRedo: (docId: string) => Command | undefined
  pushRedo: (docId: string, cmd: Command) => void
  pushUndoRaw: (docId: string, cmd: Command) => void
  clear: (docId: string) => void
  drop: (docId: string) => void
}

const MERGE_WINDOW = 800

export const useHistoryStore = create<HistoryState>((set, get) => ({
  byDoc: {},
  limit: 200,
  setLimit: (n) =>
    set((s) => {
      const limit = Math.max(1, Math.min(2000, n))
      const byDoc: Record<string, DocHistory> = {}
      for (const [k, v] of Object.entries(s.byDoc)) byDoc[k] = { ...v, undo: v.undo.slice(-limit) }
      return { limit, byDoc }
    }),
  push: (docId, cmd) =>
    set((s) => {
      const cur = s.byDoc[docId] ?? EMPTY
      const last = cur.undo[cur.undo.length - 1]
      let undo: Command[]
      if (last && cmd.mergeKey && last.mergeKey === cmd.mergeKey && cmd.time - last.time < MERGE_WINDOW) {
        // Keep the older undo() (restores the state before the whole gesture), adopt the newer do().
        undo = [...cur.undo.slice(0, -1), { ...cmd, undo: last.undo, id: last.id }]
      } else {
        undo = [...cur.undo, cmd]
      }
      if (undo.length > get().limit) undo = undo.slice(undo.length - get().limit)
      return { byDoc: { ...s.byDoc, [docId]: { undo, redo: [] } } }
    }),
  popUndo: (docId) => {
    const cur = get().byDoc[docId] ?? EMPTY
    const cmd = cur.undo[cur.undo.length - 1]
    if (!cmd) return undefined
    set((s) => ({ byDoc: { ...s.byDoc, [docId]: { ...cur, undo: cur.undo.slice(0, -1) } } }))
    return cmd
  },
  popRedo: (docId) => {
    const cur = get().byDoc[docId] ?? EMPTY
    const cmd = cur.redo[cur.redo.length - 1]
    if (!cmd) return undefined
    set((s) => ({ byDoc: { ...s.byDoc, [docId]: { ...cur, redo: cur.redo.slice(0, -1) } } }))
    return cmd
  },
  pushRedo: (docId, cmd) =>
    set((s) => {
      const cur = s.byDoc[docId] ?? EMPTY
      return { byDoc: { ...s.byDoc, [docId]: { ...cur, redo: [...cur.redo, cmd] } } }
    }),
  pushUndoRaw: (docId, cmd) =>
    set((s) => {
      const cur = s.byDoc[docId] ?? EMPTY
      return { byDoc: { ...s.byDoc, [docId]: { ...cur, undo: [...cur.undo, cmd] } } }
    }),
  clear: (docId) => set((s) => ({ byDoc: { ...s.byDoc, [docId]: { undo: [], redo: [] } } })),
  drop: (docId) =>
    set((s) => {
      const rest = { ...s.byDoc }
      delete rest[docId]
      return { byDoc: rest }
    }),
}))
