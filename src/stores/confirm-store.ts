import { create } from 'zustand'

export interface ConfirmRequest {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Extra button (e.g. "Don't save"). Resolves 'alt'. */
  altLabel?: string
}
type Result = 'confirm' | 'cancel' | 'alt'
interface ConfirmState {
  request: (ConfirmRequest & { resolve: (r: Result) => void }) | null
  ask: (r: ConfirmRequest) => Promise<Result>
  close: (r: Result) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  ask: (r) =>
    new Promise<Result>((resolve) => {
      get().request?.resolve('cancel')
      set({ request: { ...r, resolve } })
    }),
  close: (r) => {
    get().request?.resolve(r)
    set({ request: null })
  },
}))

/** Asks the user to confirm a (possibly destructive) action. */
export async function confirmAction(r: ConfirmRequest): Promise<boolean> {
  return (await useConfirmStore.getState().ask(r)) === 'confirm'
}
export const askConfirm = (r: ConfirmRequest) => useConfirmStore.getState().ask(r)
