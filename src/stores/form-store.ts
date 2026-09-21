import { create } from 'zustand'

interface FormState {
  /** Validation messages keyed by field object id. */
  errors: Record<string, string>
  setError: (id: string, message: string | null) => void
  clearErrors: () => void
}

export const useFormStore = create<FormState>((set) => ({
  errors: {},
  setError: (id, message) =>
    set((s) => {
      const errors = { ...s.errors }
      if (message) errors[id] = message
      else delete errors[id]
      return { errors }
    }),
  clearErrors: () => set({ errors: {} }),
}))
