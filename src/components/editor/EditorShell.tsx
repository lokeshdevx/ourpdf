'use client'

import { useEffect, useRef, useState } from 'react'
import { Files, PanelRight, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { DialogHost } from '@/components/dialogs/DialogHost'
import { PdfViewer } from '@/components/pdf/PdfViewer'
import { initMeasurer } from '@/engine/fonts'
import { useGlobalShortcuts } from '@/hooks/use-shortcuts'
import { useMemoryMonitor } from '@/hooks/use-memory-monitor'
import { importFiles } from '@/services/import'
import { trackTextSelection } from '@/services/markup'
import { startAutosave, flushAutosave } from '@/services/storage/projects'
import { exitPresentation } from '@/services/view'
import { runCommand } from '@/features/commands'
import { TOOL_LAUNCH } from '@/lib/seo-pages'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import { BottomBar } from './BottomBar'
import { EditorContextMenu } from './EditorContextMenu'
import { Onboarding } from './Onboarding'
import { PageOrganizer } from './PageOrganizer'
import { PropertiesPanel } from './properties/PropertiesPanel'
import { LeftSidebar } from './sidebar/LeftSidebar'
import { StatusBar } from './StatusBar'
import { DocTabs } from './toolbar/DocTabs'
import { MenuBar } from './toolbar/MenuBar'
import { Ribbon } from './toolbar/Ribbon'

export function EditorShell() {
  const active = usePdfStore((s) => s.activeId)
  const ui = useUiStore()
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const selCount = useSelectionStore((s) => s.objectIds.length)
  const tool = useToolStore((s) => s.tool)
  useGlobalShortcuts()
  useMemoryMonitor()

  /* `/editor?tool=merge` launches the matching real tool (from the SEO landing pages) */
  const [launch] = useState(() => (typeof window === 'undefined' ? null : TOOL_LAUNCH[new URLSearchParams(window.location.search).get('tool') ?? ''] ?? null))
  const [launched, setLaunched] = useState(false)
  useEffect(() => {
    if (!launch || launched) return
    if (launch.immediate || active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot launch flag
      setLaunched(true)
      window.history.replaceState(null, '', '/editor')
      setTimeout(() => void runCommand(launch.command), 250)
    }
  }, [launch, launched, active])

  /* every newly opened document starts in Edit-text mode (objects and PDF images stay selectable and movable in it) */
  useEffect(() => usePdfStore.subscribe((st, prev) => {
    if (st.docs.length > prev.docs.length && useToolStore.getState().tool === 'select') useToolStore.getState().setTool('edit-text')
  }), [])

  /* one-time setup */
  useEffect(() => {
    initMeasurer().then(() => useUiStore.getState().set({ measurerReady: true }))
    const stopAutosave = startAutosave()
    const stopSel = trackTextSelection()
    const mq = window.matchMedia('(max-width: 767px)')
    const setMobile = () => useUiStore.getState().set({ isMobile: mq.matches })
    setMobile()
    mq.addEventListener('change', setMobile)
    if (window.innerWidth < 1100) useUiStore.getState().set({ rightOpen: false })
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void flushAutosave()
      if (usePdfStore.getState().docs.some((d) => d.modified)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    const onFs = () => {
      if (!document.fullscreenElement && useUiStore.getState().presentation) void exitPresentation()
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      stopAutosave()
      stopSel()
      mq.removeEventListener('change', setMobile)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [])

  /* accessibility / appearance classes */
  useEffect(() => {
    document.documentElement.classList.toggle('hc', ui.highContrast)
    document.documentElement.classList.toggle('reduce-motion', ui.reduceMotion)
  }, [ui.highContrast, ui.reduceMotion])

  /* drag & drop of files anywhere */
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => { if (hasFiles(e)) { dragDepth.current++; setDragging(true) } }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const leave = (e: DragEvent) => { if (hasFiles(e) && --dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      void importFiles(Array.from(e.dataTransfer!.files))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const center = (
    <div className="relative h-full min-h-0" data-testid="canvas-area">
      {!active ? (
        <Onboarding hint={launch && !launched ? launch.hint : undefined} />
      ) : ui.organizer ? (
        <PageOrganizer />
      ) : (
        <EditorContextMenu>
          <div
            className="h-full"
            onPointerDown={(e) => {
              const t = e.target as HTMLElement
              if (!t.closest('[data-obj],.sel-handle,.sel-rotate,textarea,input,select,button') && tool === 'select') useSelectionStore.getState().setObjects([])
            }}
          >
            <PdfViewer />
          </div>
        </EditorContextMenu>
      )}
    </div>
  )

  if (ui.presentation && active) {
    return (
      <div className="fixed inset-0 z-50 bg-black" data-testid="presentation">
        <PdfViewer />
        <Button className="absolute right-4 top-4 opacity-40 hover:opacity-100" variant="secondary" size="sm" onClick={() => void exitPresentation()}>Exit (Esc)</Button>
        <DialogHost />
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground" data-testid="editor-shell">
      <MenuBar />
      <Ribbon />
      <DocTabs />
      <main className="min-h-0 flex-1">
        {ui.isMobile ? (
          <div className="relative h-full">
            {center}
            {active && (
              <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-between px-3">
                <Sheet>
                  <SheetTrigger asChild><Button size="sm" variant="secondary" className="pointer-events-auto gap-1 shadow" aria-label="Open pages and panels"><Files className="size-4" /> Pages</Button></SheetTrigger>
                  <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
                    <SheetHeader className="h-11 justify-center border-b py-0 pl-4 pr-12"><SheetTitle className="text-sm">Pages &amp; panels</SheetTitle></SheetHeader>
                    <div className="h-[calc(100%-2.75rem)]"><LeftSidebar /></div>
                  </SheetContent>
                </Sheet>
                <Drawer>
                  <DrawerTrigger asChild><Button size="sm" variant={selCount ? 'default' : 'secondary'} className="pointer-events-auto gap-1 shadow" aria-label="Open properties"><PanelRight className="size-4" /> Properties</Button></DrawerTrigger>
                  <DrawerContent className="h-[65vh]">
                    <DrawerHeader className="sr-only"><DrawerTitle>Properties</DrawerTitle></DrawerHeader>
                    <div className="min-h-0 flex-1 overflow-hidden"><PropertiesPanel /></div>
                  </DrawerContent>
                </Drawer>
              </div>
            )}
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            {ui.leftOpen && active && (
              <>
                <ResizablePanel id="left" defaultSize="18%" minSize="13%" maxSize="35%">
                  <LeftSidebar />
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}
            <ResizablePanel id="center" minSize="30%">{center}</ResizablePanel>
            {ui.rightOpen && active && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel id="right" defaultSize="20%" minSize="15%" maxSize="35%">
                  <aside className="h-full border-l bg-sidebar" aria-label="Properties"><PropertiesPanel /></aside>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        )}
      </main>
      {active && <BottomBar />}
      <StatusBar />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-primary/10 backdrop-blur-[1px]" data-testid="drop-overlay">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-background/90 px-10 py-8 text-primary shadow-xl">
            <UploadCloud className="size-10" />
            <div className="text-lg font-semibold">Drop files to open</div>
            <div className="text-xs text-muted-foreground">PDF, images, TXT, HTML, DOCX, XLSX – processed locally</div>
          </div>
        </div>
      )}
      <CommandPalette />
      <DialogHost />
    </div>
  )
}
