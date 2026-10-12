'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useMemoryFeature } from '@/components/memory/feature'
import MemoryPanel from '@/components/memory/memory-panel'
import { SquarePen, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export default function WorkspaceHeader({ title, conversation = false }: { title: string; conversation?: boolean }) {
  const [memoryOpen,setMemoryOpen] = useState(false)
  const memoryEnabled = useMemoryFeature()
  const pathname = usePathname()
  const conversationId = pathname.startsWith('/dashboard/chat/') ? pathname.split('/').at(-1) : undefined
  return (<>
    <header className="flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6">
      <SidebarTrigger className="size-9 text-muted-foreground" />
      <h1 className="min-w-0 truncate text-sm font-medium" title={title}>{title}</h1>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {memoryEnabled && <Button variant="ghost" aria-expanded={memoryOpen} aria-controls="memory-panel" onClick={()=>setMemoryOpen(value=>!value)}><BookOpen className="size-4" aria-hidden="true" />Memory</Button>}
        {conversation ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon-lg">
                <Link href="/dashboard" aria-label="New conversation"><SquarePen aria-hidden="true" /></Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>New conversation</TooltipContent>
          </Tooltip>
        ) : <span className="hidden text-xs text-muted-foreground sm:inline">Port intelligence</span>}
      </div>
    </header>
    {memoryEnabled && memoryOpen && <MemoryPanel key={pathname} conversationId={conversationId} onClose={()=>setMemoryOpen(false)} />}
    </>
  )
}
