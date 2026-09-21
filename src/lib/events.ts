type Handler<T> = (payload: T) => void

/** Minimal typed event emitter used to decouple stores/services (e.g. autosave triggers). */
export class Emitter<T> {
  private handlers = new Set<Handler<T>>()
  on(h: Handler<T>): () => void {
    this.handlers.add(h)
    return () => this.handlers.delete(h)
  }
  emit(p: T): void {
    for (const h of [...this.handlers]) h(p)
  }
}

/** Fired with the doc id whenever the document content changes. */
export const docChanged = new Emitter<string>()
