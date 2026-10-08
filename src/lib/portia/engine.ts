import type {
  AssistantMessage,
  Estimate,
  FormField,
  FormResponse,
  Segment,
  Source,
  ThinkingStep,
} from './types'

/* ─────────────────────────────────────────────────────────
 * Mock agent engine
 * Scenarios are plain async scripts that drive the same
 * segment shapes the real SSE stream produces: thinking,
 * tool calls, streamed text, human-in-the-loop forms and
 * structured estimates. Every await honours the abort
 * signal, so Stop behaves exactly like a cancelled stream.
 * ───────────────────────────────────────────────────────── */

export type Patch = (updater: (message: AssistantMessage) => AssistantMessage) => void

class Aborted extends Error {
  constructor() {
    super('aborted')
    this.name = 'AbortError'
  }
}

const pendingForms = new Map<string, (response: FormResponse) => void>()

export function resolveForm(segmentId: string, response: FormResponse) {
  pendingForms.get(segmentId)?.(response)
  pendingForms.delete(segmentId)
}

let seq = 0
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`

function jitter(ms: number, spread = 0.35) {
  return ms * (1 - spread / 2 + Math.random() * spread)
}

function makeContext(patch: Patch, signal: AbortSignal) {
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new Aborted())
      const t = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(t)
        reject(new Aborted())
      }, { once: true })
    })

  const push = (segment: Segment) =>
    patch((m) => ({ ...m, segments: [...m.segments, segment] }))

  const update = <K extends Segment['kind']>(
    id: string,
    fn: (s: Extract<Segment, { kind: K }>) => Extract<Segment, { kind: K }>,
  ) =>
    patch((m) => ({
      ...m,
      segments: m.segments.map((s) => (s.id === id ? (fn(s as Extract<Segment, { kind: K }>) as Segment) : s)),
    }))

  return {
    signal,
    wait,

    async think(steps: ThinkingStep[], stepMs = 650) {
      const id = uid('think')
      push({ kind: 'thinking', id, steps, visible: 0, status: 'running', startedAt: Date.now() })
      for (let i = 1; i <= steps.length; i++) {
        await wait(jitter(stepMs))
        update<'thinking'>(id, (s) => ({ ...s, visible: i }))
      }
      await wait(jitter(stepMs * 0.8))
      update<'thinking'>(id, (s) => ({ ...s, status: 'done', endedAt: Date.now() }))
    },

    async tool(
      spec: Pick<Extract<Segment, { kind: 'tool' }>, 'tool' | 'label' | 'chip' | 'detail'>,
      ms = 1400,
      opts: { fail?: boolean } = {},
    ) {
      const id = uid('tool')
      push({ kind: 'tool', id, ...spec, status: 'running', startedAt: Date.now() })
      await wait(jitter(ms))
      update<'tool'>(id, (s) => ({ ...s, status: opts.fail ? 'error' : 'done', endedAt: Date.now() }))
    },

    async stream(text: string, msPerToken = 22) {
      const id = uid('text')
      push({ kind: 'text', id, content: '' })
      /* tokenise roughly like an LLM: words with their trailing whitespace */
      const tokens = text.match(/\S+\s*|\s+/g) ?? []
      let out = ''
      for (const token of tokens) {
        out += token
        const next = out
        update<'text'>(id, (s) => ({ ...s, content: next }))
        await wait(jitter(msPerToken, 0.9) + (/[.:\n]\s*$/.test(token) ? 60 : 0))
      }
    },

    async form(spec: { title: string; description?: string; fields: FormField[] }) {
      const id = uid('form')
      push({ kind: 'form', id, ...spec, response: null })
      patch((m) => ({ ...m, status: 'waiting' }))
      const response = await new Promise<FormResponse>((resolve, reject) => {
        pendingForms.set(id, resolve)
        signal.addEventListener('abort', () => {
          pendingForms.delete(id)
          reject(new Aborted())
        }, { once: true })
      })
      update<'form'>(id, (s) => ({ ...s, response }))
      patch((m) => ({ ...m, status: 'streaming' }))
      return response
    },

    estimate(estimate: Estimate) {
      push({ kind: 'estimate', id: uid('est'), estimate })
    },

    error(message: string) {
      push({ kind: 'error', id: uid('err'), message })
    },
  }
}

export type Ctx = ReturnType<typeof makeContext>

/* ── scenario data ─────────────────────────────────────── */

const VESSEL = {
  name: 'MV Ocean Pioneer',
  imo: '9321483',
  type: 'Container ship',
  grt: 32450,
  loa: 228,
}

const TARIFF_SOURCES: Source[] = [
  { title: 'Mumbai Port Authority SOR', domain: 'mumbai/tariffs.md', tone: 'blue' },
  { title: 'Pilotage & towage schedule', domain: 'mumbai/tariffs.md §4', tone: 'green' },
  { title: 'VesselAPI particulars', domain: 'vesselapi.com', tone: 'orange' },
]

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

function buildEstimate(stayHours: number, operation: string, berth: string): Estimate {
  const towMoves = 4
  const lines = [
    { label: 'Port dues', basis: `${VESSEL.grt.toLocaleString('en-IN')} GRT × ₹1.92`, amount: VESSEL.grt * 1.92 },
    { label: 'Pilotage (in + out)', basis: '2 movements × ₹48,650 slab', amount: 2 * 48650 },
    {
      label: 'Berth hire',
      basis: `${VESSEL.grt.toLocaleString('en-IN')} GRT × ₹0.0524 × ${stayHours} h`,
      amount: Math.round(VESSEL.grt * 0.0524 * stayHours * 100) / 100,
    },
    { label: 'Towage', basis: `${towMoves} tug-movements × ₹36,500`, amount: towMoves * 36500 },
    { label: 'Mooring & unmooring', basis: '2 operations × ₹8,750', amount: 2 * 8750 },
  ]
  return {
    port: 'Mumbai Port Authority',
    terminal: berth,
    vessel: VESSEL,
    currency: 'INR',
    lines,
    assumptions: [
      'Foreign-going vessel, single call',
      `${operation.toLowerCase()} at ${berth}`,
      'Two tugs per movement, day-time pilotage',
    ],
    sources: [
      { title: 'MbPA Scale of Rates', ref: '§2.1 Port dues' },
      { title: 'MbPA Scale of Rates', ref: '§4.3 Pilotage' },
      { title: 'MbPA Scale of Rates', ref: '§5 Berth hire' },
    ],
  }
}

/* ── scenarios ─────────────────────────────────────────── */

type Finish = { sources?: Source[]; followUps?: string[] }
type Scenario = (ctx: Ctx, prompt: string) => Promise<Finish | void>

const estimateScenario: Scenario = async (ctx) => {
  await ctx.think([
    { label: 'Parsing the request', detail: 'port charges · single call' },
    { label: 'Resolving vessel identity', detail: 'IMO 9321483' },
    { label: 'Routing to the Mumbai specialist' },
  ])

  await ctx.tool({
    tool: 'get_vessel',
    label: 'Looked up vessel',
    chip: 'IMO 9321483',
    detail: [
      'MV Ocean Pioneer · Container ship · Liberia',
      'GRT 32,450 · NRT 17,120 · DWT 41,800',
      'LOA 228 m · Beam 32.2 m · Built 2008',
    ],
  }, 1500)

  await ctx.stream(
    "Found **MV Ocean Pioneer** (IMO 9321483, 32,450 GRT). Mumbai prices berth hire by the hour and pilotage by slab, so I need a few voyage details before I can estimate the call.",
  )

  const res = await ctx.form({
    title: 'Voyage details',
    description: 'Mumbai Port Authority · MV Ocean Pioneer',
    fields: [
      {
        name: 'operation',
        label: 'What cargo operation is planned?',
        type: 'radio',
        options: ['Discharge only', 'Load only', 'Discharge + load'],
        required: true,
      },
      {
        name: 'berth',
        label: 'Which berth are you planning for?',
        type: 'radio',
        options: ['Indira Dock', 'Ballard Pier Extension', 'Jawahar Dweep'],
        required: true,
      },
      {
        name: 'stay',
        label: 'Expected stay at berth?',
        type: 'number',
        unit: 'hours',
        placeholder: '48',
        hint: 'Berth hire is billed per hour or part thereof.',
        required: true,
      },
    ],
  })

  if (res.cancelled) {
    await ctx.stream(
      "No problem — I've paused the estimate. Whenever you have the berth and stay details, send them over and I'll pick up from here.",
    )
    return { followUps: ['Estimate with typical defaults instead', 'Which Mumbai berths handle container ships?'] }
  }

  const stay = Number(res.values.stay) > 0 ? Number(res.values.stay) : 48
  const operation = res.values.operation || 'Discharge + load'
  const berth = res.values.berth || 'Indira Dock'

  await ctx.tool({
    tool: 'consult_port_agent',
    label: 'Consulted Mumbai port agent',
    chip: 'mumbai/tariffs.md',
    detail: [
      'Port dues: ₹1.92 per GRT per call (foreign-going)',
      'Pilotage: GRT slab 30,001–40,000 → ₹48,650 per movement',
      'Berth hire: ₹0.0524 per GRT per hour or part',
    ],
  }, 2200)

  await Promise.all([
    ctx.tool({ tool: 'calculate_charges', label: 'Calculated port dues', chip: '32450 × 1.92', detail: ['= 62,304.00'] }, 900),
    ctx.tool({
      tool: 'calculate_charges',
      label: 'Calculated berth hire',
      chip: `32450 × 0.0524 × ${stay}`,
      detail: [`= ${(32450 * 0.0524 * stay).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    }, 1200),
  ])

  const estimate = buildEstimate(stay, operation, berth)
  const total = estimate.lines.reduce((sum, l) => sum + l.amount, 0)

  await ctx.stream(
    `Here's the itemised estimate for a **${stay}-hour** call at **${berth}**. The total comes to about **${inr(total)}**, before GST.`,
  )
  await ctx.wait(250)
  ctx.estimate(estimate)
  await ctx.wait(500)
  await ctx.stream(
    [
      '**Worth checking before you commit:**',
      '',
      '- Berth hire is the most sensitive line — every extra 12 h adds roughly ' + inr(32450 * 0.0524 * 12) + '.',
      '- Night pilotage (22:00–06:00) carries a **25% surcharge** that isn\'t included here.',
      '- Rates come from the bundled Scale of Rates; confirm the current schedule with MbPA before invoicing.',
    ].join('\n'),
  )

  return {
    sources: TARIFF_SOURCES,
    followUps: [
      'Compare this call with Jaigarh',
      'What if the stay runs to 72 hours?',
      'Break down the pilotage slabs',
    ],
  }
}

