'use client'

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import ModelSelector from './model-selector'
import type { ChatModel } from '@/lib/chat-model'

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

export default function Composer({ value, onChange, onSend, model, onModelChange, loading = false, onStop, placeholder = 'Ask about a port, vessel, or charge…', textareaRef }: Props) {
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const ref = textareaRef ?? ownRef
  useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 200)}px`
  }, [value, ref])
  return (
    <form onSubmit={event => { event.preventDefault(); if (!loading && value.trim()) onSend() }} aria-label="Message composer">
      <InputGroup className="rounded-2xl bg-card p-1.5 has-disabled:bg-card has-disabled:opacity-100 dark:bg-card dark:has-disabled:bg-card">
        <InputGroupTextarea ref={ref} aria-label="Message" maxLength={4000} value={value} onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
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
