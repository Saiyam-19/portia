'use client'

import type { ChatModel } from '@/lib/chat-model'

interface Props {
  value: ChatModel
  onChange: (model: ChatModel) => void
  disabled?: boolean
}

export default function ModelSelector({ disabled }: Props) {
  return <span aria-label="Model" aria-disabled={disabled} className="inline-flex h-9 items-center px-3 text-xs text-muted-foreground">GPT-6 Luna</span>
}
