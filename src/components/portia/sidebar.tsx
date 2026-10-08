'use client'

import { useEffect, useRef, useState } from 'react'
import { Ellipsis, PanelLeft, Pencil, Pin, PinOff, Search, SquarePen, Trash2, X } from 'lucide-react'
import type { Conversation } from '@/lib/portia/types'
import { cn } from '@/lib/portia/cn'
import { AccountMenu } from './account-menu'
import { Button, Tooltip } from '@/components/ui/button'
import { GlideMenu, MenuItem, Popover, useDismiss } from '@/components/ui/popover'

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
  onRename,
  onPin,
  onDelete,
}: {
  c: Conversation
  active: boolean
  running: boolean
  onSelect: () => void
  onRename: (t: string) => void
  onPin: () => void
  onDelete: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useDismiss(menu, () => setMenu(false), [wrap])

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  return (
    <div
      ref={wrap}
      data-menu-row
      className="relative z-10 grid transition-[grid-template-rows,opacity] duration-250"
      style={{
        gridTemplateRows: leaving ? '0fr' : '1fr',
        opacity: leaving ? 0 : 1,
        transitionTimingFunction: 'cubic-bezier(0.23,1,0.32,1)',
      }}
    >
      <div className={cn('group/row relative min-h-0', !menu && 'overflow-hidden')}>
        {editing ? (
          <input
            ref={input}
            defaultValue={c.title}
            aria-label="Conversation title"
            onBlur={(e) => {
              onRename(e.currentTarget.value)
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="h-8 w-full rounded-[8px] bg-surface px-2 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--line-strong),0_0_0_3px_color-mix(in_oklch,var(--accent)_14%,transparent)] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onSelect}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-8 w-full items-center gap-2 rounded-[8px] pr-8 pl-2 text-left text-[13px] transition-colors duration-150',
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
        )}
        {!editing && (
          <button
            type="button"
            aria-label="Conversation options"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            className={cn(
              'absolute top-1 right-1 flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-line-strong/60 hover:text-ink',
              menu || active ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
            )}
          >
            <Ellipsis className="size-4" strokeWidth={2} />
          </button>
        )}
        <Popover open={menu} origin="top-right" className="top-8 right-0 w-44">
          <GlideMenu>
            <MenuItem
              icon={<Pencil strokeWidth={1.9} />}
              onSelect={() => {
                setMenu(false)
                setEditing(true)
              }}
            >
              Rename
            </MenuItem>
            <MenuItem
              icon={c.pinned ? <PinOff strokeWidth={1.9} /> : <Pin strokeWidth={1.9} />}
              onSelect={() => {
                setMenu(false)
                onPin()
              }}
            >
              {c.pinned ? 'Unpin' : 'Pin'}
            </MenuItem>
            <div className="mx-2 my-1 h-px bg-line" />
            <MenuItem
              danger
              icon={<Trash2 strokeWidth={1.9} />}
              onSelect={() => {
                setMenu(false)
                setLeaving(true)
                setTimeout(onDelete, 260)
              }}
            >
              Delete
            </MenuItem>
          </GlideMenu>
        </Popover>
      </div>
    </div>
  )
}

export function Sidebar({
  conversations,
  activeId,
  running,
  onSelect,
  onNew,
  onRename,
  onPin,
  onDelete,
  onCollapse,
  searchRef,
}: {
  conversations: Conversation[]
  activeId: string | null
  running: Set<string>
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, t: string) => void
  onPin: (id: string) => void
  onDelete: (id: string) => void
  onCollapse: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
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
    <div className="flex h-full w-[268px] flex-col">
      <div className="flex h-13 shrink-0 items-center gap-2.5 px-3.5">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Plisto</span>
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
            No chats match “{query}”
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
                  onRename={(t) => onRename(c.id, t)}
                  onPin={() => onPin(c.id)}
                  onDelete={() => onDelete(c.id)}
                />
              ))}
            </GlideMenu>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-line px-2.5 pt-2 pb-2.5">
        <AccountMenu />
      </div>
    </div>
  )
}
