'use client'

import { createContext, useContext, type ReactNode } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowRight, CircleAlert, CircleHelp, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ToolCard } from '@/lib/berthwise/cards'
import {
  CHARGE_GROUPS, type ComparisonCard, type ComparisonCell, type CompanyExcerptsCard, type CoverageCard, type DocumentExcerptsCard, type EstimateCall, type EstimateCard, type FleetCard, type ShipCard,
  type ShipView, type TariffCard, type TariffComparisonCard, type Total,
} from '@/lib/berthwise/card-types'
import type { TariffView } from '@/lib/berthwise/rulebook/describe'
import type { FleetShip } from '@/lib/berthwise/fleet'
import { shipTypeLabel, tradeLabel } from '@/lib/berthwise/ship-labels'

/** Puts a follow-up question in the message box for the user to finish and send. */
export const FollowUpContext = createContext<((text: string) => void) | undefined>(undefined)

/** Cards are drawn from tool results only. Each card kind gets its own view. */
export default function ResultCard({ card }: { card: ToolCard }) {
  switch (card.kind) {
    case 'estimate': return <EstimateView card={card as unknown as EstimateCard} />
    case 'comparison': return <ComparisonView card={card as unknown as ComparisonCard} />
    case 'tariff': return <TariffCardView card={card as unknown as TariffCard} />
    case 'tariff-comparison': return <TariffComparisonView card={card as unknown as TariffComparisonCard} />
    case 'coverage': return <CoverageView card={card as unknown as CoverageCard} />
    case 'document-excerpts': return <ExcerptsView card={card as unknown as DocumentExcerptsCard} />
    case 'ship': return <ShipView card={card as unknown as ShipCard} />
    case 'fleet': return <FleetView card={card as unknown as FleetCard} />
    case 'company-excerpts': return <CompanyExcerptsView card={card as unknown as CompanyExcerptsCard} />
    default: return null
  }
}

const day = (iso?: string) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''
const money = (total: Total) => `${total.currency} ${total.display}`
const shipLine = (ship: ShipView) => [
  ship.name,
  [ship.status === 'coastal' ? 'Coastal' : ship.status === 'foreign' ? 'Foreign-going' : '', ship.type?.replace('-', ' '), 'ship'].filter(Boolean).join(' '),
  ship.grt && `${Number(ship.grt).toLocaleString('en-US')} GRT`,
].filter(Boolean).join(' · ').replace(/^./, letter => letter.toUpperCase())
const schedule = (version: { effectiveFrom: string; effectiveTo?: string }, checkedOn: string) =>
  `Rates in force from ${day(version.effectiveFrom)}${version.effectiveTo ? ` to ${day(version.effectiveTo)}` : ''} · checked ${day(checkedOn)}`

function Frame({ label, title, meta, children }: { label: string; title: ReactNode; meta?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={label} className="not-prose overflow-hidden rounded-2xl border border-border bg-card text-sm">
      <header className="px-5 pt-4 pb-3">
        <h3 className="text-sm leading-5 font-medium text-foreground">{title}</h3>
        {meta && <div className="mt-1 text-xs leading-4 text-muted-foreground">{meta}</div>}
      </header>
      <div className="space-y-4 px-5 pb-5">{children}</div>
    </section>
  )
}

