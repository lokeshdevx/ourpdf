import { beforeEach, describe, expect, it } from 'vitest'
import { clearHistory, execute, historyForObject, redo, undo } from '@/services/history'
import { useHistoryStore } from '@/stores/history-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useAnnotationStore, getObjects } from '@/stores/annotation-store'
import { useSelectionStore } from '@/stores/selection-store'
import { addObjects, updateObjects, removeObjects, reorderObjects, addLayer, updateLayer, deleteLayer } from '@/services/pdf/annotation-service'
import { addBlankPage, deletePages, duplicatePages, movePages, rotatePages, reversePages, sortPages, pasteObjectsProbe } from './history-helpers'
import { createShape, createText } from '@/lib/object-factory'
import { getPages, usePageStore } from '@/stores/page-store'
import { DEFAULT_LAYER_ID, type DocInfo } from '@/types'
import { EMPTY_METADATA } from '@/stores/pdf-store'
import { pageModel } from '../helpers'

const DOC = 'doc-1'
const info = (): DocInfo => ({ id: DOC, name: 'x.pdf', size: 1, createdAt: 0, modified: false, metadata: EMPTY_METADATA, originalMetadata: EMPTY_METADATA, bookmarks: [], pageLabels: [], attachments: [], ocr: {}, hasForms: false, encrypted: false })

beforeEach(() => {
  usePdfStore.setState({ docs: [], activeId: null })
  usePdfStore.getState().addDoc(info())
  usePageStore.getState().init(DOC, [pageModel('s', 0, { id: 'p1' }), pageModel('s', 1, { id: 'p2' }), pageModel('s', 2, { id: 'p3' })])
  useAnnotationStore.getState().init(DOC)
  useHistoryStore.getState().clear(DOC)
  useSelectionStore.getState().clear()
})

const rect = (id: string, page = 'p1') => ({ ...createShape(page, DEFAULT_LAYER_ID, 'rect', { x: 10, y: 10, w: 50, h: 50 }), id })

describe('command history', () => {
  it('undo / redo of object add, update, delete', () => {
    addObjects(DOC, [rect('a')], 'Add')
    expect(getObjects(DOC)).toHaveLength(1)
    updateObjects(DOC, { a: { x: 99 } }, 'Move')
    expect(getObjects(DOC)[0].x).toBe(99)
    removeObjects(DOC, ['a'])
    expect(getObjects(DOC)).toHaveLength(0)
    expect(undo(DOC)).toBe('Delete object')
    expect(getObjects(DOC)).toHaveLength(1)
    expect(undo(DOC)).toBe('Move')
    expect(getObjects(DOC)[0].x).toBe(10)
    expect(redo(DOC)).toBe('Move')
    expect(getObjects(DOC)[0].x).toBe(99)
    undo(DOC)
    undo(DOC)
    expect(getObjects(DOC)).toHaveLength(0)
    expect(undo(DOC)).toBeNull()
  })
  it('a new command clears the redo stack', () => {
    addObjects(DOC, [rect('a')])
    undo(DOC)
    expect(useHistoryStore.getState().byDoc[DOC].redo).toHaveLength(1)
    addObjects(DOC, [rect('b')])
    expect(useHistoryStore.getState().byDoc[DOC].redo).toHaveLength(0)
  })
  it('gestures with the same mergeKey inside the merge window collapse into one undo step', () => {
    addObjects(DOC, [rect('a')])
    for (let x = 20; x <= 100; x += 20) updateObjects(DOC, { a: { x } }, 'Move', 'drag:a')
    expect(useHistoryStore.getState().byDoc[DOC].undo).toHaveLength(2)
    undo(DOC)
    expect(getObjects(DOC)[0].x).toBe(10) // back to before the whole drag
    redo(DOC)
    expect(getObjects(DOC)[0].x).toBe(100)
  })
  it('history limit drops the oldest entries', () => {
    useHistoryStore.getState().setLimit(5)
    for (let i = 0; i < 12; i++) addObjects(DOC, [rect(`o${i}`)])
    expect(useHistoryStore.getState().byDoc[DOC].undo).toHaveLength(5)
    useHistoryStore.getState().setLimit(200)
  })
  it('clearHistory empties both stacks', () => {
    addObjects(DOC, [rect('a')])
    undo(DOC)
    clearHistory(DOC)
    expect(useHistoryStore.getState().byDoc[DOC]).toEqual({ undo: [], redo: [] })
  })
  it('records per-object history', () => {
    addObjects(DOC, [rect('a'), rect('b')])
    updateObjects(DOC, { a: { x: 5 } }, 'Move A')
    const h = historyForObject(DOC, 'a')
    expect(h.map((c) => c.label)).toEqual(['Move A', 'Add object'])
    expect(historyForObject(DOC, 'b')).toHaveLength(1)
  })
  it('scopes commands (annotation / text / image / page)', () => {
    addObjects(DOC, [createText('p1', DEFAULT_LAYER_ID, { x: 0, y: 0, w: 10, h: 10 }, { text: 'hi' })])
    addBlankPage(DOC, 1)
    const scopes = useHistoryStore.getState().byDoc[DOC].undo.map((c) => c.scope)
    expect(scopes).toEqual(['text', 'page'])
  })
  it('z-order changes are undoable', () => {
    addObjects(DOC, [rect('a'), rect('b'), rect('c')])
    reorderObjects(DOC, ['a'], 'front')
    expect(getObjects(DOC).map((o) => o.id)).toEqual(['b', 'c', 'a'])
    undo(DOC)
    expect(getObjects(DOC).map((o) => o.id)).toEqual(['a', 'b', 'c'])
  })
  it('layer operations and layer deletion (with its objects) are undoable', () => {
    const id = addLayer(DOC, 'Notes')
    addObjects(DOC, [{ ...rect('a'), layerId: id }])
    updateLayer(DOC, id, { visible: false })
    expect(useAnnotationStore.getState().byDoc[DOC].layers.find((l) => l.id === id)?.visible).toBe(false)
    deleteLayer(DOC, id)
    expect(useAnnotationStore.getState().byDoc[DOC].layers.some((l) => l.id === id)).toBe(false)
    expect(getObjects(DOC)).toHaveLength(0)
    undo(DOC)
    expect(getObjects(DOC)).toHaveLength(1)
    expect(useAnnotationStore.getState().byDoc[DOC].layers.some((l) => l.id === id)).toBe(true)
  })
  it('generic execute() supports arbitrary reversible changes', () => {
    let v = 1
    execute(DOC, 'Set', () => (v = 2), () => (v = 1), { scope: 'document' })
    expect(v).toBe(2)
    undo(DOC)
    expect(v).toBe(1)
    redo(DOC)
    expect(v).toBe(2)
  })
  it('marks the document modified', () => {
    expect(usePdfStore.getState().docs[0].modified).toBe(false)
    addObjects(DOC, [rect('a')])
    expect(usePdfStore.getState().docs[0].modified).toBe(true)
  })
})

