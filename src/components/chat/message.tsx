'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Anchor, Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  if (role === 'user') {
    return (
      <article aria-label="Your message" className="flex justify-end">
        <div className="max-w-[90%] rounded-2xl bg-muted px-4 py-3 text-sm leading-7 break-words whitespace-pre-wrap sm:max-w-[85%]">{content}</div>
      </article>
    )
  }
  const hasRunningTool = segments.some(segment => segment.kind === 'tool' && segment.status === 'running')
  const copy = async () => {
    try { await navigator.clipboard.writeText(content); setCopyState('copied') }
    catch { setCopyState('error') }
  }
  return (
    <article aria-label="Plisto response" className="group/message min-w-0">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Anchor className="size-4 text-brand" aria-hidden="true" />Plisto</div>
      <div className="space-y-4 text-sm leading-7">
        {segments.map((segment, index) => {
          if (segment.kind === 'text') return (
            <div key={index} className="chat-markdown prose prose-sm prose-neutral max-w-none text-foreground dark:prose-invert prose-headings:font-semibold prose-headings:tracking-normal prose-p:leading-7 prose-a:text-brand prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                pre: ({ children }) => <pre className="overflow-x-auto rounded-xl bg-muted p-4 text-xs text-foreground">{children}</pre>,
                table: ({ children }) => <div className="not-prose my-5 overflow-hidden rounded-xl border border-border"><Table aria-label="Response table">{children}</Table></div>,
                thead: ({ children }) => <TableHeader className="bg-muted">{children}</TableHeader>,
                tbody: ({ children }) => <TableBody>{children}</TableBody>,
                tr: ({ children }) => <TableRow>{children}</TableRow>,
                th: ({ children }) => <TableHead className="px-4 text-xs" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{children}</TableHead>,
                td: ({ children }) => <TableCell className="px-4 py-2.5" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{children}</TableCell>,
                a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
              }}>{segment.content}</ReactMarkdown>
            </div>
          )
          if (segment.kind === 'tool') return <ToolNotification key={segment.id} tool={segment.tool} label={segment.label} status={segment.status} />
          if (segment.kind === 'card') return <FormCard key={segment.formCard.toolCallId} formCard={segment.formCard} disabled={formDisabled} onSubmit={(data, note) => onFormSubmit?.(segment.formCard.toolCallId, data, note)} onCancel={note => onFormCancel?.(segment.formCard.toolCallId, note)} />
          return null
        })}
        {streaming && !hasRunningTool && <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{content ? 'Writing response…' : 'Working on it…'}</div>}
      </div>
      {!streaming && content && (
        <div className="mt-2 flex h-8 items-center gap-2 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground sm:opacity-0 sm:group-hover/message:opacity-100 sm:focus-visible:opacity-100" onClick={() => void copy()} aria-label={copyState === 'copied' ? 'Response copied' : 'Copy response'}>
                {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copyState === 'copied' ? 'Copied' : 'Copy response'}</TooltipContent>
          </Tooltip>
          <span role="status">{copyState === 'error' ? 'Couldn’t copy. Select the text to copy it.' : copyState === 'copied' ? 'Copied' : ''}</span>
        </div>
      )}
    </article>
  )
}
