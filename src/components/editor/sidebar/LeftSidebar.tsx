'use client'

import { Bookmark, Layers, Paperclip, Search, Files, LayoutList } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiStore, type LeftTab } from '@/stores/ui-store'
import { PageGrid } from './PageGrid'
import { OutlinePanel } from './OutlinePanel'
import { AttachmentsPanel } from './AttachmentsPanel'
import { LayersPanel } from './LayersPanel'
import { SearchPanel } from './SearchPanel'
import { PagesPanel } from './PagesPanel'

const TABS: { id: LeftTab; label: string; icon: typeof Search }[] = [
  { id: 'thumbnails', label: 'Thumbnails', icon: LayoutList },
  { id: 'outline', label: 'Bookmarks', icon: Bookmark },
  { id: 'attachments', label: 'Attachments', icon: Paperclip },
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'pages', label: 'Pages', icon: Files },
]

export function LeftSidebar() {
  const tab = useUiStore((s) => s.leftTab)
  const set = useUiStore((s) => s.set)
  return (
    <Tabs value={tab} onValueChange={(v) => set({ leftTab: v as LeftTab })} className="flex h-full min-h-0 flex-col gap-0 bg-sidebar" data-testid="left-sidebar">
      <TabsList className="h-auto w-full shrink-0 justify-between rounded-none border-b bg-transparent p-1" aria-label="Sidebar panels">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <TabsTrigger value={id} className="h-8 flex-1 px-0 data-[state=active]:bg-accent" aria-label={label} data-testid={`tab-${id}`}>
                <Icon className="size-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </TabsList>
      <div className="min-h-0 flex-1">
        <TabsContent value="thumbnails" className="m-0 h-full"><PageGrid cellW={132} cellH={190} columns={1} /></TabsContent>
        <TabsContent value="outline" className="m-0 h-full"><OutlinePanel /></TabsContent>
        <TabsContent value="attachments" className="m-0 h-full"><AttachmentsPanel /></TabsContent>
        <TabsContent value="layers" className="m-0 h-full"><LayersPanel /></TabsContent>
        <TabsContent value="search" className="m-0 h-full"><SearchPanel /></TabsContent>
        <TabsContent value="pages" className="m-0 h-full"><PagesPanel /></TabsContent>
      </div>
    </Tabs>
  )
}
