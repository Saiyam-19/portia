'use client'

import type { ToolCard } from '@/lib/berthwise/cards'

/** Cards are drawn from tool results only. Each card kind gets its own view. */
export default function ResultCard({ card }: { card: ToolCard }) {
  switch (card.kind) {
    default:
      return null
  }
}
