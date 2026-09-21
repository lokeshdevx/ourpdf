import { create } from 'zustand'
import type { Rect } from '@/types'

export interface SearchHit {
  pageId: string
  pageIndex: number
  /** Match rectangles in base space (one per line/segment). */
  rects: Rect[]
  /** Context snippet. */
  before: string
  match: string
  after: string
  fromOcr: boolean
}

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  /** Treat the query as an exact phrase (whitespace-insensitive match otherwise). */
  exactPhrase: boolean
  includeOcr: boolean
}

interface SearchState {
  query: string
  replacement: string
  options: SearchOptions
  hits: SearchHit[]
  current: number
  status: 'idle' | 'running' | 'done'
  progress: number
  setQuery: (q: string) => void
  setReplacement: (q: string) => void
  setOptions: (o: Partial<SearchOptions>) => void
  setResults: (hits: SearchHit[], status: SearchState['status'], progress?: number) => void
  setCurrent: (i: number) => void
  reset: () => void
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  replacement: '',
  options: { caseSensitive: false, wholeWord: false, exactPhrase: true, includeOcr: true },
  hits: [],
  current: 0,
  status: 'idle',
  progress: 0,
  setQuery: (query) => set({ query }),
  setReplacement: (replacement) => set({ replacement }),
  setOptions: (o) => set((s) => ({ options: { ...s.options, ...o } })),
  setResults: (hits, status, progress = status === 'done' ? 1 : 0) =>
    set((s) => ({ hits, status, progress, current: Math.min(s.current, Math.max(0, hits.length - 1)) })),
  setCurrent: (current) => set({ current }),
  reset: () => set({ hits: [], current: 0, status: 'idle', progress: 0 }),
}))
