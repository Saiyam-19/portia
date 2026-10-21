'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useMemoryFeature } from '@/components/memory/feature'
import MemoryPanel from '@/components/memory/memory-panel'
import { SquarePen, BookOpen, PanelLeft } from 'lucide-react'
import { Button, Tooltip } from '@/components/berthwise/ui/button'
import { TextSwap } from '@/components/berthwise/ui/motion'
import { useSidebar } from '@/components/ui/sidebar'

export default function WorkspaceHeader({ title, conversation = false, actions }: { title: string; conversation?: boolean; actions?: ReactNode }) {
  const [memoryOpen, setMemoryOpen] = useState(false)
  const memoryEnabled = useMemoryFeature()
  const pathname = usePathname()
  const { open, isMobile, toggleSidebar } = useSidebar()
  const conversationId = pathname.startsWith('/dashboard/chat/') ? pathname.split('/').at(-1) : undefined
  return <>
    <header className="relative z-20 flex h-13 shrink-0 items-center gap-1 px-3">
      {(!open || isMobile) && <>
        <Tooltip label="Open sidebar" side="bottom" align="start"><Button variant="ghost" size="icon" aria-label="Open sidebar" onClick={toggleSidebar}><PanelLeft strokeWidth={1.8} /></Button></Tooltip>
        <Tooltip label="New chat" side="bottom"><Link href="/dashboard" aria-label="New chat" className="flex size-9 items-center justify-center rounded-control text-ink-2 hover:bg-hover"><SquarePen className="size-4" strokeWidth={1.8} /></Link></Tooltip>
      </>}
      <h1 className="min-w-0 flex-1 truncate px-1.5 text-[14px] font-medium text-ink" title={title}><TextSwap text={title} className="max-w-full truncate align-middle" /></h1>
      {memoryEnabled && <Button variant="ghost" size="sm" aria-expanded={memoryOpen} aria-controls="memory-panel" onClick={() => setMemoryOpen(value => !value)} leading={<BookOpen />}>Memory</Button>}
      {conversation && actions}
    </header>
    {memoryEnabled && memoryOpen && <MemoryPanel key={pathname} conversationId={conversationId} onClose={() => setMemoryOpen(false)} />}
  </>
}
