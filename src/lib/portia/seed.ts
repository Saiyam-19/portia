import type { Conversation } from './types'

const H = 3600_000
const D = 24 * H

/* A finished thread so history shows a settled state on first load. */
export function seedConversations(now: number): Conversation[] {
  return [
    {
      id: 'c_konkan',
      title: 'Konkan LNG berth charges',
      updatedAt: now - 2 * H,
      pinned: true,
      messages: [
        { id: 'm1', role: 'user', content: 'What are the berth charges at Konkan LNG for a 90,000 m³ carrier?', createdAt: now - 2 * H - 60_000 },
        {
          id: 'm2',
          role: 'assistant',
          model: 'model-2',
          status: 'done',
          createdAt: now - 2 * H - 55_000,
          finishedAt: now - 2 * H - 41_000,
          feedback: 'up',
          segments: [
            {
              kind: 'thinking',
              id: 's1',
              steps: [{ label: 'Identifying the terminal', detail: 'Konkan LNG · Dabhol' }, { label: 'Reading berth hire clauses' }],
              visible: 2,
              status: 'done',
              startedAt: now - 2 * H - 55_000,
              endedAt: now - 2 * H - 52_000,
            },
            {
              kind: 'tool',
              id: 's2',
              tool: 'consult_port_agent',
              label: 'Consulted Konkan LNG port agent',
              chip: 'konkan-lng-ltd/tarrifs.md',
              detail: ['Berth hire: US$0.021 per m³ of cargo capacity per day', 'Minimum charge: one day'],
              status: 'done',
              startedAt: now - 2 * H - 52_000,
              endedAt: now - 2 * H - 49_500,
            },
            {
              kind: 'tool',
              id: 's3',
              tool: 'calculate_charges',
              label: 'Calculated berth hire',
              chip: '90000 × 0.021',
              detail: ['= 1,890.00'],
              status: 'done',
              startedAt: now - 2 * H - 49_000,
              endedAt: now - 2 * H - 48_200,
            },
            {
              kind: 'text',
              id: 's4',
              content:
                'Berth hire at **Konkan LNG** is charged on cargo capacity, not GRT. For a **90,000 m³** carrier that works out to **US$1,890 per day**, with a one-day minimum.\n\n- A typical 30-hour discharge bills as **2 days → US$3,780**.\n- Harbour dues and pilotage are levied separately by Dabhol port.',
            },
          ],
          sources: [{ title: 'Konkan LNG tariff', domain: 'konkan-lng-ltd/tarrifs.md', tone: 'blue' }],
          followUps: ['Add Dabhol pilotage to this', 'How does this compare with JSW JNPT?'],
        },
      ],
    },
    { id: 'c_jnpa', title: 'JNPA container vessel dues', updatedAt: now - 5 * H, messages: [] },
    { id: 'c_compare', title: 'Mumbai vs Jaigarh pilotage', updatedAt: now - 1 * D - 3 * H, messages: [] },
    { id: 'c_redi', title: 'Redi port anchorage fees', updatedAt: now - 3 * D, messages: [] },
    { id: 'c_bpcl', title: 'BPCL liquid jetty — wharfage', updatedAt: now - 5 * D, messages: [] },
    { id: 'c_nsict', title: 'NSICT reefer plug-in charges', updatedAt: now - 12 * D, messages: [] },
  ]
}

export const PORTS = [
  { slug: 'mumbai', name: 'Mumbai Port Authority' },
  { slug: 'jawahar-nehru-port-authority-jnpa', name: 'JNPA' },
  { slug: 'mumbai-container-terminal', name: 'Mumbai Container Terminal' },
  { slug: 'mumbai-cruise-terminal', name: 'Mumbai Cruise Terminal' },
  { slug: 'nhava-sheva-international-container-terminal', name: 'NSICT' },
  { slug: 'nhava-sheva-gateway-terminal', name: 'Nhava Sheva Gateway Terminal' },
  { slug: 'nhava-sheva-freeport-terminal', name: 'Nhava Sheva Freeport Terminal' },
  { slug: 'gateway-terminals-india-pvt-ltd', name: 'Gateway Terminals India' },
  { slug: 'jsw-jnpt-liquid-terminal', name: 'JSW JNPT Liquid Terminal' },
  { slug: 'bpcl-cargo-jetty', name: 'BPCL Cargo Jetty' },
  { slug: 'bpcl-liquid-cargo-jetty', name: 'BPCL Liquid Cargo Jetty' },
  { slug: 'konkan-lng-ltd', name: 'Konkan LNG' },
  { slug: 'jaigarh', name: 'Jaigarh' },
  { slug: 'redi', name: 'Redi' },
  { slug: 'ranpar-finolex', name: 'Ranpar (Finolex)' },
  { slug: 'ictpl', name: 'ICTPL' },
]
