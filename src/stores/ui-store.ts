import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FitMode, Rect, RenderQuality, ScrollDir, ViewMode } from '@/types'

export type LeftTab = 'thumbnails' | 'outline' | 'attachments' | 'layers' | 'search' | 'pages'
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'idle' | 'error'

export interface Task {
  id: string
  label: string
  /** 0..1, or undefined for indeterminate. */
  progress?: number
  status: 'running' | 'done' | 'error'
  error?: string
  cancel?: () => void
  retry?: () => void
}

export type DialogId =
  | 'merge'
  | 'split'
  | 'extract'
  | 'pageSetup'
  | 'crop'
  | 'labels'
  | 'headerFooter'
  | 'watermark'
  | 'metadata'
  | 'security'
  | 'compress'
  | 'ocr'
  | 'convert'
  | 'export'
  | 'print'
  | 'sign'
  | 'projects'
  | 'shortcuts'
  | 'settings'
  | 'about'
  | 'toolGuide'
  | 'formData'
  | 'redact'
  | 'stamp'
  | 'password'
  | 'fonts'
  | 'insertPdf'
  | 'imagesToPdf'
  | 'newPdf'
  | 'replace'
  | 'link'
  | 'dropMode'

interface UiState {
  // persisted preferences
  leftOpen: boolean
  rightOpen: boolean
  leftTab: LeftTab
  viewMode: ViewMode
  scrollDir: ScrollDir
  zoom: number
  fit: FitMode
  quality: RenderQuality
  lowMemory: boolean
  highContrast: boolean
  reduceMotion: boolean
  historyLimit: number
  author: string
  // transient
  dialog: DialogId | null
  dialogData: unknown
  organizer: boolean
  presentation: boolean
  formMode: 'fill' | 'edit'
  tasks: Task[]
  saveState: SaveState
  lastSavedAt: number | null
  memoryWarning: string | null
  renderEpoch: number
  panning: boolean
  isMobile: boolean
  measurerReady: boolean
  /** Bumped whenever a custom / PDF font finishes loading so text layouts re-measure. */
  fontsEpoch: number
  redactPreview: boolean
  cropDraft: { pageId: string; rect: Rect } | null
  set: (patch: Partial<UiState>) => void
  openDialog: (id: DialogId, data?: unknown) => void
  closeDialog: () => void
  addTask: (t: Omit<Task, 'status'> & { status?: Task['status'] }) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
  bumpRender: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      leftOpen: true,
      rightOpen: true,
      leftTab: 'thumbnails',
      viewMode: 'continuous',
      scrollDir: 'vertical',
      zoom: 1,
      fit: 'width',
      quality: 'standard',
      lowMemory: false,
      highContrast: false,
      reduceMotion: false,
      historyLimit: 200,
      author: '',
      dialog: null,
      dialogData: null,
      organizer: false,
      presentation: false,
      formMode: 'fill',
      tasks: [],
      saveState: 'idle',
      lastSavedAt: null,
      memoryWarning: null,
      renderEpoch: 0,
      panning: false,
      isMobile: false,
      measurerReady: false,
      fontsEpoch: 0,
      redactPreview: false,
      cropDraft: null,
      set: (patch) => set(patch),
      openDialog: (id, data) => set({ dialog: id, dialogData: data ?? null }),
      closeDialog: () => set({ dialog: null, dialogData: null }),
      addTask: (t) => set((s) => ({ tasks: [...s.tasks.filter((x) => x.id !== t.id), { status: 'running', ...t }] })),
      updateTask: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      bumpRender: () => set((s) => ({ renderEpoch: s.renderEpoch + 1 })),
    }),
    {
      name: 'pdfstudio.ui.v1',
      version: 1,
      partialize: (s) => ({
        leftOpen: s.leftOpen,
        rightOpen: s.rightOpen,
        leftTab: s.leftTab,
        viewMode: s.viewMode,
        scrollDir: s.scrollDir,
        quality: s.quality,
        lowMemory: s.lowMemory,
        highContrast: s.highContrast,
        reduceMotion: s.reduceMotion,
        historyLimit: s.historyLimit,
        author: s.author,
      }),
    },
  ),
)
