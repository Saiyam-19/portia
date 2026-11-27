'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Sidebar as VisualSidebar } from '@/components/berthwise/sidebar'
import { AccountMenu } from '@/components/berthwise/account-menu'
import { useSidebar } from '@/components/ui/sidebar'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/berthwise/ui/button'

export default function Sidebar({ email, name }: { email: string; name: string }) {
  const history = usePaginatedQuery(api.conversations.list, {}, { initialNumItems: 30 })
  const search = useRef<HTMLInputElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { open, openMobile, toggleSidebar, setOpen, setOpenMobile, isMobile } = useSidebar()
  const activeId = pathname.startsWith('/dashboard/chat/') ? pathname.split('/').at(-1) ?? null : null
  const navigate = (path: string) => { router.push(path); setOpenMobile(false) }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault(); if (isMobile) setOpenMobile(true); else setOpen(true)
        setTimeout(() => search.current?.focus(), 100)
      } else if (mod && event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault(); router.push('/dashboard'); setOpenMobile(false)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [router, setOpen, setOpenMobile, isMobile])
  const content = (
    <VisualSidebar conversations={history.results} activeId={activeId} running={new Set(history.results.filter(chat => chat.state === 'running').map(chat => chat.id))}
      onSelect={id => navigate(`/dashboard/chat/${id}`)} onNew={() => navigate('/dashboard')} onCollapse={() => isMobile ? setOpenMobile(false) : toggleSidebar()}
      searchRef={search}
      onArtifacts={() => navigate('/dashboard/artifacts')} artifactsActive={pathname === '/dashboard/artifacts'}
      loading={history.status === 'LoadingFirstPage'} account={<AccountMenu name={name} email={email} />}
      footer={<>
        {history.status === 'CanLoadMore' && <Button variant="ghost" size="sm" onClick={() => history.loadMore(30)}>Load more chats</Button>}
        {history.status === 'LoadingMore' && <p role="status" className="px-2 py-3 text-xs text-ink-3">Loading more…</p>}
      </>} />
  )
  if (isMobile) return <Sheet open={openMobile} onOpenChange={setOpenMobile}>
    <SheetContent side="left" showCloseButton={false} className="app-root max-w-[calc(100vw-32px)] bg-sidebar p-0 text-ink data-[side=left]:w-[268px] data-[side=left]:border-0">
      <SheetHeader className="sr-only"><SheetTitle>Chats</SheetTitle><SheetDescription>Search your chats or start a new conversation.</SheetDescription></SheetHeader>
      {content}
    </SheetContent>
  </Sheet>
  return <aside aria-label="Chat navigation" data-state={open ? 'expanded' : 'collapsed'} className="peer relative hidden shrink-0 overflow-clip lg:block" style={{ width: open ? 268 : 0, transition: 'width 320ms cubic-bezier(0.23,1,0.32,1)' }}>
    <div className="h-full w-[268px] transition-[opacity,transform] duration-300" style={{ opacity: open ? 1 : 0, transform: open ? 'none' : 'translateX(-12px)', transitionTimingFunction: 'cubic-bezier(0.23,1,0.32,1)' }} inert={!open}>{content}</div>
  </aside>
}
