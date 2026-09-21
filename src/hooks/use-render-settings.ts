'use client'

import { useEffect, useMemo, useState } from 'react'
import { useUiStore } from '@/stores/ui-store'
import type { RenderSettings } from '@/services/pdf/renderer'
import { setLowMemory } from '@/services/pdf/renderer'

export function useRenderSettings(): RenderSettings {
  const quality = useUiStore((s) => s.quality)
  const lowMemory = useUiStore((s) => s.lowMemory)
  const [dpr, setDpr] = useState(1)
  useEffect(() => {
    const update = () => setDpr(window.devicePixelRatio || 1)
    update()
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  useEffect(() => setLowMemory(lowMemory), [lowMemory])
  return useMemo(() => ({ quality, lowMemory, dpr }), [quality, lowMemory, dpr])
}
