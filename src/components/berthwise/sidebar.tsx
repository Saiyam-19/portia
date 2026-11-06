'use client'

import { useState } from 'react'
import { Files, PanelLeft, Search, SquarePen, X } from 'lucide-react'
export type Conversation = { id: string; title: string; updatedAt: number; pinned?: boolean }
import { cn } from '@/lib/utils'
import { Button, Tooltip } from '@/components/berthwise/ui/button'
import { GlideMenu } from '@/components/berthwise/ui/popover'

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-7 items-center justify-center rounded-[9px] bg-ink text-canvas shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.2)]',
        className,
      )}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 17c2.5 1.5 4.5 1.5 7 0s4.5-1.5 7 0 4.5 1.5 6 0" />
        <path d="M5 13.5 6.5 8h11l1.5 5.5" />
        <path d="M12 8V3.5M9.5 5h5" />
      </svg>
    </span>
  )
}

const DAY = 24 * 3600_000

function bucket(c: Conversation, now: number) {
  if (c.pinned) return 'Pinned'
  const age = now - c.updatedAt
  if (age < DAY) return 'Today'
  if (age < 2 * DAY) return 'Yesterday'
  if (age < 7 * DAY) return 'Previous 7 days'
  return 'Older'
}

const ORDER = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older']

function Row({
  c,
  active,
  running,
  onSelect,
}: {
  c: Conversation
  active: boolean
  running: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-menu-row
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative z-10 flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] transition-colors duration-150',
        active ? 'bg-hover-2 font-medium text-ink' : 'text-ink-2 hover:text-ink',
      )}
    >
      {running && (
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inset-0 rounded-full bg-accent" style={{ animation: 'pulse-dot 1.2s ease-in-out infinite' }} />
        </span>
      )}
      <span className="truncate">{c.title}</span>
    </button>
  )
}

export function Sidebar({
  conversations,
  activeId,
  running,
  onSelect,
  onNew,
  onCollapse,
  searchRef,
  account,
  footer,
  loading,
  onArtifacts,
  artifactsActive,
}: {
  account: React.ReactNode
  footer?: React.ReactNode
  loading?: boolean
  conversations: Conversation[]
  activeId: string | null
  running: Set<string>
  onSelect: (id: string) => void
  onNew: () => void
  onCollapse: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
  onArtifacts?: () => void
  artifactsActive?: boolean
}) {
  const [query, setQuery] = useState('')
  const [now] = useState(() => Date.now())
  const q = query.trim().toLowerCase()
  const filtered = conversations
    .filter((c) => !q || c.title.toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const groups = ORDER.map((label) => ({ label, items: filtered.filter((c) => bucket(c, now) === label) })).filter(
    (g) => g.items.length,
  )

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-13 shrink-0 items-center gap-2.5 px-3.5">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Berthwise</span>
        <Tooltip label="Close sidebar" side="bottom" align="end" className="ml-auto">
          <Button variant="ghost" size="icon-sm" aria-label="Close sidebar" onClick={onCollapse}>
            <PanelLeft strokeWidth={1.8} />
          </Button>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-2 px-2.5 pt-1 pb-2">
        <Button
          variant="secondary"
          size="md"
          className="h-9 w-full justify-start"
          leading={<SquarePen strokeWidth={1.9} />}
          onClick={onNew}
        >
          New chat
          <span className="ml-auto">
            <span className="text-[11px] font-normal text-ink-3">Ctrl ⇧ O</span>
          </span>
        </Button>
        {onArtifacts && <Button variant="ghost" size="md" className={`h-9 w-full justify-start ${artifactsActive ? 'bg-hover-2 text-ink' : ''}`} leading={<Files strokeWidth={1.9} />} onClick={onArtifacts} aria-current={artifactsActive ? 'page' : undefined}>Artifacts</Button>}
        <label className="flex h-8 items-center gap-2 rounded-[9px] px-2.5 text-ink-3 transition-[background-color,box-shadow] duration-150 hover:bg-hover-2/60 focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1px_var(--line-strong)]">
          <Search className="size-3.5 shrink-0" strokeWidth={2} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
          {query ? (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="text-ink-3 hover:text-ink">
              <X className="size-3.5" strokeWidth={2} />
            </button>
          ) : (
            <span className="text-[11px]">Ctrl K</span>
          )}
        </label>
      </div>

      <div className="scroll-quiet fade-bottom min-h-0 flex-1 overflow-y-auto px-2.5 pb-6">
        {groups.length === 0 && (
          <div className="px-2 py-8 text-center text-[12.5px] text-ink-3" style={{ animation: 'fade-in 200ms both' }}>
            {loading ? 'Loading chats…' : query ? `No chats match “${query}”` : 'Your conversations will appear here.'}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mt-3 first:mt-1">
            <div className="flex h-7 items-center px-2 text-[11.5px] font-medium text-ink-3">{g.label}</div>
            <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[8px] bg-hover-2/70">
              {g.items.map((c) => (
                <Row
                  key={c.id}
                  c={c}
                  active={c.id === activeId}
                  running={running.has(c.id)}
                  onSelect={() => onSelect(c.id)}
                />
              ))}
            </GlideMenu>
          </div>
        ))}
        {footer}
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-line px-2.5 pt-2 pb-2.5">
        {account}
      </div>
    </div>
  )
}
