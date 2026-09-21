import type { EditObject } from '@/types'

/** Reversible delta operations on the ordered object list (array order = z-order). */
export type ObjOp =
  | { kind: 'add'; obj: EditObject; index: number }
  | { kind: 'remove'; obj: EditObject; index: number }
  | { kind: 'update'; before: EditObject; after: EditObject }

export function applyOps(objects: EditObject[], ops: ObjOp[]): EditObject[] {
  let list = objects.slice()
  for (const op of ops) {
    if (op.kind === 'add') {
      const i = Math.min(Math.max(0, op.index), list.length)
      list.splice(i, 0, op.obj)
    } else if (op.kind === 'remove') {
      const i = list.findIndex((o) => o.id === op.obj.id)
      if (i >= 0) list.splice(i, 1)
    } else {
      list = list.map((o) => (o.id === op.after.id ? op.after : o))
    }
  }
  return list
}

export function invertOps(ops: ObjOp[]): ObjOp[] {
  return ops
    .slice()
    .reverse()
    .map((op): ObjOp => {
      if (op.kind === 'add') return { kind: 'remove', obj: op.obj, index: op.index }
      if (op.kind === 'remove') return { kind: 'add', obj: op.obj, index: op.index }
      return { kind: 'update', before: op.after, after: op.before }
    })
}

export function opsAdd(current: EditObject[], objs: EditObject[]): ObjOp[] {
  return objs.map((obj, i) => ({ kind: 'add', obj, index: current.length + i }))
}

export function opsRemove(current: EditObject[], ids: Iterable<string>): ObjOp[] {
  const set = new Set(ids)
  const ops: ObjOp[] = []
  // Remove from the end so recorded indices stay valid when replayed in order.
  for (let i = current.length - 1; i >= 0; i--) if (set.has(current[i].id)) ops.push({ kind: 'remove', obj: current[i], index: i })
  return ops
}

export function opsUpdate(current: EditObject[], patches: Record<string, Partial<EditObject>>): ObjOp[] {
  const ops: ObjOp[] = []
  for (const o of current) {
    const p = patches[o.id]
    if (!p) continue
    const after = { ...o, ...p } as EditObject
    if (!shallowEqualObj(o, after)) ops.push({ kind: 'update', before: o, after })
  }
  return ops
}

export type ReorderMode = 'front' | 'back' | 'forward' | 'backward'

export function opsReorder(current: EditObject[], ids: string[], mode: ReorderMode): ObjOp[] {
  const set = new Set(ids)
  const target = current.slice()
  const moving = target.filter((o) => set.has(o.id))
  if (!moving.length) return []
  let result: EditObject[]
  if (mode === 'front') result = [...target.filter((o) => !set.has(o.id)), ...moving]
  else if (mode === 'back') result = [...moving, ...target.filter((o) => !set.has(o.id))]
  else {
    result = target.slice()
    if (mode === 'forward') {
      for (let i = result.length - 2; i >= 0; i--) {
        if (set.has(result[i].id) && !set.has(result[i + 1].id)) [result[i], result[i + 1]] = [result[i + 1], result[i]]
      }
    } else {
      for (let i = 1; i < result.length; i++) {
        if (set.has(result[i].id) && !set.has(result[i - 1].id)) [result[i], result[i - 1]] = [result[i - 1], result[i]]
      }
    }
  }
  if (result.every((o, i) => o === current[i])) return []
  // Express as removes + adds of the moved objects.
  const ops: ObjOp[] = []
  const removed = opsRemove(current, set)
  ops.push(...removed)
  result.forEach((o, index) => {
    if (set.has(o.id)) ops.push({ kind: 'add', obj: o, index })
  })
  return ops
}

function shallowEqualObj(a: object, b: object): boolean {
  const ka = Object.keys(a) as (keyof typeof a)[]
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.is(a[k], (b as typeof a)[k]))
}
