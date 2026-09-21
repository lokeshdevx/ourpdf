'use client'

import { useEffect } from 'react'
import { cacheStats } from '@/services/pdf/renderer'
import { totalSourceBytes } from '@/services/pdf/sources'
import { useUiStore } from '@/stores/ui-store'
import { formatBytes } from '@/utils/format'

interface PerfMemory {
  usedJSHeapSize: number
  jsHeapSizeLimit: number
}

/** Watches JS heap (Chromium) and loaded document size; raises a status-bar warning before the tab runs out of memory. */
export function useMemoryMonitor() {
  useEffect(() => {
    const tick = () => {
      const mem = (performance as unknown as { memory?: PerfMemory }).memory
      const src = totalSourceBytes()
      const cache = cacheStats()
      let warning: string | null = null
      if (mem && mem.usedJSHeapSize / mem.jsHeapSizeLimit > 0.7) warning = `High memory use (${formatBytes(mem.usedJSHeapSize)} of ${formatBytes(mem.jsHeapSizeLimit)}). Close documents or enable low-memory mode.`
      else if (src > 400 * 1024 * 1024) warning = `Large documents loaded (${formatBytes(src)}). Exports may run out of memory – consider splitting.`
      else if (cache.pageBytes > 300 * 1024 * 1024) warning = 'Render cache is large – enable low-memory mode to reduce usage.'
      if (useUiStore.getState().memoryWarning !== warning) useUiStore.getState().set({ memoryWarning: warning })
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => clearInterval(id)
  }, [])
}
