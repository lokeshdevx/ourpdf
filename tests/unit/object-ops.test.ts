import { describe, expect, it } from 'vitest'
import { applyOps, invertOps, opsAdd, opsRemove, opsReorder, opsUpdate } from '@/lib/object-ops'
import { createShape } from '@/lib/object-factory'
import type { EditObject } from '@/types'

const mk = (id: string, x = 0): EditObject => ({ ...createShape('p', 'l', 'rect', { x, y: 0, w: 10, h: 10 }), id })
const ids = (l: EditObject[]) => l.map((o) => o.id)

describe('object ops (undo/redo deltas)', () => {
  it('add / remove are exact inverses', () => {
    const base = [mk('a'), mk('b'), mk('c')]
    const add = opsAdd(base, [mk('d'), mk('e')])
    const after = applyOps(base, add)
    expect(ids(after)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(applyOps(after, invertOps(add)))).toEqual(['a', 'b', 'c'])
    const rem = opsRemove(after, ['b', 'd'])
    const r = applyOps(after, rem)
    expect(ids(r)).toEqual(['a', 'c', 'e'])
    expect(ids(applyOps(r, invertOps(rem)))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('update patches only changed objects and is invertible', () => {
    const base = [mk('a', 1), mk('b', 2)]
    const ops = opsUpdate(base, { a: { x: 50 }, b: { x: 2 } })
    expect(ops).toHaveLength(1) // b unchanged → no op
    const after = applyOps(base, ops)
    expect(after[0].x).toBe(50)
    expect(applyOps(after, invertOps(ops))[0].x).toBe(1)
  })
  it('reorder: front, back, forward, backward', () => {
    const base = [mk('a'), mk('b'), mk('c'), mk('d')]
    expect(ids(applyOps(base, opsReorder(base, ['b'], 'front')))).toEqual(['a', 'c', 'd', 'b'])
    expect(ids(applyOps(base, opsReorder(base, ['c'], 'back')))).toEqual(['c', 'a', 'b', 'd'])
    expect(ids(applyOps(base, opsReorder(base, ['a'], 'forward')))).toEqual(['b', 'a', 'c', 'd'])
    expect(ids(applyOps(base, opsReorder(base, ['d'], 'backward')))).toEqual(['a', 'b', 'd', 'c'])
    expect(ids(applyOps(base, opsReorder(base, ['a', 'c'], 'front')))).toEqual(['b', 'd', 'a', 'c'])
    expect(opsReorder(base, ['d'], 'front')).toEqual([])
  })
  it('reorder is undoable', () => {
    const base = [mk('a'), mk('b'), mk('c')]
    const ops = opsReorder(base, ['a'], 'front')
    expect(ids(applyOps(applyOps(base, ops), invertOps(ops)))).toEqual(['a', 'b', 'c'])
  })
  it('unrelated concurrent additions survive an undo (delta, not snapshot)', () => {
    const base = [mk('a')]
    const ops = opsUpdate(base, { a: { x: 9 } })
    const withExtra = [...applyOps(base, ops), mk('native')]
    expect(ids(applyOps(withExtra, invertOps(ops)))).toEqual(['a', 'native'])
  })
})
