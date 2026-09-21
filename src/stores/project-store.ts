import { create } from 'zustand'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
  createdAt: number
  size: number
  pageCount: number
}

interface ProjectState {
  projects: ProjectMeta[]
  storageOk: boolean
  /** Doc ids currently persisted (so "Saved" can be shown). */
  savedAt: Record<string, number>
  setProjects: (p: ProjectMeta[]) => void
  setStorageOk: (b: boolean) => void
  markSaved: (id: string, t: number) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  storageOk: true,
  savedAt: {},
  setProjects: (projects) => set({ projects }),
  setStorageOk: (storageOk) => set({ storageOk }),
  markSaved: (id, t) => set((s) => ({ savedAt: { ...s.savedAt, [id]: t } })),
}))