function SourceLink({ source }: { source: { title: string; url: string; page: string } }) {
  return (
    <a href={`${source.url}#page=${source.page}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline focus-visible:underline focus-visible:outline-none" aria-label={`Source: ${source.title}, page ${source.page} (opens in a new tab)`}>
      <FileText className="size-3" aria-hidden="true" />p. {source.page}
    </a>
  )
}

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group text-xs leading-5">
      <summary className="w-fit cursor-pointer rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{summary}</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </details>
  )
}

function Bullets({ items }: { items: string[] }) {
  return <ul className="list-disc space-y-1 pl-4 marker:text-muted-foreground">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
}

function Questions({ items, label = 'Needed to finish this estimate' }: { items: string[]; label?: string }) {
  if (!items.length) return null
  return (
    <div className="rounded-xl bg-muted px-4 py-3 text-xs leading-5">
      <p className="flex items-center gap-1.5 font-medium text-foreground"><CircleHelp className="size-3.5 text-brand" aria-hidden="true" />{label}</p>
      <ul className="mt-1.5 space-y-1 text-foreground">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </div>
  )
}

function FollowUps({ items }: { items: Array<{ label: string; text: string }> }) {
  const ask = useContext(FollowUpContext)
  if (!ask || !items.length) return null
  return (
    <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Follow-up questions">
      {items.map(item => (
        <Button key={item.label} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => ask(item.text)}>
          {item.label}<ArrowRight aria-hidden="true" />
        </Button>
      ))}
    </div>
  )
}

/* ---------- Estimate (one call or a voyage) ---------- */

function EstimateView({ card }: { card: EstimateCard }) {
  const voyage = card.calls.length > 1
  const names = card.calls.map(call => call.estimate.port.name)
  const incomplete = card.calls.some(call => call.estimate.questions.length)
  const first = card.calls[0]!.estimate
  return (
    <Frame
      label={voyage ? `Voyage estimate, ${names.join(' to ')}` : `Port call estimate, ${names[0]}`}
      title={voyage ? names.join(' → ') : <>{first.port.name}{first.terminal ? <span className="text-muted-foreground"> · {first.terminal}</span> : null}</>}
      meta={[shipLine(card.ship), card.fromFleet?.length ? 'ship details from your fleet' : ''].filter(Boolean).join(' · ') || undefined}
    >
      {card.calls.map((call, index) => <CallView key={index} call={call} voyage={voyage} />)}
      {voyage && card.voyageTotals && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border pt-3">
          <p className="font-medium">Voyage total before GST{incomplete && <span className="font-normal text-muted-foreground"> (incomplete)</span>}</p>
          <p className="text-right font-medium tabular-nums">{card.voyageTotals.length ? card.voyageTotals.map(money).join(' + ') : 'Nothing priced'}</p>
        </div>
      )}
      {card.inRupees && (
        <div className="text-xs leading-5 text-muted-foreground">
          <p>At your rate of INR {card.inRupees.usdToInr} per US dollar:</p>
          <ul className="mt-1 space-y-0.5 tabular-nums text-foreground">
            {card.inRupees.calls.map(item => <li key={item.port}>{item.port}: {item.total ? money(item.total) : 'already in rupees'}</li>)}
            {card.inRupees.voyage && <li className="font-medium">Voyage: {money(card.inRupees.voyage)}</li>}
          </ul>
        </div>
      )}
      <FollowUps items={[
        { label: 'Change an assumption', text: 'Recalculate this with ' },
        { label: voyage ? 'Compare the two ports' : 'Compare with another port', text: voyage ? `Compare the whole bill at ${names.join(' and ')} for this ship` : `Compare this call at ${names[0]} with ` },
        { label: `How ${shortName(names[0]!)} charges`, text: `Show how ${shortName(names[0]!)} charges a ship like this` },
      ]} />
    </Frame>
  )
}

const shortName = (name: string) => name.replace(/\s*\(.*\)$/, '').replace(/ Port Authority$| Port$/, '')

function CallView({ call, voyage }: { call: EstimateCall; voyage: boolean }) {
  const result = call.estimate
  const place = [result.terminal, result.berth].filter(Boolean).join(' · ')
  return (
    <div className={voyage ? 'space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0' : 'space-y-3'}>
      {voyage && (
        <div>
          <h4 className="text-sm leading-5 font-medium">{call.role === 'arrival' ? 'Arrival' : 'Departure'} · {result.port.name}{place && <span className="text-muted-foreground"> · {place}</span>}</h4>
        </div>
      )}
      {result.version.effectiveFrom
        ? <p className="text-xs leading-4 text-muted-foreground">{schedule(result.version, result.checkedOn)}</p>
        : null}
      {call.notices && call.notices.length > 0 && (
        <div className="rounded-xl bg-muted px-4 py-3 text-xs leading-5" role="note">
          <p className="flex items-center gap-1.5 font-medium text-foreground"><CircleAlert className="size-3.5 text-brand" aria-hidden="true" />Check before relying on these rates</p>
          <ul className="mt-1.5 space-y-1 text-foreground">{call.notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul>
        </div>
      )}
      {result.lines.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table aria-label={`Charges at ${result.port.name}`}>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="px-4 text-xs">Charge</TableHead>
                <TableHead className="px-4 text-right text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.lines.map(line => (
                <TableRow key={line.chargeId}>
                  <TableCell className="px-4 py-2.5 align-top whitespace-normal">
                    <p className="font-medium text-foreground">{line.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground" style={{ overflowWrap: 'anywhere' }}>{line.working} · <SourceLink source={line.source} /></p>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top whitespace-nowrap tabular-nums">{line.currency} {line.display}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="bg-muted/50">
              {result.totals.map(total => (
                <TableRow key={total.currency}>
                  <TableCell className="px-4 py-2.5">Total before GST{result.totals.length > 1 ? ` (${total.currency})` : ''}{result.questions.length ? <span className="font-normal text-muted-foreground"> · incomplete</span> : null}</TableCell>
                  <TableCell className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{money(total)}</TableCell>
                </TableRow>
              ))}
            </TableFooter>
          </Table>
        </div>
      )}
      {!result.lines.length && !result.questions.length && <p className="text-muted-foreground">Nothing could be priced for this call.</p>}
      {call.agreed && (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table aria-label={`Your agreed rates at ${result.port.name}`}>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="px-4 text-xs">Your agreed rates</TableHead>
                <TableHead className="px-4 text-right text-xs">Published</TableHead>
                <TableHead className="px-4 text-right text-xs">Yours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {call.agreed.rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell className="px-4 py-2.5 align-top whitespace-normal"><p className="font-medium">{row.label}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{row.basis}{row.note ? ` · ${row.note}` : ''}</p></TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top whitespace-nowrap tabular-nums text-muted-foreground">{row.published ? money(row.published) : 'Not priced'}</TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top whitespace-nowrap tabular-nums">{money(row.agreed)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="bg-muted/50">
              <TableRow>
                <TableCell className="px-4 py-2.5 whitespace-normal" colSpan={2}>Total with your agreed rates</TableCell>
                <TableCell className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{call.agreed.totals.map(total => <span key={total.currency} className="block">{money(total)}</span>)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <Questions items={result.questions} />
      {result.notCovered.length > 0 && (
        <div className="text-xs leading-5">
          <p className="font-medium text-foreground">Not priced</p>
          <div className="mt-1 text-muted-foreground"><Bullets items={result.notCovered.map(item => item.reason)} /></div>
        </div>
      )}
      {result.assumptions.length > 0 && (
        <div className="text-xs leading-5">
          <p className="font-medium text-foreground">Assumed</p>
          <div className="mt-1 text-muted-foreground"><Bullets items={result.assumptions} /></div>
        </div>
      )}
      {(call.notes.length > 0 || call.exchangeRate || result.lines.some(line => line.conditions.length)) && (
        <Disclosure summary={`Conditions and notes from the ${shortName(result.port.name)} schedule`}>
          {result.lines.filter(line => line.conditions.length).map(line => (
            <div key={line.chargeId}><p className="font-medium text-foreground">{line.label}</p><Bullets items={line.conditions} /></div>
          ))}
          {call.notes.length > 0 && <div><p className="font-medium text-foreground">Notes</p><Bullets items={call.notes} /></div>}
          {call.exchangeRate && <div><p className="font-medium text-foreground">Dollar charges paid in rupees</p><p>{call.exchangeRate}</p></div>}
        </Disclosure>
      )}
    </div>
  )
}

/* ---------- Comparison (berth hire or whole bill) ---------- */

function ComparisonView({ card }: { card: ComparisonCard }) {
  const ports = card.ports
  const title = card.view === 'berth-hire' ? 'Berth hire compared' : 'Whole port bill compared'
  const meta = [shipLine(card.ship), card.hoursAlongside && `${card.hoursAlongside} hours alongside`].filter(Boolean).join(' · ')
  const questions = ports.flatMap(port => port.questions.map(question => `${shortName(port.port.name)}: ${question}`))
  return (
    <Frame label={title} title={title} meta={meta || undefined}>
      <ul className="space-y-3 sm:hidden" aria-label={title}>
        {ports.map((port, index) => (
          <li key={index} className="overflow-hidden rounded-xl border border-border">
            <p className="bg-muted px-4 py-2 text-xs leading-5"><span className="font-medium text-foreground">{shortName(port.port.name)}</span>{port.terminal && <span className="text-muted-foreground"> · {port.terminal}</span>}<span className="text-muted-foreground"> · from {day(port.version.effectiveFrom)}</span></p>
            <dl className="divide-y divide-border">
              {card.rows.map(row => {
                const cell = row.cells[index]
                return (
                  <div key={row.key} className="flex items-start justify-between gap-4 px-4 py-2">
                    <dt>{row.label}</dt>
                    <dd className="text-right tabular-nums"><Cell cell={cell} /></dd>
                  </div>
                )
              })}
              <div className="flex items-start justify-between gap-4 bg-muted/50 px-4 py-2 font-medium">
                <dt>Total before GST</dt>
                <dd className="text-right tabular-nums">{port.totals.length ? port.totals.map(total => <span key={total.currency} className="block">{money(total)}</span>) : '—'}{port.questions.length > 0 && <span className="block text-xs font-normal text-muted-foreground">incomplete</span>}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
        <Table aria-label={title}>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="px-4 text-xs">Charge</TableHead>
              {ports.map(port => (
                <TableHead key={port.port.id + (port.terminal ?? '')} className="h-auto px-4 py-2 text-right align-bottom text-xs whitespace-normal">
                  <span className="block font-medium text-foreground">{shortName(port.port.name)}</span>
                  {port.terminal && <span className="block font-normal text-muted-foreground">{port.terminal}</span>}
                  <span className="block font-normal text-muted-foreground">from {day(port.version.effectiveFrom)}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {card.rows.map(row => (
              <TableRow key={row.key}>
                <TableCell className="px-4 py-2.5 font-medium">{row.label}</TableCell>
                {row.cells.map((cell, index) => (
                  <TableCell key={index} className="px-4 py-2.5 text-right align-top whitespace-nowrap tabular-nums"><Cell cell={cell} /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="bg-muted/50">
            <TableRow>
              <TableCell className="px-4 py-2.5 whitespace-normal">Total before GST</TableCell>
              {ports.map((port, index) => (
                <TableCell key={index} className="px-4 py-2.5 text-right align-top whitespace-nowrap tabular-nums">
                  {port.totals.length ? port.totals.map(total => <span key={total.currency} className="block">{money(total)}</span>) : '—'}
                  {port.questions.length > 0 && <span className="block text-xs font-normal text-muted-foreground">incomplete</span>}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {card.ranking
        ? <p className="leading-6">Lowest first: {card.ranking.map((item, index) => <span key={item.port}>{index > 0 && ', then '}<span className={index === 0 ? 'font-medium' : undefined}>{shortName(item.port)}</span> <span className="tabular-nums">({money(item.total)})</span></span>)}{card.usdToInr ? <span className="text-muted-foreground"> · converted at INR {card.usdToInr} per US dollar</span> : null}</p>
        : card.notRanked && <p className="text-xs leading-5 text-muted-foreground">{card.notRanked}</p>}
      <Questions items={questions} label="Needed before these can be compared fully" />
      {ports.some(port => port.notCovered.length) && (
        <div className="text-xs leading-5">
          <p className="font-medium text-foreground">Not priced</p>
          <div className="mt-1 text-muted-foreground"><Bullets items={ports.flatMap(port => port.notCovered.map(item => `${shortName(port.port.name)}: ${item.reason}`))} /></div>
        </div>
      )}
      <Disclosure summary="Working and assumptions for each port">
        {card.estimates.map(result => (
          <div key={result.port.id + (result.terminal ?? '')}>
            <p className="font-medium text-foreground">{result.port.name}</p>
            <ul className="mt-1 space-y-1">
              {result.lines.map(line => <li key={line.chargeId}><span className="text-foreground">{line.label}:</span> {line.working} = {line.currency} {line.display} · <SourceLink source={line.source} /></li>)}
            </ul>
            {result.assumptions.length > 0 && <p className="mt-1">Assumed: {result.assumptions.join(' ')}</p>}
          </div>
        ))}
      </Disclosure>
      <FollowUps items={[
        { label: 'Change the stay', text: 'Compare again, but with the ship staying ' },
        { label: 'Show the rates side by side', text: `Show how ${ports.map(port => shortName(port.port.name)).join(' and ')} charge, side by side` },
      ]} />
    </Frame>
  )
}

function Cell({ cell }: { cell: ComparisonCell }) {
  if (cell && 'totals' in cell) return <>{cell.totals.map(total => <span key={total.currency} className="block">{money(total)}</span>)}</>
  if (cell && 'missing' in cell) return <span className="text-muted-foreground" title={cell.missing}>Not priced<span className="sr-only">: {cell.missing}</span></span>
  return <span className="text-muted-foreground"><span aria-hidden="true">—</span><span className="sr-only">Not charged separately</span></span>
}

/* ---------- Tariffs ---------- */

function ChargeList({ view }: { view: TariffView }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {view.charges.map(charge => (
        <li key={charge.id} className="space-y-1 px-4 py-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium">{charge.label}</span><span className="text-xs"><SourceLink source={charge.source} /></span></p>
          <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
            {charge.rates.map((rate, index) => <li key={index}><span className="text-foreground">{rate.appliesTo}:</span> {rate.text}</li>)}
          </ul>
          {charge.conditions.length > 0 && <div className="text-xs leading-5 text-muted-foreground"><Bullets items={charge.conditions} /></div>}
        </li>
      ))}
    </ul>
  )
}

function TariffCardView({ card }: { card: TariffCard }) {
  const name = shortName(card.port.name)
  return (
    <Frame label={`How ${card.port.name} charges`} title={`How ${card.port.name} charges`} meta={<>
      {schedule(card.version, card.checkedOn)}
      <span className="mt-1 block">{card.version.documents.map((doc, index) => <span key={doc.url}>{index > 0 && ' · '}<a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline focus-visible:underline focus-visible:outline-none">{doc.title}</a></span>)}</span>
    </>}>
      {card.notices && card.notices.length > 0 && (
        <div className="rounded-xl bg-muted px-4 py-3 text-xs leading-5" role="note">
          <p className="flex items-center gap-1.5 font-medium text-foreground"><CircleAlert className="size-3.5 text-brand" aria-hidden="true" />Check before relying on these rates</p>
          <ul className="mt-1.5 space-y-1 text-foreground">{card.notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul>
        </div>
      )}
      {card.charges.length ? <ChargeList view={card} /> : <p className="text-muted-foreground">No charges in this schedule match that kind of ship.</p>}
      {card.changes && (
        <div className="text-xs leading-5">
          <p className="font-medium text-foreground">What changed since the schedule from {day(card.changes.since.effectiveFrom)}</p>
          {card.changes.items.length
            ? <ul className="mt-1.5 space-y-2 text-muted-foreground">{card.changes.items.map(item => (
              <li key={item.label}>
                <p className="text-foreground">{item.label}{!item.before ? ' (new)' : !item.after ? ' (no longer charged)' : ''}</p>
                {item.before && item.after && <p><span className="text-foreground">Before:</span> {item.before}</p>}
                {item.after && <p><span className="text-foreground">{item.before ? 'Now:' : 'Rate:'}</span> {item.after}</p>}
                {item.before && !item.after && <p><span className="text-foreground">Was:</span> {item.before}</p>}
              </li>
            ))}</ul>
            : <p className="mt-1 text-muted-foreground">No changes to these charges.</p>}
        </div>
      )}
      {(card.notes.length > 0 || card.exchangeRate) && (
        <Disclosure summary={`Notes on the ${name} schedule`}>
          {card.notes.length > 0 && <Bullets items={card.notes} />}
          {card.exchangeRate && <div><p className="font-medium text-foreground">Dollar charges paid in rupees</p><p>{card.exchangeRate}</p></div>}
        </Disclosure>
      )}
      <FollowUps items={[
        { label: `Estimate a call at ${name}`, text: `Estimate a call at ${name} for a ship of ` },
        { label: 'Compare with another port', text: `Compare how ${name} charges with ` },
      ]} />
    </Frame>
  )
}

function TariffComparisonView({ card }: { card: TariffComparisonCard }) {
  const groups = CHARGE_GROUPS.filter(group => card.ports.some(port => 'charges' in port && port.charges.some(charge => group.types.includes(charge.type))))
  const meta = [shipLine({ ...card.ship, grt: undefined }), `on ${day(card.date)}`].filter(Boolean).join(' · ')
  return (
    <Frame label="Tariffs compared" title={`Tariffs compared: ${card.ports.map(port => shortName(port.port.name)).join(', ')}`} meta={meta}>
      {card.ports.filter((port): port is { port: { id: string; name: string }; missing: string } => 'missing' in port).map(port => (
        <p key={port.port.id} className="text-xs text-muted-foreground">{port.port.name}: {port.missing}</p>
      ))}
      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.key}>
            <h4 className="text-sm leading-5 font-medium">{group.label}</h4>
            <dl className="mt-1.5 divide-y divide-border rounded-xl border border-border">
              {card.ports.filter((port): port is TariffView => 'charges' in port).map(port => {
                const charges = port.charges.filter(charge => group.types.includes(charge.type))
                return (
                  <div key={port.port.id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="text-xs leading-5 font-medium text-foreground">{shortName(port.port.name)}</dt>
                    <dd className="space-y-1 text-xs leading-5 text-muted-foreground">
                      {charges.length ? charges.map(charge => (
                        <div key={charge.id}>
                          {charges.length > 1 && <p className="text-foreground">{charge.label}</p>}
                          {charge.rates.map((rate, index) => <p key={index}><span className="text-foreground">{rate.appliesTo}:</span> {rate.text} · <SourceLink source={charge.source} /></p>)}
                        </div>
                      )) : <p>Not published in this schedule</p>}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        ))}
      </div>
      <FollowUps items={[{ label: 'Price a call at each port', text: `Compare the whole bill at ${card.ports.map(port => shortName(port.port.name)).join(' and ')} for a ship of ` }]} />
    </Frame>
  )
}

/* ---------- Coverage ---------- */

function CoverageView({ card }: { card: CoverageCard }) {
  return (
    <Frame label="Ports covered" title={`Ports covered (${card.ports.length})`} meta="Charges are read from each port's published rate schedule.">
      <div className="overflow-hidden rounded-xl border border-border">
        <Table aria-label="Ports covered">
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="px-4 text-xs">Port</TableHead>
              <TableHead className="px-4 text-xs">Rates in force from</TableHead>
              <TableHead className="px-4 text-xs">Checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {card.ports.map(port => (
              <TableRow key={port.id}>
                <TableCell className="px-4 py-2.5 align-top whitespace-normal">
                  <p className="font-medium">{port.name}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{port.charges.join(', ')}</p>
                  {port.cargo && <p className="text-xs leading-5 text-muted-foreground">Wharfage on {port.cargo.join(', ')}</p>}
                </TableCell>
                <TableCell className="px-4 py-2.5 align-top whitespace-nowrap">{port.inForce ? day(port.inForce.effectiveFrom) : <span className="text-muted-foreground">None for today</span>}</TableCell>
                <TableCell className="px-4 py-2.5 align-top whitespace-nowrap">{day(port.checkedOn)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {card.ports.some(port => port.gaps.length) && (
        <Disclosure summary="What isn't priced at each port">
          {card.ports.filter(port => port.gaps.length).map(port => (
            <div key={port.id}><p className="font-medium text-foreground">{port.name}</p><Bullets items={port.gaps} /></div>
          ))}
        </Disclosure>
      )}
    </Frame>
  )
}

/* ---------- Port document excerpts ---------- */

function ExcerptsView({ card }: { card: DocumentExcerptsCard }) {
  const title = card.port ? `From ${shortName(card.port.name)}'s documents` : 'From the port documents'
  return (
    <Frame label={title} title={title} meta={`Searched for “${card.question}”`}>
      {card.results.length === 0
        ? <p className="text-muted-foreground">Nothing in the documents we hold matches this.</p>
        : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {card.results.map((hit, index) => (
              <li key={index} className="space-y-1.5 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{hit.title}</span>
                  <span className="text-xs"><SourceLink source={{ title: hit.title, url: hit.url, page: String(hit.page) }} /></span>
                </p>
                <p className="text-xs leading-5 text-muted-foreground">{[!card.port && shortName(hit.port.name), hit.issuer, hit.publishedOn ? `dated ${day(hit.publishedOn)}` : `retrieved ${day(hit.retrievedOn)}`].filter(Boolean).join(' · ')}</p>
                <Disclosure summary="Show the page text">
                  <div className="chat-markdown prose prose-xs prose-neutral max-h-96 max-w-none overflow-auto rounded-lg bg-muted p-3 text-xs leading-5 text-foreground dark:prose-invert prose-headings:text-xs prose-headings:font-semibold prose-p:my-1.5 prose-table:my-2 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1" tabIndex={0} role="region" aria-label={`Page ${hit.page} of ${hit.title}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{hit.excerpt}</ReactMarkdown>
                  </div>
                </Disclosure>
              </li>
            ))}
          </ul>
        )}
    </Frame>
  )
}

/* ---------- My fleet ---------- */

function ShipFacts({ ship }: { ship: FleetShip }) {
  const facts: Array<[string, string | undefined]> = [
    ['IMO number', ship.imo], ['Gross tonnage', `${Number(ship.grt).toLocaleString('en-US')} GRT`],
    ['Net tonnage', ship.nrt && `${Number(ship.nrt).toLocaleString('en-US')} NRT`], ['Length overall', ship.loa && `${ship.loa} m`],
    ['Type', shipTypeLabel(ship.type)], ['Trade', tradeLabel(ship.status)],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
      {facts.filter((fact): fact is [string, string] => Boolean(fact[1])).map(([label, value]) => (
        <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{value}</dd></div>
      ))}
    </dl>
  )
}

function ShipView({ card }: { card: ShipCard }) {
  const meta = card.saved === 'created' ? 'Saved to your fleet' : card.saved === 'updated' ? 'Updated in your fleet' : 'In your fleet'
  return (
    <Frame label={`${card.ship.name}, ${meta.toLowerCase()}`} title={card.ship.name} meta={meta}>
      <ShipFacts ship={card.ship} />
      <Link href="/dashboard/fleet" className="inline-flex text-xs text-brand hover:underline focus-visible:underline focus-visible:outline-none">Edit in My fleet</Link>
    </Frame>
  )
}

function FleetView({ card }: { card: FleetCard }) {
  return (
    <Frame label="Your fleet" title={`Your fleet (${card.ships.length})`}>
      {card.ships.length === 0
        ? <p className="text-muted-foreground">No ships saved yet. Give a ship&apos;s name and tonnage once and it is filled in from then on.</p>
        : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {card.ships.map(ship => (
              <li key={ship.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5">
                <span className="font-medium">{ship.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{[`${Number(ship.grt).toLocaleString('en-US')} GRT`, shipTypeLabel(ship.type)].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      <Link href="/dashboard/fleet" className="inline-flex text-xs text-brand hover:underline focus-visible:underline focus-visible:outline-none">Manage My fleet</Link>
    </Frame>
  )
}

/* ---------- Company documents ---------- */

function CompanyExcerptsView({ card }: { card: CompanyExcerptsCard }) {
  return (
    <Frame label="From your company documents" title="From your company documents" meta={`Searched for “${card.question}”`}>
      {card.results.length === 0
        ? <p className="text-muted-foreground">Nothing in your uploaded documents matches this.</p>
        : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {card.results.map((hit, index) => (
              <li key={index} className="space-y-1.5 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium">{hit.title}</span><span className="text-xs text-muted-foreground">p. {hit.page}</span></p>
                <p className="text-xs leading-5 text-muted-foreground">{hit.fileName}</p>
                <Disclosure summary="Show the passage">
                  <p className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs leading-5 whitespace-pre-wrap text-foreground" tabIndex={0}>{hit.text}</p>
                </Disclosure>
              </li>
            ))}
          </ul>
        )}
      <Link href="/dashboard/documents" className="inline-flex text-xs text-brand hover:underline focus-visible:underline focus-visible:outline-none">Manage your documents</Link>
    </Frame>
  )
}
