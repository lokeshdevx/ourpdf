export interface QueueJob<T> {
  promise: Promise<T>
  cancel: () => void
}
interface Pending {
  priority: number
  start: () => void
  cancelled: boolean
}

/**
 * Bounded-concurrency priority queue for canvas rendering. PDF.js parses in its own worker but paints on the
 * main thread, so we cap concurrent paints, run the most urgent (lowest priority number) first, and let callers
 * cancel jobs that scrolled out of view.
 */
export class RenderQueue {
  private queue: Pending[] = []
  private running = 0
  constructor(public concurrency = 2) {}

  enqueue<T>(priority: number, run: (onCancel: (fn: () => void) => void) => Promise<T>): QueueJob<T> {
    let cancelHook: (() => void) | null = null
    let started = false
    let cancelled = false
    let resolveFn!: (v: T) => void
    let rejectFn!: (e: unknown) => void
    const promise = new Promise<T>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })
    const item: Pending = {
      priority,
      cancelled: false,
      start: () => {
        started = true
        this.running++
        run((fn) => {
          cancelHook = fn
        })
          .then(resolveFn, rejectFn)
          .finally(() => {
            this.running--
            this.pump()
          })
      },
    }
    this.queue.push(item)
    this.queue.sort((a, b) => a.priority - b.priority)
    this.pump()
    const cancel = () => {
      if (cancelled) return
      cancelled = true
      if (!started) {
        item.cancelled = true
        this.queue = this.queue.filter((q) => q !== item)
        rejectFn(new DOMException('Render cancelled', 'AbortError'))
      } else {
        cancelHook?.()
      }
    }
    return { promise, cancel }
  }

  private pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const next = this.queue.shift()!
      if (!next.cancelled) next.start()
    }
  }
  setConcurrency(n: number) {
    this.concurrency = Math.max(1, n)
    this.pump()
  }
  get pending() {
    return this.queue.length + this.running
  }
}

export const renderQueue = new RenderQueue(2)