const compareScenario: Scenario = async (ctx) => {
  await ctx.think([
    { label: 'Splitting the comparison by port' },
    { label: 'Normalising to a 30,000 GRT vessel' },
  ], 600)

  await Promise.all([
    ctx.tool({
      tool: 'consult_port_agent',
      label: 'Consulted Mumbai port agent',
      chip: 'mumbai/tariffs.md',
      detail: ['Pilotage slab 20,001–30,000 GRT → ₹41,200', 'Night surcharge 25%'],
    }, 2000),
    ctx.tool({
      tool: 'consult_port_agent',
      label: 'Consulted Jaigarh port agent',
      chip: 'jaigarh/jaigarh-tarrif.md',
      detail: ['Pilotage ₹1.18 per GRT per movement', 'Minimum ₹22,000 per movement'],
    }, 2600),
  ])

  await ctx.tool({
    tool: 'calculate_charges',
    label: 'Calculated Jaigarh pilotage',
    chip: 'max(30000 × 1.18, 22000)',
    detail: ['= 35,400.00'],
  }, 800)

  await ctx.stream(
    [
      'For a **30,000 GRT** vessel, one pilotage movement costs:',
      '',
      '| | Mumbai | Jaigarh |',
      '|---|---:|---:|',
      '| Basis | GRT slab | Per GRT |',
      '| Per movement | ₹41,200 | ₹35,400 |',
      '| In + out | ₹82,400 | ₹70,800 |',
      '| Night surcharge | 25% | 15% |',
      '',
      "Jaigarh is about **14% cheaper** on pilotage at this size, but its per-GRT basis means the gap narrows quickly above ~35,000 GRT, where Mumbai's slab caps out.",
    ].join('\n'),
  )

  return {
    sources: [
      { title: 'Mumbai Port Authority SOR', domain: 'mumbai/tariffs.md', tone: 'blue' },
      { title: 'Jaigarh Port tariff', domain: 'jaigarh/jaigarh-tarrif.md', tone: 'green' },
    ],
    followUps: ['Where does the crossover happen?', 'Add towage to the comparison'],
  }
}

