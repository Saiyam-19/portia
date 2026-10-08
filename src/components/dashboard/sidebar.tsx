'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Anchor, PlusCircle, MessageSquare, LogOut } from 'lucide-react'

interface Conversation {
  id: string
  title: string
  updated_at: string
}

export default function Sidebar() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadConversations = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/conversations`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (res.ok) setConversations(await res.json())
    }
    loadConversations()
  }, [pathname])   // refetch on every navigation

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="w-60 shrink-0 flex flex-col h-full bg-slate-900 text-slate-100">
      {/* Logo + New chat */}
      <div className="p-4 space-y-3 border-b border-slate-700/60">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Anchor className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight">plisto</span>
        </Link>

        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors w-full"
        >
          <PlusCircle className="w-4 h-4" />
          New Chat
        </Link>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-px">
        {conversations.length === 0 ? (
          <p className="text-xs text-slate-500 text-center mt-6 px-3 leading-relaxed">
            No conversations yet.
            <br />Start one below.
          </p>
        ) : (
          conversations.map((conv) => {
            const active = pathname === `/dashboard/chat/${conv.id}`
            return (
              <Link
                key={conv.id}
                href={`/dashboard/chat/${conv.id}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                  active
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="truncate">{conv.title}</span>
              </Link>
            )
          })
        )}
      </div>

      {/* Sign out */}
      <div className="p-3 border-t border-slate-700/60">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
