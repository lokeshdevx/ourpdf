import { toast } from 'sonner'
import { isCancelled, toUserError } from '@/lib/errors'
import { uid } from '@/utils/id'
import { useUiStore } from '@/stores/ui-store'

export interface TaskContext {
  progress: (fraction?: number, label?: string) => void
  signal: AbortSignal
}

/**
 * Runs a long operation with a visible progress task, cancel support and error/retry handling.
 * Resolves with the result, or `undefined` when it failed or was cancelled (the user has been told).
 */
export async function runTask<T>(
  label: string,
  fn: (ctx: TaskContext) => Promise<T>,
  opts: { silentSuccess?: boolean; successMessage?: string; quiet?: boolean } = {},
): Promise<T | undefined> {
  const id = uid('task')
  const ctrl = new AbortController()
  const ui = useUiStore.getState()
  const retry = () => void runTask(label, fn, opts)
  ui.addTask({ id, label, progress: undefined, cancel: () => ctrl.abort() })
  try {
    const result = await fn({
      signal: ctrl.signal,
      progress: (fraction, l) => useUiStore.getState().updateTask(id, { progress: fraction, ...(l ? { label: `${label} – ${l}` } : {}) }),
    })
    useUiStore.getState().updateTask(id, { status: 'done', progress: 1 })
    if (!opts.silentSuccess && !opts.quiet) toast.success(opts.successMessage ?? `${label} complete`)
    setTimeout(() => useUiStore.getState().removeTask(id), 1500)
    return result
  } catch (e) {
    if (isCancelled(e) || ctrl.signal.aborted) {
      useUiStore.getState().removeTask(id)
      toast.info(`${label} cancelled`)
      return undefined
    }
    const err = toUserError(e)
    useUiStore.getState().updateTask(id, { status: 'error', error: err.message, retry })
    toast.error(`${label} failed`, { description: err.message, action: { label: 'Retry', onClick: retry } })
    console.error(`[task] ${label}`, e)
    setTimeout(() => useUiStore.getState().removeTask(id), 15000)
    return undefined
  }
}
