'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowUp } from 'lucide-react'
import ModelSelector from '@/components/chat/model-selector'
import type { ChatModel } from '@/lib/chat-model'

const SEED_QUESTIONS = [
  'Charges for my vessel with IMO 12345 at Mumbai',
  'Which ports are supported?',
  'Compare Mumbai & Jaigarh pilotage',
  'Konkan LNG berth charges',
]
export default function DashboardPage() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState<ChatModel>('model-1')
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = message.trim()
    if (!text || loading) return

    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!res.ok) { setLoading(false); return }

    const conv = await res.json()
    router.push(`/dashboard/chat/${conv.id}?q=${encodeURIComponent(text)}&model=${model}`)
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">
          Port Intelligence Assistant
        </h1>
        <p className="text-slate-500 text-center text-sm mb-10">
          Ask anything about port charges, regulations, or maritime operations.
        </p>

        <div className="mb-4">
          <p className="text-xs font-medium text-slate-400 text-center mb-3">
            Try asking
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SEED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setMessage(q)}
                disabled={loading}
                className="text-sm text-slate-600 border border-slate-200 rounded-full px-4 py-2 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <ModelSelector value={model} onChange={setModel} disabled={loading} />
        </div>
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
            placeholder="e.g. What are the typical port charges for MV Ocean Pioneer at Mumbai port?"
            rows={3}
            disabled={loading}
            className="w-full resize-none border border-slate-200 rounded-2xl px-5 py-4 pr-14 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm disabled:opacity-60 leading-relaxed"
          />
          <button
            type="submit"
            disabled={!message.trim() || loading}
            className="absolute bottom-3 right-3 w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-3">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
