import { execute } from '@/services/history'
import { getDoc, usePdfStore } from '@/stores/pdf-store'
import type { Bookmark } from '@/types'
import { uid } from '@/utils/id'

function setBookmarks(docId: string, next: Bookmark[], label: string) {
  const before = getDoc(docId)?.bookmarks ?? []
  execute(
    docId,
    label,
    () => usePdfStore.getState().updateDoc(docId, { bookmarks: next }),
    () => usePdfStore.getState().updateDoc(docId, { bookmarks: before }),
    { scope: 'document' },
  )
}

const mapTree = (items: Bookmark[], fn: (b: Bookmark) => Bookmark | null): Bookmark[] =>
  items.flatMap((b) => {
    const r = fn(b)
    return r ? [{ ...r, children: mapTree(r.children, fn) }] : []
  })

export function addBookmark(docId: string, b: { pageId: string | null; title: string; y?: number }, parentId?: string): string {
  const doc = getDoc(docId)
  if (!doc) return ''
  const node: Bookmark = { id: uid('bm'), title: b.title, pageId: b.pageId, y: b.y ?? 0, children: [] }
  const next = parentId ? mapTree(doc.bookmarks, (x) => (x.id === parentId ? { ...x, children: [...x.children, node] } : x)) : [...doc.bookmarks, node]
  setBookmarks(docId, next, 'Add bookmark')
  return node.id
}

export function deleteBookmark(docId: string, id: string) {
  const doc = getDoc(docId)
  if (doc) setBookmarks(docId, mapTree(doc.bookmarks, (x) => (x.id === id ? null : x)), 'Delete bookmark')
}

export function updateBookmark(docId: string, id: string, patch: Partial<Bookmark>, label = 'Edit bookmark') {
  const doc = getDoc(docId)
  if (doc) setBookmarks(docId, mapTree(doc.bookmarks, (x) => (x.id === id ? { ...x, ...patch } : x)), label)
}

/** Moves a bookmark up/down among its siblings, or indents/outdents it (nested bookmarks). */
export function moveBookmark(docId: string, id: string, dir: 'up' | 'down' | 'in' | 'out') {
  const doc = getDoc(docId)
  if (!doc) return
  const tree = structuredClone(doc.bookmarks)
  const find = (list: Bookmark[], parent: Bookmark[] | null, grand: { list: Bookmark[]; parentIdx: number } | null): { list: Bookmark[]; i: number; grand: typeof grand } | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { list, i, grand }
      const r = find(list[i].children, list, { list, parentIdx: i })
      if (r) return r
    }
    void parent
    return null
  }
  const hit = find(tree, null, null)
  if (!hit) return
  const { list, i } = hit
  if (dir === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]
  else if (dir === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]
  else if (dir === 'in' && i > 0) {
    const [node] = list.splice(i, 1)
    list[i - 1].children.push(node)
  } else if (dir === 'out' && hit.grand) {
    const [node] = list.splice(i, 1)
    hit.grand.list.splice(hit.grand.parentIdx + 1, 0, node)
  } else return
  setBookmarks(docId, tree, 'Move bookmark')
}

export function flattenBookmarks(items: Bookmark[], depth = 0): { b: Bookmark; depth: number }[] {
  return items.flatMap((b) => [{ b, depth }, ...(b.collapsed ? [] : flattenBookmarks(b.children, depth + 1))])
}
