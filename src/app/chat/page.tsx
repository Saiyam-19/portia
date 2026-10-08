import type { Metadata } from 'next'
import ChatApp from '@/components/portia/chat-app'

export const metadata: Metadata = {
  title: 'Plisto — Chat',
}

export default function ChatPage() {
  return <ChatApp />
}
