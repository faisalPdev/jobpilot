import type { ReactNode } from 'react'
import { API_MODE } from '@/lib/api'

const PILLARS = [
  {
    title: 'Structured, not a document',
    body: 'Your profile is the source of truth. Every resume, export and answer is a render of it.',
  },
  {
    title: 'Never invents experience',
    body: 'Tailoring rephrases and reprioritises. A validator flags any company, tool or number that is not already yours.',
  },
  {
    title: 'You own the submit',
    body: 'The agent finds roles and drafts materials. Applying stays a human action on the employer’s own site.',
  },
  {
    title: 'Explainable scores',
    body: 'Every match percentage breaks down into subscores with the evidence that produced them.',
  },
]

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* `on-dark` pins this panel to the dark palette in both themes: it is a
          marketing hero, and inverting it in dark mode would just make it white.
          Inside it, the ink scale reads the usual way round -- 100 is the
          surface, 900 is the primary text. */}
      <div className="on-dark relative hidden flex-col justify-between bg-ink-100 p-10 text-ink-900 lg:flex">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary">
              J
            </div>
            <span className="text-sm font-semibold tracking-tight">JobPilot</span>
          </div>
          <h1 className="mt-14 max-w-md text-3xl font-semibold leading-tight tracking-tight">
            A job search that can tell you what is actually working.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-600">
            Build the profile once. Tailor it to every job description, track every application, and see which
            resume, which channel and which story converts.
          </p>
        </div>

        <div className="grid max-w-lg gap-5 sm:grid-cols-2">
          {PILLARS.map((pillar) => (
            <div key={pillar.title}>
              <div className="text-sm font-semibold text-brand-700">{pillar.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">{pillar.body}</p>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-ink-500">
          Phase 1 · Resume builder · JD tailoring · Tracker · Analytics · Discovery · Interview prep
        </div>
      </div>

      <div className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary">
              J
            </div>
            <span className="text-sm font-semibold">JobPilot</span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h2>
          <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-8 text-[11px] text-ink-400">
            Running in <span className="font-semibold">{API_MODE === 'mock' ? 'mock' : 'live API'}</span> mode. Switch
            with <code className="rounded bg-ink-100 px-1">VITE_API_MODE</code> in <code>.env</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
