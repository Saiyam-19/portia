'use client'

import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

const components: Components = {
  p: ({ children }) => <p className="stream-block my-2.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="text-ink-2 italic">{children}</em>,
  ul: ({ children }) => <ul className="stream-block my-2.5 flex flex-col gap-1.5 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="stream-block my-2.5 flex flex-col gap-1.5 pl-1">{children}</ol>,
  li: ({ children }) => <li className="stream-block relative pl-5">{children}</li>,
  h3: ({ children }) => <h3 className="stream-block mt-5 mb-2 text-[14px] font-semibold text-ink">{children}</h3>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent-ink underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent">
      {children}
    </a>
  ),
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-card bg-field p-4 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0 [&_code]:shadow-none">{children}</pre>,
  code: ({ children }) => (
    <code className="rounded-[5px] bg-field px-1 py-0.5 font-mono text-[12px] text-ink shadow-hairline">{children}</code>
  ),
  table: ({ children }) => (
    <div className="stream-block my-3.5 overflow-x-auto rounded-card bg-surface shadow-card">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-inset">{children}</thead>,
  th: ({ children, style }) => (
    <th style={style} className="border-b border-line px-3.5 py-2 text-left text-[12px] font-medium text-ink-2 first:text-ink-3">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border-b border-line/70 px-3.5 py-2 tabular-nums text-ink first:text-ink-2 [tr:last-child_&]:border-b-0">
      {children}
    </td>
  ),
  tr: ({ children }) => <tr className="stream-block transition-colors duration-100 hover:bg-inset/60">{children}</tr>,
}

export const Markdown = memo(function Markdown({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className={cn('md text-[14.5px] leading-[1.7] text-ink [&>:first-child]:mt-0 [&>:last-child]:mb-0', streaming && 'md-streaming')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
})
