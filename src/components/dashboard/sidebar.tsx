'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { migrationAuthClient } from '@/lib/migration/auth-client'
import { Anchor, SquarePen, Search, LogOut, ChevronsUpDown, Sun, Moon, Monitor, Check, X, MapPin, Ship } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Sidebar as SidebarPrimitive, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'


function dateGroup(date: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const timestamp = new Date(date).getTime()
  if (timestamp >= today.getTime()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (timestamp >= yesterday.getTime()) return 'Yesterday'
  const week = new Date(today)
  week.setDate(today.getDate() - 7)
  return timestamp >= week.getTime() ? 'Previous 7 days' : 'Earlier'
}

export default function Sidebar({ email, name }: { email: string; name: string }) {
  const history = usePaginatedQuery(api.migration.listConversations, {}, { initialNumItems: 30 })
  const conversations = history.results.map(item => ({ ...item, updated_at: new Date(item.updatedAt).toISOString() }))
  const status = history.status === 'LoadingFirstPage' ? 'loading' : 'ready'
  const [search, setSearch] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { isMobile, setOpenMobile } = useSidebar()
  const displayName = name || email.split('@')[0] || 'Your account'
  const initials = displayName.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()

  const handleSignOut = async () => {
    setSigningOut(true)
    setSignOutError(false)
    try {
      const { error } = await migrationAuthClient.signOut()
      if (error) throw error
      router.push('/login')
      router.refresh()
    } catch { setSignOutError(true); setSigningOut(false) }
  }
  const closeMobile = () => setOpenMobile(false)
  const filtered = conversations.filter(conversation => conversation.title.toLowerCase().includes(search.toLowerCase()))
  const groups = ['Today', 'Yesterday', 'Previous 7 days', 'Earlier'].map(label => ({ label, items: filtered.filter(conversation => dateGroup(conversation.updated_at) === label) }))

  return (
    <SidebarPrimitive className="border-sidebar-border/60" aria-label="Chat navigation">
      <SidebarHeader className="gap-5 px-4 pt-5 pb-3">
        <div className="flex items-center justify-between px-1">
          <Link href="/dashboard" onClick={closeMobile} className="flex items-center gap-2.5 rounded-md text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring" aria-label="Berthwise home">
            <Anchor className="size-5 text-brand" strokeWidth={1.8} aria-hidden="true" />berthwise
          </Link>
          {isMobile ? <Button variant="ghost" size="icon-lg" onClick={closeMobile} aria-label="Close sidebar"><X /></Button> : <SidebarTrigger className="size-8 text-muted-foreground" />}
        </div>
        <Button asChild variant="outline" className="h-10 w-full justify-start gap-2.5 border-border/70 bg-background/60 text-sm shadow-none">
          <Link href="/dashboard" onClick={closeMobile}><SquarePen className="size-4 text-brand" aria-hidden="true" />New conversation</Link>
        </Button>
        <nav aria-label="Berthwise pages" className="-mt-2 flex flex-col gap-0.5">
          <Button asChild variant="ghost" className="h-9 w-full justify-start gap-2.5 px-3 text-sm font-normal text-sidebar-foreground">
            <Link href="/dashboard/fleet" onClick={closeMobile} aria-current={pathname === '/dashboard/fleet' ? 'page' : undefined}><Ship className="size-4 text-brand" aria-hidden="true" />My fleet</Link>
          </Button>
          <Button asChild variant="ghost" className="h-9 w-full justify-start gap-2.5 px-3 text-sm font-normal text-sidebar-foreground">
            <Link href="/dashboard/coverage" onClick={closeMobile} aria-current={pathname === '/dashboard/coverage' ? 'page' : undefined}><MapPin className="size-4 text-brand" aria-hidden="true" />Ports covered</Link>
          </Button>
        </nav>
        <InputGroup className="h-9 border-transparent bg-transparent dark:bg-transparent">
          <InputGroupAddon><Search className="size-4" aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={event => setSearch(event.target.value)} className="text-xs md:text-xs" />
        </InputGroup>
      </SidebarHeader>
      <SidebarContent className="px-2">
        {status === 'loading' && <div role="status" aria-label="Loading conversations" className="space-y-4 px-3 py-5"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>}
        {status === 'ready' && filtered.length === 0 && <p className="px-3 py-5 text-xs leading-relaxed text-muted-foreground">{search ? 'No conversations match your search.' : 'Your conversations will appear here.'}</p>}
        {groups.filter(group => group.items.length > 0).map(group => (
          <SidebarGroup key={group.label} className="pt-2 pb-4">
            <SidebarGroupLabel className="mb-1 text-xs font-normal text-muted-foreground">{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map(conversation => {
                const active = pathname === `/dashboard/chat/${conversation.id}`
                return (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton asChild isActive={active} className="h-9 px-2.5 font-normal data-active:font-medium">
                      <Link href={`/dashboard/chat/${conversation.id}`} onClick={closeMobile} aria-current={active ? 'page' : undefined} title={conversation.title}><span>{conversation.title}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        {history.status === 'CanLoadMore' && <Button variant="ghost" className="mx-3 mb-4 text-xs" onClick={() => history.loadMore(30)}>Load more conversations</Button>}
        {history.status === 'LoadingMore' && <p role="status" className="px-3 py-3 text-xs text-muted-foreground">Loading more…</p>}
      </SidebarContent>
      <SidebarFooter className="gap-2 p-3">
        {signOutError && <p role="alert" className="px-2 text-xs text-destructive">Sign out failed. Please try again.</p>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-14 w-full justify-start gap-3 px-2" aria-label="Account and appearance">
              <Avatar className="size-8"><AvatarFallback className="bg-sidebar-accent text-xs font-medium">{initials}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{displayName}</span><span className="block truncate text-xs font-normal text-muted-foreground">Personal workspace</span></span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email || displayName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            {([{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Monitor }] as const).map(option => (
              <DropdownMenuItem key={option.value} onSelect={() => setTheme(option.value)}><option.icon aria-hidden="true" />{option.label}{theme === option.value && <Check className="ml-auto" aria-hidden="true" />}</DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={signingOut} onSelect={() => void handleSignOut()}><LogOut aria-hidden="true" />{signingOut ? 'Signing out…' : 'Sign out'}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </SidebarPrimitive>
  )
}
