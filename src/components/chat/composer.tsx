'use client'

import { useEffect, type RefObject } from 'react'
import { Composer as VisualComposer } from '@/components/berthwise/composer'
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
  size?: 'hero' | 'dock'
}

export default function Composer({ loading = false, onStop, onSend, ...props }: Props) {
  useEffect(() => {
    if (!loading || !onStop) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.t-dropdown.is-open')) onStop()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [loading, onStop])
  return <div aria-label="Message composer"><VisualComposer {...props} busy={loading && !!onStop} disabled={loading && !onStop} onSend={onSend} onStop={onStop ?? (() => {})} /></div>
}
