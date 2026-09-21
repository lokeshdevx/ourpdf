import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ShortcutState {
  /** commandId → combo ("mod+shift+z"); "" = unbound. Only overrides are stored. */
  overrides: Record<string, string>
  setShortcut: (id: string, combo: string) => void
  reset: (id?: string) => void
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set) => ({
      overrides: {},
      setShortcut: (id, combo) => set((s) => ({ overrides: { ...s.overrides, [id]: combo } })),
      reset: (id) =>
        set((s) => {
          if (!id) return { overrides: {} }
          const next = { ...s.overrides }
          delete next[id]
          return { overrides: next }
        }),
    }),
    { name: 'pdfstudio.shortcuts.v1' },
  ),
)
