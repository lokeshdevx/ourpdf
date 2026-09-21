import { docChanged } from '@/lib/events'
import { useHistoryStore, type Command, type CommandScope } from '@/stores/history-store'
import { usePdfStore } from '@/stores/pdf-store'
import { uid } from '@/utils/id'

export function markDirty(docId: string): void {
  usePdfStore.getState().markModified(docId, true)
  docChanged.emit(docId)
}

interface RunOpts {
  scope: CommandScope
  objectIds?: string[]
  mergeKey?: string
}

/** Executes a command and records it. `doFn` and `undoFn` must be pure state transitions on the stores. */
export function execute(docId: string, label: string, doFn: () => void, undoFn: () => void, opts: RunOpts): void {
  const cmd: Command = { id: uid('cmd'), label, scope: opts.scope, objectIds: opts.objectIds, mergeKey: opts.mergeKey, time: Date.now(), do: doFn, undo: undoFn }
  doFn()
  useHistoryStore.getState().push(docId, cmd)
  markDirty(docId)
}

export function undo(docId: string): string | null {
  const h = useHistoryStore.getState()
  const cmd = h.popUndo(docId)
  if (!cmd) return null
  cmd.undo()
  h.pushRedo(docId, cmd)
  markDirty(docId)
  return cmd.label
}

export function redo(docId: string): string | null {
  const h = useHistoryStore.getState()
  const cmd = h.popRedo(docId)
  if (!cmd) return null
  cmd.do()
  h.pushUndoRaw(docId, cmd)
  markDirty(docId)
  return cmd.label
}

export function clearHistory(docId: string): void {
  useHistoryStore.getState().clear(docId)
}

/** Commands (newest first) that touched a given object – powers the per-object history list. */
export function historyForObject(docId: string, objectId: string): Command[] {
  const h = useHistoryStore.getState().byDoc[docId]
  return (h?.undo ?? []).filter((c) => c.objectIds?.includes(objectId)).reverse()
}
