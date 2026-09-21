import { applyOps, invertOps, opsAdd, opsRemove, opsReorder, opsUpdate, type ObjOp, type ReorderMode } from '@/lib/object-ops'
import { cloneObject } from '@/lib/object-factory'
import { getObjects, useAnnotationStore, getLayers } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import type { CommandScope } from '@/stores/history-store'
import { execute } from '@/services/history'
import { fitTextObject } from './font-fit'
import type { EditObject, Layer } from '@/types'
import { uid } from '@/utils/id'

function scopeOf(objs: EditObject[]): CommandScope {
  if (objs.every((o) => o.type === 'image')) return 'image'
  if (objs.every((o) => o.type === 'text')) return 'text'
  if (objs.every((o) => o.type === 'field')) return 'form'
  return 'annotation'
}

function run(docId: string, label: string, ops: ObjOp[], scope: CommandScope, ids: string[], mergeKey?: string) {
  if (!ops.length) return
  const inv = invertOps(ops)
  const store = useAnnotationStore.getState()
  execute(
    docId,
    label,
    () => store.setObjects(docId, applyOps(getObjects(docId), ops)),
    () => store.setObjects(docId, applyOps(getObjects(docId), inv)),
    { scope, objectIds: ids, mergeKey },
  )
}

export function addObjects(docId: string, objs: EditObject[], label = 'Add object'): void {
  if (!objs.length) return
  run(docId, label, opsAdd(getObjects(docId), objs), scopeOf(objs), objs.map((o) => o.id))
}

export function removeObjects(docId: string, ids: string[], label = 'Delete object'): void {
  const cur = getObjects(docId)
  const targets = cur.filter((o) => ids.includes(o.id) && !o.locked)
  if (!targets.length) return
  run(docId, label, opsRemove(cur, targets.map((o) => o.id)), scopeOf(targets), targets.map((o) => o.id))
}

/** Patches objects. Use `mergeKey` for continuous gestures so one undo reverts the whole drag. */
export function updateObjects(docId: string, patches: Record<string, Partial<EditObject>>, label = 'Edit object', mergeKey?: string): void {
  const cur = getObjects(docId)
  const ops = opsUpdate(cur, patches)
  if (!ops.length) return
  const touched = ops.map((o) => (o.kind === 'update' ? o.after : o.obj))
  const key = mergeKey ?? `upd:${Object.keys(patches).sort().join(',')}:${label}`
  run(docId, label, ops, scopeOf(touched), touched.map((o) => o.id), key)
  // text edited from "Edit existing text": keep drawing it with the original font when its glyphs allow, else the closest match
  for (const o of touched) {
    if (o.type === 'text' && (o.fontSwap || o.noWrap) && 'text' in (patches[o.id] ?? {})) {
      const text = o.text
      void fitTextObject(o).then((fix) => {
        const now = getObjects(docId).find((x) => x.id === o.id)
        if (fix && now && now.type === 'text' && now.text === text) updateObjects(docId, { [o.id]: fix }, label, key)
      })
    }
  }
}

/** Apply the same patch to many objects. */
export function patchObjects(docId: string, ids: string[], patch: Partial<EditObject>, label?: string, mergeKey?: string): void {
  const patches: Record<string, Partial<EditObject>> = {}
  for (const id of ids) patches[id] = patch
  updateObjects(docId, patches, label, mergeKey)
}

export function reorderObjects(docId: string, ids: string[], mode: ReorderMode): void {
  const labels: Record<ReorderMode, string> = { front: 'Bring to front', back: 'Send to back', forward: 'Bring forward', backward: 'Send backward' }
  run(docId, labels[mode], opsReorder(getObjects(docId), ids, mode), 'annotation', ids)
}

export function duplicateObjects(docId: string, ids: string[]): EditObject[] {
  const cur = getObjects(docId)
  const copies = cur.filter((o) => ids.includes(o.id)).map((o) => cloneObject(o))
  addObjects(docId, copies, 'Duplicate')
  return copies
}

export function moveToLayer(docId: string, ids: string[], layerId: string): void {
  patchObjects(docId, ids, { layerId }, 'Move to layer')
}

/* ---------------- Layers ---------------- */

function setLayers(docId: string, before: Layer[], after: Layer[], label: string, extra?: { doObjs?: () => void; undoObjs?: () => void }) {
  const store = useAnnotationStore.getState()
  execute(
    docId,
    label,
    () => {
      store.setLayers(docId, after)
      extra?.doObjs?.()
    },
    () => {
      store.setLayers(docId, before)
      extra?.undoObjs?.()
    },
    { scope: 'annotation' },
  )
}

export function addLayer(docId: string, name?: string): string {
  const layers = getLayers(docId)
  const id = uid('layer')
  setLayers(docId, layers, [...layers, { id, name: name ?? `Layer ${layers.length + 1}`, visible: true, locked: false }], 'Create layer')
  return id
}
export function updateLayer(docId: string, id: string, patch: Partial<Layer>, label = 'Edit layer'): void {
  const layers = getLayers(docId)
  setLayers(docId, layers, layers.map((l) => (l.id === id ? { ...l, ...patch } : l)), label)
}
export function deleteLayer(docId: string, id: string): void {
  const layers = getLayers(docId)
  if (layers.length <= 1) return
  const objs = getObjects(docId).filter((o) => o.layerId === id)
  const ops = opsRemove(getObjects(docId), objs.map((o) => o.id))
  const inv = invertOps(ops)
  const store = useAnnotationStore.getState()
  setLayers(
    docId,
    layers,
    layers.filter((l) => l.id !== id),
    'Delete layer',
    {
      doObjs: () => store.setObjects(docId, applyOps(getObjects(docId), ops)),
      undoObjs: () => store.setObjects(docId, applyOps(getObjects(docId), inv)),
    },
  )
}
export function moveLayer(docId: string, id: string, dir: -1 | 1): void {
  const layers = getLayers(docId)
  const i = layers.findIndex((l) => l.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= layers.length) return
  const next = layers.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  setLayers(docId, layers, next, 'Reorder layers')
}

/** Names of all form fields in a document (used to generate unique names). */
export function fieldNames(docId: string): string[] {
  return getObjects(docId).filter((o) => o.type === 'field').map((o) => (o as { fieldName: string }).fieldName)
}

export function activeDocId(): string | null {
  return usePdfStore.getState().activeId
}
