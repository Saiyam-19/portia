'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Anchor, UserRound } from 'lucide-react'
import ToolNotification from './tool-notification'
import FormCard from './form-card'
import type { Segment } from './chat-view'

interface Props {
  role: 'user' | 'assistant'
  segments: Segment[]
  streaming?: boolean
  onFormSubmit?: (toolCallId: string, data: Record<string, string>, note: string) => void
  onFormCancel?: (toolCallId: string, note: string) => void
}

export default function Message({ role, segments, streaming, onFormSubmit, onFormCancel }: Props) {
  if (role === 'user') {
    const content = segments.map(s => s.kind === 'text' ? s.content : '').join('')
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-xl bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
        <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center shrink-0 mt-0.5">
          <UserRound className="w-4 h-4 text-white" />
        </div>
      </div>
    )
  }

  const hasRunningTool = segments.some(s => s.kind === 'tool' && s.status === 'running')

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
        <Anchor className="w-4 h-4 text-white" strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0 text-sm text-slate-800 leading-relaxed">
        {segments.map((seg, i) => {
          if (seg.kind === 'text') {
            const isLast = i === segments.length - 1
            return (
              <div key={i}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre({ children }) {
                      return (
                        <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-xs font-mono my-3">
                          {children}
                        </pre>
                      )
                    },
                    code({ className, children, ...props }) {
                      if (className) return <code className={className} {...props}>{children}</code>
                      return (
                        <code className="bg-slate-100 text-slate-800 rounded px-1.5 py-0.5 text-xs font-mono" {...props}>
                          {children}
                        </code>
                      )
                    },
                    table({ children }) {
                      return (
                        <div className="overflow-x-auto my-3">
                          <table className="min-w-full text-sm border-collapse">{children}</table>
                        </div>
                      )
                    },
                    th({ children }) {
                      return <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700 text-xs uppercase tracking-wide">{children}</th>
                    },
                    td({ children }) {
                      return <td className="border border-slate-200 px-3 py-2 text-slate-700">{children}</td>
                    },
                    h1({ children }) { return <h1 className="text-lg font-bold text-slate-900 mt-4 mb-2">{children}</h1> },
                    h2({ children }) { return <h2 className="text-base font-bold text-slate-900 mt-4 mb-2">{children}</h2> },
                    h3({ children }) { return <h3 className="text-sm font-semibold text-slate-900 mt-3 mb-1">{children}</h3> },
                    p({ children }) { return <p className="mb-2 last:mb-0">{children}</p> },
                    ul({ children }) { return <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul> },
                    ol({ children }) { return <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol> },
                    li({ children }) { return <li className="text-slate-700">{children}</li> },
                    blockquote({ children }) {
                      return (
                        <blockquote className="border-l-4 border-blue-200 pl-4 my-2 text-slate-600 italic">
                          {children}
                        </blockquote>
                      )
                    },
                    a({ href, children }) {
                      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>
                    },
                  }}
                >
                  {seg.content}
                </ReactMarkdown>
                {streaming && isLast && !hasRunningTool && (
                  <span className="inline-flex gap-[3px] align-middle ml-1">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full bg-slate-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            )
          }

          if (seg.kind === 'tool') {
            return (
              <div key={i} className="my-1.5">
                <ToolNotification tool={seg.tool} label={seg.label} status={seg.status} />
              </div>
            )
          }

          if (seg.kind === 'card') {
            return (
              <div key={i} className="my-3">
                <FormCard
                  formCard={seg.formCard}
                  onSubmit={(data, note) => onFormSubmit?.(seg.formCard.toolCallId, data, note)}
                  onCancel={note => onFormCancel?.(seg.formCard.toolCallId, note)}
                />
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
