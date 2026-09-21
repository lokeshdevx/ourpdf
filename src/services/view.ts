import { useUiStore } from '@/stores/ui-store'

export async function toggleFullscreen(el: HTMLElement = document.documentElement) {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await el.requestFullscreen()
  } catch {
    /* fullscreen may be blocked; ignore */
  }
}

export async function enterPresentation() {
  const ui = useUiStore.getState()
  ui.set({ presentation: true, viewMode: 'single', fit: 'page', scrollDir: 'vertical' })
  try {
    await document.documentElement.requestFullscreen()
  } catch {
    /* presentation still works without fullscreen */
  }
}

export async function exitPresentation() {
  useUiStore.getState().set({ presentation: false, viewMode: 'continuous', fit: 'width' })
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
}
