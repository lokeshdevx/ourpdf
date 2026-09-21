import { Emitter } from '@/lib/events'
import type { Rect } from '@/types'

export type ViewerCommand =
  | { type: 'goto'; index: number }
  | { type: 'reveal'; index: number; rect: Rect }
  | { type: 'zoom-by'; factor: number }

/** Lets any component drive the viewer (navigate, reveal a rectangle, zoom) without prop drilling. */
export const viewerBus = new Emitter<ViewerCommand>()
export const goToPage = (index: number) => viewerBus.emit({ type: 'goto', index })
export const revealRect = (index: number, rect: Rect) => viewerBus.emit({ type: 'reveal', index, rect })
export const zoomBy = (factor: number) => viewerBus.emit({ type: 'zoom-by', factor })
