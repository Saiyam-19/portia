'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import ModelSelector from './model-selector'
import type { ChatModel } from '@/lib/chat-model'
import { matchPorts } from '@/lib/berthwise/port-list'

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  model: ChatModel
  onModelChange: (model: ChatModel) => void
  loading?: boolean
  onStop?: () => void
  placeholder?: string
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

export default function Composer({ value, onChange, onSend, model, onModelChange, loading = false, onStop, placeholder = 'Ask about a port, ship or charge… Type @ to pick a port.', textareaRef }: Props) {
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const ref = textareaRef ?? ownRef
  const listId = useId()
  // "@" followed by a few letters offers the ports Berthwise covers.
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const options = mention ? matchPorts(mention.query) : []
  const open = Boolean(mention && options.length)
  useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 200)}px`
  }, [value, ref])
  const track = (field: HTMLTextAreaElement) => {
    const caret = field.selectionStart ?? field.value.length
    const found = field.value.slice(0, caret).match(/(?:^|\s)@([A-Za-z][A-Za-z .-]{0,24})?$/)
    setMention(found ? { start: caret - (found[1]?.length ?? 0) - 1, end: caret, query: found[1] ?? '' } : null)
    setActive(0)
  }
  const choose = (index: number) => {
    const port = options[index]
    if (!mention || !port) return
    const next = value.slice(0, mention.start) + port.insert + ' ' + value.slice(mention.end)
    const caret = mention.start + port.insert.length + 1
    onChange(next)
    setMention(null)
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(caret, caret) })
  }
  return (
    <form onSubmit={event => { event.preventDefault(); if (!loading && value.trim()) onSend() }} aria-label="Message composer" className="relative">
      {open && (
        <ul id={listId} role="listbox" aria-label="Ports" className="absolute bottom-full left-0 z-20 mb-2 w-64 max-w-full overflow-hidden rounded-xl border border-border bg-popover p-1 text-sm shadow-md">
          {options.map((port, index) => (
            <li key={port.id} id={`${listId}-${port.id}`} role="option" aria-selected={index === active}
              className={`cursor-pointer rounded-lg px-3 py-1.5 ${index === active ? 'bg-accent text-accent-foreground' : 'text-popover-foreground'}`}
              onMouseDown={event => { event.preventDefault(); choose(index) }} onMouseEnter={() => setActive(index)}>
              {port.label}
            </li>
          ))}
        </ul>
      )}
      <InputGroup className="rounded-2xl bg-card p-1.5 has-disabled:bg-card has-disabled:opacity-100 dark:bg-card dark:has-disabled:bg-card">
        <InputGroupTextarea ref={ref} aria-label="Message" maxLength={4000} value={value}
          onChange={event => { onChange(event.target.value); track(event.target) }}
          onSelect={event => track(event.currentTarget)} onBlur={() => setMention(null)}
          role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${options[active]!.id}` : undefined}
          onKeyDown={event => {
            if (open) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length); return }
              if ((event.key === 'Enter' || event.key === 'Tab') && !event.nativeEvent.isComposing) { event.preventDefault(); choose(active); return }
              if (event.key === 'Escape') { event.preventDefault(); setMention(null); return }
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault()
              if (!loading && value.trim()) onSend()
            }
          }}
          placeholder={placeholder} rows={2} readOnly={loading} className="min-h-20 max-h-50 px-3.5 py-3 text-base leading-relaxed md:text-sm" />
        <InputGroupAddon align="block-end" className="justify-between px-2 pb-1.5">
          <ModelSelector value={model} onChange={onModelChange} disabled={loading} />
          {loading && onStop ? (
            <InputGroupButton size="icon-sm" variant="default" className="size-9 rounded-full" onClick={onStop} aria-label="Stop response"><Square className="size-3.5 fill-current" aria-hidden="true" /></InputGroupButton>
          ) : (
            <InputGroupButton type="submit" size="icon-sm" variant="default" className="size-9 rounded-full" disabled={!value.trim() || loading} aria-label={loading ? 'Starting conversation' : 'Send message'}><ArrowUp className="size-4" aria-hidden="true" /></InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
