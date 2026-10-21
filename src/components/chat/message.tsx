'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, Tooltip } from '@/components/berthwise/ui/button'
import { Markdown } from '@/components/berthwise/markdown'
import { Logo } from '@/components/berthwise/sidebar'
import { tokenize } from '@/lib/berthwise/mentions'
import ToolNotification from './tool-notification'
import FormCard from './form-card'
import type { Segment } from './chat-view'

interface Props {
  role: 'user' | 'assistant'
  segments: Segment[]
  streaming?: boolean
  formDisabled?: boolean
  onFormSubmit?: (toolCallId: string, data: Record<string, string>, note: string) => void
  onFormCancel?: (toolCallId: string, note: string) => void
}

export default function Message({ role, segments, streaming, formDisabled, onFormSubmit, onFormCancel }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const content = segments.map(segment => segment.kind === 'text' ? segment.content : '').join('\n')
  if (role === 'user') return <article aria-label="Your message" className="flex justify-end"><div className="max-w-[90%] rounded-[18px] bg-hover-2/70 px-4 py-2.5 text-[14.5px] leading-[1.7] break-words whitespace-pre-wrap text-ink sm:max-w-[85%]">{tokenize(content).map((token, index) => <span key={index} className={token.kind === 'mention' ? 'rounded-chip bg-accent-tint px-0.5 text-accent-ink' : undefined}>{token.text}</span>)}</div></article>
  const hasRunningTool = segments.some(segment => segment.kind === 'tool' && segment.status === 'running')
  const copy = async () => {
    try { await navigator.clipboard.writeText(content); setCopyState('copied') }
    catch { setCopyState('error') }
  }
  return <article aria-label="Berthwise response" className="group/message min-w-0">
    <div className="mb-3 flex items-center gap-2.5"><Logo className="size-6 rounded-[7px] [&_svg]:size-3.5" /><span className="text-[13px] font-semibold text-ink">Berthwise</span>{streaming && <span className="size-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />}</div>
    <div className="space-y-3">
      {segments.map((segment, index) => {
        if (segment.kind === 'text') return <Markdown key={index} content={segment.content} streaming={streaming && index === segments.length - 1} />
        if (segment.kind === 'tool') return <ToolNotification key={segment.id} tool={segment.tool} label={segment.label} status={segment.status} />
        return <FormCard key={segment.formCard.toolCallId} formCard={segment.formCard} disabled={formDisabled} onSubmit={(data, note) => onFormSubmit?.(segment.formCard.toolCallId, data, note)} onCancel={note => onFormCancel?.(segment.formCard.toolCallId, note)} />
      })}
      {streaming && !hasRunningTool && <div role="status" className="flex items-center gap-2 text-xs text-ink-3"><span className="size-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />{content ? 'Writing response…' : 'Working on it…'}</div>}
    </div>
    {!streaming && content && <div className="mt-2 flex h-8 items-center gap-2 text-xs text-ink-3"><Tooltip label={copyState === 'copied' ? 'Copied' : 'Copy response'}><Button variant="ghost" size="icon-sm" className="sm:opacity-0 sm:group-hover/message:opacity-100 sm:focus-visible:opacity-100" onClick={() => void copy()} aria-label={copyState === 'copied' ? 'Response copied' : 'Copy response'}>{copyState === 'copied' ? <Check /> : <Copy />}</Button></Tooltip><span role="status">{copyState === 'error' ? 'Couldn’t copy. Select the text to copy it.' : copyState === 'copied' ? 'Copied' : ''}</span></div>}
  </article>
}
