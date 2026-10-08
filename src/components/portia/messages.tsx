'use client'

import { useState } from 'react'
import { CircleAlert, CornerDownRight, Pencil, RotateCcw, Square, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { AssistantMessage, FormResponse, Segment } from '@/lib/portia/types'
import { cn } from '@/lib/portia/cn'
import { Button, CopyButton, Tooltip } from '@/components/ui/button'
import { Collapse, PixelLoader, Shimmer, formatDuration } from '@/components/ui/motion'
import { useToast } from '@/components/ui/toast'
import { ThinkingTrace } from './thinking'
import { ToolRun } from './tool-run'
import { FormCard } from './form-card'
import { EstimateCard } from './estimate-card'
import { Markdown } from './markdown'

const EASE = 'cubic-bezier(0.23,1,0.32,1)'
const MODEL_LABEL = { 'model-1': 'Model 1', 'model-2': 'Model 2' } as const

type Tool = Extract<Segment, { kind: 'tool' }>
type Block = { kind: 'tools'; id: string; tools: Tool[] } | Segment

/* consecutive tool calls render as one collapsible run */
function group(segments: Segment[]): Block[] {
  const out: Block[] = []
  for (const s of segments) {
    const prev = out[out.length - 1]
    if (s.kind === 'tool' && prev?.kind === 'tools') prev.tools.push(s)
    else if (s.kind === 'tool') out.push({ kind: 'tools', id: s.id, tools: [s] })
    else out.push(s)
  }
  return out
}

function plainText(m: AssistantMessage) {
  return m.segments
    .filter((s): s is Extract<Segment, { kind: 'text' }> => s.kind === 'text')
    .map((s) => s.content)
    .join('\n\n')
}

const TONE = { blue: 'bg-accent', green: 'bg-green', orange: 'bg-orange' } as const

function SourcesToggle({
  sources,
  open,
  onToggle,
}: {
  sources: NonNullable<AssistantMessage['sources']>
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="ml-1 flex h-7 items-center gap-1.5 rounded-control px-1.5 transition-colors duration-150 hover:bg-hover-2"
    >
      <span className="flex -space-x-1">
        {sources.map((s) => (
          <span
            key={s.domain}
            className={cn('flex size-3.5 items-center justify-center rounded-full text-white shadow-[0_0_0_1.5px_var(--page)]', TONE[s.tone])}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            </svg>
          </span>
        ))}
      </span>
      <span className="text-[12px] text-ink-2">
        {sources.length} source{sources.length === 1 ? '' : 's'}
      </span>
    </button>
  )
}

function SourcesList({ sources, open }: { sources: NonNullable<AssistantMessage['sources']>; open: boolean }) {
  return (
    <Collapse open={open}>
      <div className="mt-1.5 flex max-w-md flex-col rounded-[10px] bg-inset p-1 shadow-hairline">
        {sources.map((s) => (
          <a
            key={s.domain}
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            <span className={cn('size-2 rounded-full', TONE[s.tone])} />
            <span className="animated-underline">{s.title}</span>
            <span className="ml-auto font-mono text-[10.5px] text-ink-3">{s.domain}</span>
          </a>
        ))}
      </div>
    </Collapse>
  )
}

function Feedback({ value, onChange }: { value: AssistantMessage['feedback']; onChange: (v: 'up' | 'down' | null) => void }) {
  const toast = useToast()
  return (
    <>
      {(['up', 'down'] as const).map((dir) => {
        const Icon = dir === 'up' ? ThumbsUp : ThumbsDown
        const on = value === dir
        return (
          <Tooltip key={dir} label={dir === 'up' ? 'Good response' : 'Bad response'}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={on}
              aria-label={dir === 'up' ? 'Good response' : 'Bad response'}
              className={cn(on && 'text-ink')}
              onClick={() => {
                onChange(on ? null : dir)
                if (!on) toast('Thanks for the feedback')
              }}
            >
              <Icon
                key={on ? 'on' : 'off'}
                strokeWidth={1.8}
                fill={on ? 'currentColor' : 'none'}
                fillOpacity={on ? 0.18 : 0}
                style={on ? { animation: 'like-pop 380ms cubic-bezier(0.34,1.56,0.64,1)' } : undefined}
              />
            </Button>
          </Tooltip>
        )
      })}
    </>
  )
}

export function AssistantTurn({
  message,
  isLast,
  onSubmitForm,
  onRegenerate,
  onFeedback,
  onFollowUp,
}: {
  message: AssistantMessage
  isLast: boolean
  onSubmitForm: (segmentId: string, r: FormResponse) => void
  onRegenerate: () => void
  onFeedback: (v: 'up' | 'down' | null) => void
  onFollowUp: (text: string) => void
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const live = message.status === 'streaming' || message.status === 'waiting'
  const settled = message.status === 'done'
  const blocks = group(message.segments)
  const lastText = [...message.segments].reverse().find((s) => s.kind === 'text')
  const lastBlock = blocks[blocks.length - 1]
  const streamingTextId = live && lastBlock?.kind === 'text' ? lastBlock.id : null

  return (
    <div className="group/turn flex flex-col gap-3" style={{ animation: `fade-in 240ms ease-out both` }}>
      {blocks.length === 0 && live && (
        <div role="status" className="flex h-7 items-center gap-2.5">
          <PixelLoader />
          <Shimmer className="text-[13px] font-medium">Connecting to {MODEL_LABEL[message.model]}</Shimmer>
        </div>
      )}

      {blocks.map((b) => {
        switch (b.kind) {
          case 'thinking':
            return <ThinkingTrace key={b.id} segment={b} />
          case 'tools':
            return <ToolRun key={b.id} tools={b.tools} settled={settled} />
          case 'text':
            return <Markdown key={b.id} content={b.content} streaming={b.id === streamingTextId} />
          case 'form':
            return (
              <FormCard
                key={b.id}
                form={b}
                live={message.status === 'waiting'}
                onSubmit={(r) => onSubmitForm(b.id, r)}
              />
            )
          case 'estimate':
            return <EstimateCard key={b.id} estimate={b.estimate} />
          case 'error':
            return (
              <div
                key={b.id}
                className="t-shake flex items-start gap-3 rounded-card bg-red-tint px-3.5 py-3 text-[13px] text-ink shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--red)_22%,transparent)]"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-red" strokeWidth={2} />
                <div className="flex-1">
                  <div className="font-medium">Tool call failed</div>
                  <div className="mt-0.5 text-ink-2">{b.message}</div>
                </div>
                <Button variant="secondary" size="sm" leading={<RotateCcw strokeWidth={2} />} onClick={onRegenerate}>
                  Retry
                </Button>
              </div>
            )
          default:
            return null
        }
      })}

      {/* actions settle in once the turn finishes */}
      {!live && (
        <div style={{ animation: `fade-in 400ms ease-out both` }}>
          <div className="-ml-1.5 flex flex-wrap items-center gap-0.5">
            {message.status === 'stopped' && (
              <span className="mr-1.5 ml-1.5 inline-flex items-center gap-1.5 rounded-full bg-hover-2 px-2 py-0.5 text-[11.5px] font-medium text-ink-2">
                <Square className="size-2.5" fill="currentColor" strokeWidth={0} />
                Stopped
              </span>
            )}
            {lastText && <CopyButton text={plainText(message)} label="Copy" />}
            <Tooltip label="Regenerate">
              <Button variant="ghost" size="icon-sm" aria-label="Regenerate" onClick={onRegenerate}>
                <RotateCcw strokeWidth={1.8} />
              </Button>
            </Tooltip>
            {settled && <Feedback value={message.feedback} onChange={onFeedback} />}
            {message.sources && (
              <SourcesToggle sources={message.sources} open={sourcesOpen} onToggle={() => setSourcesOpen(!sourcesOpen)} />
            )}
            <span
              className={cn(
                'ml-2 text-[11.5px] text-ink-3 transition-opacity duration-200',
                isLast ? 'opacity-100' : 'opacity-0 group-hover/turn:opacity-100',
              )}
            >
              {MODEL_LABEL[message.model]}
              {message.finishedAt && ` · ${formatDuration(message.finishedAt - message.createdAt)}`}
            </span>
          </div>
          {message.sources && <SourcesList sources={message.sources} open={sourcesOpen} />}
        </div>
      )}

      {isLast && settled && message.followUps && (
        <div className="mt-1 flex flex-col">
          {message.followUps.map((text, i) => (
            <button
              key={text}
              type="button"
              onClick={() => onFollowUp(text)}
              className="group/fu -mx-2 flex items-center gap-2.5 rounded-[9px] border-b border-line px-2 py-2 text-left text-[13.5px] text-ink-2 transition-colors duration-100 last:border-b-0 hover:bg-hover-2 hover:text-ink"
              style={{ animation: `fade-up 350ms ${EASE} ${150 + i * 80}ms both` }}
            >
              <CornerDownRight className="size-3.5 shrink-0 text-ink-3 transition-transform duration-200 group-hover/fu:translate-x-0.5" strokeWidth={2} />
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function UserTurn({ content, onEdit }: { content: string; onEdit: () => void }) {
  return (
    <div className="group/user flex flex-col items-end gap-1" style={{ animation: `fade-up 320ms ${EASE} both` }}>
      <div className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-field px-4 py-2.5 text-[14.5px] leading-[1.6] whitespace-pre-wrap text-ink shadow-[inset_0_0_0_1px_var(--line)]">
        {content}
      </div>
      <div className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover/user:opacity-100 focus-within:opacity-100">
        <CopyButton text={content} size="icon-xs" />
        <Tooltip label="Edit">
          <Button variant="ghost" size="icon-xs" aria-label="Edit message" onClick={onEdit}>
            <Pencil strokeWidth={1.8} />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}