const PORTS_MD = [
  'I have tariff schedules for **16 ports and terminals**, all on India\'s west coast:',
  '',
  '**Mumbai & JNPA cluster**',
  '- Mumbai Port Authority · Mumbai Container Terminal · Mumbai Cruise Terminal',
  '- Jawaharlal Nehru Port Authority (JNPA)',
  '- Nhava Sheva Freeport · Gateway · International Container Terminals',
  '- Gateway Terminals India · JSW JNPT Liquid Terminal',
  '',
  '**Liquid & specialised**',
  '- BPCL Cargo Jetty · BPCL Liquid Cargo Jetty',
  '- Konkan LNG',
  '',
  '**Konkan coast**',
  '- Jaigarh · Redi · Ranpar (Finolex) · ICTPL',
  '',
  'Schedules are static reference documents — some are historical — so treat results as estimates.',
].join('\n')

const portsScenario: Scenario = async (ctx) => {
  await ctx.think([{ label: 'Listing bundled tariff schedules' }], 500)
  await ctx.stream(PORTS_MD, 14)
  return { followUps: ['Which of these handle LNG?', 'Estimate charges at JNPA'] }
}

const failScenario: Scenario = async (ctx) => {
  await ctx.think([{ label: 'Resolving vessel identity', detail: 'IMO 9876543' }], 600)
  await ctx.tool({
    tool: 'search_vessels',
    label: 'Searching vessels',
    chip: 'IMO 9876543',
    detail: ['VesselAPI responded 504 Gateway Timeout after 30.0s'],
  }, 2400, { fail: true })
  ctx.error('VesselAPI timed out while looking up IMO 9876543. You can retry, or enter the vessel particulars manually.')
  throw new Error('tool failed')
}

