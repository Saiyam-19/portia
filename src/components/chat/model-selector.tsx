'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type ChatModel, isChatModel } from '@/lib/chat-model'

interface Props {
  value: ChatModel
  onChange: (model: ChatModel) => void
  disabled?: boolean
}

export default function ModelSelector({ value, onChange, disabled }: Props) {
  return (
    <Select value={value} onValueChange={value => { if (isChatModel(value)) onChange(value) }} disabled={disabled}>
      <SelectTrigger aria-label="Model" className="h-9 rounded-full border-transparent bg-transparent text-xs text-muted-foreground hover:bg-muted dark:bg-transparent">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" side="top" align="start">
        <SelectItem value="model-1">Model 1</SelectItem>
        <SelectItem value="model-2">Model 2</SelectItem>
      </SelectContent>
    </Select>
  )
}
