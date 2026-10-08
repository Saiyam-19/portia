import { PORTS } from './seed'

export type Token = { kind: 'text'; text: string } | { kind: 'mention'; text: string; name: string } | { kind: 'command'; text: string }

/* longest names first so "@Mumbai Port Authority" beats a shorter prefix */
const NAMES = [...PORTS.map((p) => p.name)].sort((a, b) => b.length - a.length)
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MENTION = new RegExp(`@(${NAMES.map(escape).join('|')})`, 'g')

/* Split text into plain runs, known @port mentions and a leading /command. */
export function tokenize(text: string): Token[] {
  const out: Token[] = []
  let rest = text
  const cmd = /^\/\w+/.exec(rest)
  if (cmd) {
    out.push({ kind: 'command', text: cmd[0] })
    rest = rest.slice(cmd[0].length)
  }
  let last = 0
  for (const m of rest.matchAll(MENTION)) {
    const i = m.index ?? 0
    if (i > last) out.push({ kind: 'text', text: rest.slice(last, i) })
    out.push({ kind: 'mention', text: m[0], name: m[1] })
    last = i + m[0].length
  }
  if (last < rest.length) out.push({ kind: 'text', text: rest.slice(last) })
  return out
}
