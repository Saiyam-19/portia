'use client'

import { useState } from 'react'
import { Check, ChevronDown, Copy, ListChecks } from 'lucide-react'
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
  interrupted?: boolean
  formDisabled?: boolean
  onFormSubmit?: (toolCallId: string, data: Record<string, string>, note: string) => void
  onFormCancel?: (toolCallId: string, note: string) => void
}

type ToolStep = Extract<Segment, { kind: 'tool' }>

function ToolHistory({ steps, interrupted }: { steps: ToolStep[]; interrupted?: boolean }) {
  const count = `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`
  return (
    <details className="group/activity max-w-xl rounded-xl border border-line bg-inset/40">
      <summary aria-label={`Response activity: ${count}${interrupted ? ', interrupted' : ''}`} className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs text-ink-2 transition-colors hover:bg-hover-2/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <ListChecks className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        <span className="font-medium">Activity</span>
        <span className="text-ink-3">{count}</span>
        {interrupted && <span className="ml-auto text-destructive">Interrupted · partial work</span>}
        <ChevronDown className={`size-3.5 shrink-0 text-ink-3 transition-transform duration-200 group-open/activity:rotate-180 motion-reduce:transition-none ${interrupted ? '' : 'ml-auto'}`} aria-hidden="true" />
      </summary>
      <ol aria-label="Tool call history" className="space-y-2 border-t border-line px-3 py-3">
        {steps.map((step, index) => <li key={step.id} className="flex items-start gap-2.5"><span className="w-3 shrink-0 pt-2 text-right text-[11px] text-ink-3 tabular-nums" aria-hidden="true">{index + 1}</span><ToolNotification tool={step.tool} label={step.label} status={step.status} /></li>)}
      </ol>
    </details>
  )
}

export default function Message({ role, segments, streaming, interrupted, formDisabled, onFormSubmit, onFormCancel }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const content = segments.filter(segment => segment.kind === 'text').map(segment => segment.content).join('\n')
  if (role === 'user') return <article aria-label="Your message" className="flex justify-end"><div className="max-w-[90%] rounded-[18px] bg-hover-2/70 px-4 py-2.5 text-[14.5px] leading-[1.7] break-words whitespace-pre-wrap text-ink sm:max-w-[85%]">{tokenize(content).map((token, index) => <span key={index} className={token.kind === 'mention' ? 'rounded-chip bg-accent-tint px-0.5 text-accent-ink' : undefined}>{token.text}</span>)}</div></article>
  const tools = segments.filter(segment => segment.kind === 'tool')
  const hasRunningTool = tools.some(segment => segment.status === 'running')
  const copy = async () => {
    try { await navigator.clipboard.writeText(content); setCopyState('copied') }
    catch { setCopyState('error') }
  }
  return <article aria-label="Berthwise response" className="group/message min-w-0">
    <div className="mb-3 flex items-center gap-2.5"><Logo className="size-6 rounded-[7px] [&_svg]:size-3.5" /><span className="text-[13px] font-semibold text-ink">Berthwise</span>{streaming && <span className="size-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />}{interrupted && !tools.length && <span className="text-xs text-destructive">Interrupted · partial work</span>}</div>
    <div className="space-y-3">
      {!streaming && tools.length > 0 && <ToolHistory steps={tools} interrupted={interrupted} />}
      {segments.map((segment, index) => {
        if (segment.kind === 'text') return <Markdown key={index} content={segment.content} streaming={streaming && index === segments.length - 1} />
        if (segment.kind === 'tool') return streaming ? <ToolNotification key={segment.id} tool={segment.tool} label={segment.label} status={segment.status} /> : null
        return <FormCard key={segment.formCard.toolCallId} formCard={segment.formCard} disabled={formDisabled} onSubmit={(data, note) => onFormSubmit?.(segment.formCard.toolCallId, data, note)} onCancel={note => onFormCancel?.(segment.formCard.toolCallId, note)} />
      })}
      {streaming && !hasRunningTool && <div role="status" className="flex items-center gap-2 text-xs text-ink-3"><span className="size-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />{content ? 'Writing response…' : 'Working on it…'}</div>}
    </div>
    {!streaming && content.trim() && <div className="mt-2 flex h-8 items-center gap-2 text-xs text-ink-3"><Tooltip label={copyState === 'copied' ? 'Copied' : 'Copy response'}><Button variant="ghost" size="icon-sm" className="sm:opacity-0 sm:group-hover/message:opacity-100 sm:focus-visible:opacity-100" onClick={() => void copy()} aria-label={copyState === 'copied' ? 'Response copied' : 'Copy response'}>{copyState === 'copied' ? <Check /> : <Copy />}</Button></Tooltip><span role="status">{copyState === 'error' ? 'Couldn’t copy. Select the text to copy it.' : copyState === 'copied' ? 'Copied' : ''}</span></div>}
  </article>
}
