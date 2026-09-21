import { create } from 'zustand'
import { DEFAULT_LAYER_ID, type EditObject, type Layer } from '@/types'
import { usePdfStore } from './pdf-store'

interface DocObjects {
  /** Array order == z-order (later = on top). */
  objects: EditObject[]
  layers: Layer[]
  activeLayerId: string
}
export const EMPTY_OBJECTS: EditObject[] = []
export const EMPTY_LAYERS: Layer[] = []

export const defaultLayers = (): Layer[] => [{ id: DEFAULT_LAYER_ID, name: 'Annotations', visible: true, locked: false }]

interface AnnotationState {
  byDoc: Record<string, DocObjects>
  init: (docId: string, objects?: EditObject[], layers?: Layer[]) => void
  setObjects: (docId: string, objects: EditObject[]) => void
  setLayers: (docId: string, layers: Layer[]) => void
  setActiveLayer: (docId: string, id: string) => void
  drop: (docId: string) => void
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  byDoc: {},
  init: (docId, objects = [], layers = defaultLayers()) =>
    set((s) => ({ byDoc: { ...s.byDoc, [docId]: { objects, layers, activeLayerId: layers[0]?.id ?? DEFAULT_LAYER_ID } } })),
  setObjects: (docId, objects) =>
    set((s) => {
      const cur = s.byDoc[docId]
      if (!cur) return s
      return { byDoc: { ...s.byDoc, [docId]: { ...cur, objects } } }
    }),
  setLayers: (docId, layers) =>
    set((s) => {
      const cur = s.byDoc[docId]
      if (!cur) return s
      const active = layers.some((l) => l.id === cur.activeLayerId) ? cur.activeLayerId : (layers[0]?.id ?? DEFAULT_LAYER_ID)
      return { byDoc: { ...s.byDoc, [docId]: { ...cur, layers, activeLayerId: active } } }
    }),
  setActiveLayer: (docId, id) =>
    set((s) => {
      const cur = s.byDoc[docId]
      if (!cur) return s
      return { byDoc: { ...s.byDoc, [docId]: { ...cur, activeLayerId: id } } }
    }),
  drop: (docId) =>
    set((s) => {
      const rest = { ...s.byDoc }
      delete rest[docId]
      return { byDoc: rest }
    }),
}))

export const useActiveObjects = (): EditObject[] => {
  const id = usePdfStore((s) => s.activeId)
  return useAnnotationStore((s) => (id && s.byDoc[id]?.objects) || EMPTY_OBJECTS)
}
export const useActiveLayers = (): Layer[] => {
  const id = usePdfStore((s) => s.activeId)
  return useAnnotationStore((s) => (id && s.byDoc[id]?.layers) || EMPTY_LAYERS)
}
export const useActiveLayerId = (): string => {
  const id = usePdfStore((s) => s.activeId)
  return useAnnotationStore((s) => (id && s.byDoc[id]?.activeLayerId) || DEFAULT_LAYER_ID)
}
export const getObjects = (docId: string): EditObject[] => useAnnotationStore.getState().byDoc[docId]?.objects ?? EMPTY_OBJECTS
export const getLayers = (docId: string): Layer[] => useAnnotationStore.getState().byDoc[docId]?.layers ?? EMPTY_LAYERS