const defaultScenario: Scenario = async (ctx, prompt) => {
  await ctx.think([
    { label: 'Reading the question' },
    { label: 'Checking which tariff documents apply' },
  ], 550)
  await ctx.stream(
    [
      `Good question. ${prompt.length > 80 ? 'There are a few parts to this.' : ''}`.trim(),
      '',
      'I work best with port-specific requests. I can:',
      '',
      '1. **Estimate charges** for a vessel call — port dues, pilotage, berth hire, towage.',
      '2. **Compare ports** line by line for the same vessel.',
      '3. **Explain a tariff rule**, quoting the clause it comes from.',
      '',
      'Try something like *"Charges for IMO 9321483 at Mumbai for 48 hours"* and I\'ll walk through it.',
    ].join('\n'),
  )
  return { followUps: ['Which ports are supported?', 'Charges for IMO 9321483 at Mumbai'] }
}

/* the failure demo fails once per prompt, so Retry shows recovery */
const failedOnce = new Set<string>()

function pickScenario(prompt: string): Scenario {
  const p = prompt.toLowerCase()
  if (/\b(fail|error|9876543)\b/.test(p)) {
    if (failedOnce.has(p)) return estimateScenario
    failedOnce.add(p)
    return failScenario
  }
  if (/compar|\bvs\b|versus/.test(p)) return compareScenario
  if (/which ports|supported|list.*ports|\/ports/.test(p)) return portsScenario
  if (/charge|estimate|cost|imo|dues|\/estimate/.test(p)) return estimateScenario
  return defaultScenario
}

/* ── runner ────────────────────────────────────────────── */

export async function runAgent(prompt: string, patch: Patch, signal: AbortSignal) {
  const ctx = makeContext(patch, signal)
  const scenario = pickScenario(prompt)
  try {
    const finish = (await scenario(ctx, prompt)) || {}
    patch((m) => ({ ...m, status: 'done', finishedAt: Date.now(), ...finish }))
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    patch((m) => ({
      ...m,
      status: aborted ? 'stopped' : 'error',
      finishedAt: Date.now(),
      /* freeze anything still in flight */
      segments: m.segments.map((s) =>
        (s.kind === 'thinking' || s.kind === 'tool') && s.status === 'running'
          ? { ...s, status: aborted ? 'done' : 'error', endedAt: Date.now() }
          : s,
      ),
    }))
  }
}

export { inr }
