import Link from 'next/link'
import {
  Calculator,
  MessageSquare,
  Globe,
  ArrowRight,
  ChevronRight,
  Ship,
  CheckCircle2,
} from 'lucide-react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'

const features = [
  {
    icon: Calculator,
    title: 'Port Charge Estimates',
    description:
      'Provide vessel, cargo and stay details to request an itemised estimate from the available tariff schedules.',
  },
  {
    icon: MessageSquare,
    title: 'AI Port Assistant',
    description:
      'Ask about charges and requirements in the available port documents. Review cited sections and assumptions with each estimate.',
  },
  {
    icon: Globe,
    title: 'India Port References',
    description:
      'Reference schedules for 16 Indian ports and terminals. Document dates vary; confirm current rates with the port authority.',
  },
]

const steps = [
  {
    number: '01',
    title: 'Select a Port',
    description:
      'Tell the assistant which supported Indian port and terminal you plan to visit.',
  },
  {
    number: '02',
    title: 'Enter Vessel Details',
    description:
      'Input your vessel specifications — type, GRT, NRT, DWT, LOA, and estimated stay duration.',
  },
  {
    number: '03',
    title: 'Get Your Estimate',
    description:
      'Review the itemised breakdown, document references and assumptions. Confirm the final charges with the port authority.',
  },
]

const chargeItems = [
  { label: 'Port Dues', amount: '$2,400' },
  { label: 'Pilotage', amount: '$1,850' },
  { label: 'Towage', amount: '$3,200' },
  { label: 'Mooring', amount: '$480' },
  { label: 'Wharfage', amount: '$5,600' },
]

const stats = [
  { value: '16', label: 'Port & Terminal References' },
  { value: 'India', label: 'Current Coverage' },
  { value: 'Dated', label: 'Reference Schedules' },
  { value: 'AI', label: 'Assisted Estimates' },
]

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 flex justify-center"
        >
          <div className="w-[900px] h-[500px] bg-blue-50 rounded-full blur-3xl opacity-70 -translate-y-1/4" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                <Ship className="w-3.5 h-3.5" />
                Port Intelligence Prototype
              </div>

              <h1 className="text-5xl lg:text-6xl font-bold text-slate-900 leading-[1.08] tracking-tight mb-6">
                Calculate Port Charges{' '}
                <span className="text-blue-600">with Context</span>
              </h1>

              <p className="text-lg text-slate-500 leading-relaxed mb-8 max-w-lg">
                Explore port charge estimates and tariff questions using reference
                documents for Indian ports and terminals. Confirm current rates
                before making operational decisions.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/login?tab=signup"
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Get Started Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 text-slate-700 font-medium px-6 py-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  See How It Works
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 text-sm text-slate-500">
                {['Prototype access', '16 port and terminal references', 'Estimates for review'].map(
                  (item) => (
                    <div key={item} className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      {item}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Calculator preview */}
            <div className="flex justify-center lg:justify-end">
              <div className="relative w-full max-w-sm">
                <div
                  aria-hidden
                  className="absolute -inset-6 bg-blue-100 rounded-3xl blur-2xl opacity-50"
                />

                <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">
                        Illustrative Estimate
                      </p>
                      <h3 className="text-slate-900 font-semibold text-lg leading-tight">
                        Sample Port Call
                      </h3>
                    </div>
                    <span className="flex items-center gap-1.5 bg-green-50 text-green-600 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Example
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-xl px-4 py-2.5 mb-5 flex items-center justify-between text-sm">
                    <span className="text-slate-500">MV Ocean Pioneer</span>
                    <span className="text-slate-700 font-medium">45,000 GT</span>
                  </div>

                  <div className="space-y-2.5 mb-5">
                    {chargeItems.map((item) => (
                      <div key={item.label} className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">{item.label}</span>
                        <span className="text-sm font-medium text-slate-800">{item.amount}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 pt-4 flex justify-between items-center mb-4">
                    <span className="font-semibold text-slate-900">Total Estimate</span>
                    <span className="text-xl font-bold text-blue-600">$13,530</span>
                  </div>

                  <p className="text-xs text-slate-500 mb-4">Sample figures only. Not an actual tariff calculation.</p>
                  <Link href="/login" className="w-full bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    Open Assistant
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Floating AI bubble */}
                <div className="absolute -bottom-5 -left-8 bg-white rounded-2xl shadow-lg border border-slate-100 p-4 max-w-[200px]">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
                    AI Assistant
                  </p>
                  <p className="text-xs text-slate-700 leading-snug">
                    &ldquo;Which charges apply at Mumbai?&rdquo;
                  </p>
                  <div className="mt-2.5 flex items-center gap-1">
                    <div className="h-1.5 w-8 bg-blue-200 rounded-full animate-pulse" />
                    <div className="h-1.5 w-5 bg-blue-100 rounded-full animate-pulse" />
                    <div className="h-1.5 w-3 bg-blue-50 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-14 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
                <p className="text-sm text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-3">
              Features
            </p>
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Plan your port call
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Use available tariff schedules to explore charges and prepare
              questions for your port agent.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-2xl border border-slate-100 p-8 hover:border-blue-100 hover:shadow-lg transition-all duration-200 group"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-100 transition-colors">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-3">
              How It Works
            </p>
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              From vessel details to an estimate
            </h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              Start your estimate in three steps. Response time depends on the question and model availability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div key={step.number} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6">
                  <span className="text-xl font-bold text-blue-600">{step.number}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-slate-900 rounded-3xl px-8 py-20 text-center overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600 rounded-full blur-3xl opacity-20"
            />
            <div className="relative">
              <h2 className="text-4xl font-bold text-white mb-4">
                Ready to calculate your port charges?
              </h2>
              <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">
                Explore the prototype with your vessel details and review the
                available tariff references.
              </p>
              <Link
                href="/login?tab=signup"
                className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-4 rounded-xl hover:bg-blue-500 transition-colors text-base"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