describe('page operation history', () => {
  const order = () => getPages(DOC).map((p) => p.id)
  it('delete / restore', () => {
    deletePages(DOC, ['p2'])
    expect(order()).toEqual(['p1', 'p3'])
    undo(DOC)
    expect(order()).toEqual(['p1', 'p2', 'p3'])
  })
  it('cannot delete every page', () => {
    expect(() => deletePages(DOC, ['p1', 'p2', 'p3'])).toThrow(/at least one page/)
  })
  it('move, reverse, rotate, duplicate, sort', () => {
    movePages(DOC, ['p1'], 2)
    expect(order()).toEqual(['p2', 'p3', 'p1'])
    undo(DOC)
    reversePages(DOC)
    expect(order()).toEqual(['p3', 'p2', 'p1'])
    undo(DOC)
    rotatePages(DOC, ['p2'], 90)
    expect(getPages(DOC)[1].rotation).toBe(90)
    rotatePages(DOC, ['p2'], -180)
    expect(getPages(DOC)[1].rotation).toBe(270)
    undo(DOC)
    undo(DOC)
    expect(getPages(DOC)[1].rotation).toBe(0)
    const copies = duplicatePages(DOC, ['p2'])
    expect(getPages(DOC)).toHaveLength(4)
    expect(getPages(DOC)[2].id).toBe(copies[0])
    undo(DOC)
    expect(getPages(DOC)).toHaveLength(3)
    sortPages(DOC, 'width', true)
    expect(getPages(DOC)).toHaveLength(3)
  })
  it('duplicating a page duplicates its annotations, and undo removes both', () => {
    addObjects(DOC, [rect('a', 'p2')])
    const [copy] = duplicatePages(DOC, ['p2'])
    const onCopy = getObjects(DOC).filter((o) => o.pageId === copy)
    expect(onCopy).toHaveLength(1)
    undo(DOC)
    expect(getObjects(DOC)).toHaveLength(1)
  })
  it('undo restores structure without reverting background-measured geometry', () => {
    deletePages(DOC, ['p3'])
    usePageStore.getState().patchPage(DOC, 'p1', { width: 999, height: 1234, sizeKnown: true })
    undo(DOC)
    expect(getPages(DOC).find((p) => p.id === 'p1')?.width).toBe(999)
    expect(getPages(DOC)).toHaveLength(3)
  })
  it('added blank pages are undoable', () => {
    addBlankPage(DOC, 1)
    expect(getPages(DOC)).toHaveLength(4)
    undo(DOC)
    expect(getPages(DOC)).toHaveLength(3)
  })
  void pasteObjectsProbe
})
