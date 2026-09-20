import type { TemplateId } from '@/types'

export interface TemplateMeta {
  id: TemplateId
  name: string
  description: string
  ats_safe: boolean
  columns: 1 | 2
  /** Short note shown in the picker so the trade-off is explicit. */
  best_for: string
}

/** §2 — 3–5 ATS-safe layouts plus 1–2 designed layouts for non-ATS sends. */
export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'ats-classic',
    name: 'Classic',
    description: 'Single column, serif headings, generous spacing. The safest possible parse.',
    ats_safe: true,
    columns: 1,
    best_for: 'Any online portal (Workday, Taleo, SuccessFactors)',
  },
  {
    id: 'ats-compact',
    name: 'Compact',
    description: 'Single column, tighter leading. Fits ~30% more on one page.',
    ats_safe: true,
    columns: 1,
    best_for: 'Long histories you refuse to cut to two pages',
  },
  {
    id: 'ats-modern',
    name: 'Modern',
    description: 'Single column with a coloured rule and sans-serif type. Still plain text underneath.',
    ats_safe: true,
    columns: 1,
    best_for: 'Startups and scale-ups using Greenhouse/Lever/Ashby',
  },
  {
    id: 'ats-technical',
    name: 'Technical',
    description: 'Skills-forward ordering with a monospace accent for the tech stack.',
    ats_safe: true,
    columns: 1,
    best_for: 'Engineering roles where the stack is the screen',
  },
  {
    id: 'designed-sidebar',
    name: 'Designed — Sidebar',
    description: 'Two columns with a contact/skills sidebar. Looks sharp; parsers mangle it.',
    ats_safe: false,
    columns: 2,
    best_for: 'Referrals and direct-to-hiring-manager email only',
  },
  {
    id: 'designed-editorial',
    name: 'Designed — Editorial',
    description: 'Large display type and a lead paragraph. A portfolio piece, not a portal upload.',
    ats_safe: false,
    columns: 2,
    best_for: 'Design, marketing and comms roles sent by email',
  },
]

export function templateMeta(id: TemplateId) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}
