'use client'

import { ChevronDown } from 'lucide-react'
import { type ChatModel, isChatModel } from '@/lib/chat-model'

interface Props {
  value: ChatModel
  onChange: (model: ChatModel) => void
  disabled?: boolean
}

export default function ModelSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="relative w-fit">
      <select
        aria-label="Model"
        value={value}
        onChange={e => { if (isChatModel(e.target.value)) onChange(e.target.value) }}
        disabled={disabled}
        className="min-h-11 appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="model-1">Model 1</option>
        <option value="model-2">Model 2</option>
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}
