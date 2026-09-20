import type { ApplicationSource, ApplicationStatus, DiscoveredStatus, Seniority } from '@/types'

/** Default pipeline (§4). Order matters: it drives the board and the funnel. */
export const PIPELINE: ApplicationStatus[] = [
  'Saved',
  'Applied',
  'Screening',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
]

/** The part of the pipeline that is a funnel; the rest are terminal outcomes. */
export const LINEAR_PIPELINE: ApplicationStatus[] = ['Saved', 'Applied', 'Screening', 'Interview', 'Offer']

export const TERMINAL_STATUSES: ApplicationStatus[] = ['Rejected', 'Withdrawn']

export const STATUS_STYLES: Record<ApplicationStatus, { badge: string; dot: string; column: string }> = {
  Saved: { badge: 'bg-ink-100 text-ink-700', dot: 'bg-ink-400', column: 'border-ink-200' },
  Applied: { badge: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500', column: 'border-brand-200' },
  Screening: { badge: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500', column: 'border-violet-200' },
  Interview: { badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', column: 'border-amber-200' },
  Offer: { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', column: 'border-emerald-200' },
  Rejected: { badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500', column: 'border-rose-200' },
  Withdrawn: { badge: 'bg-ink-100 text-ink-500', dot: 'bg-ink-300', column: 'border-ink-200' },
}

export const SOURCES: ApplicationSource[] = [
  'LinkedIn',
  'Indeed',
  'Referral',
  'Company site',
  'Greenhouse',
  'Lever',
  'Ashby',
  'RemoteOK',
  'Adzuna',
  'Other',
]

/**
 * Channels the discovery agent is allowed to use (§6.1): official APIs, public
 * JSON endpoints and feeds. LinkedIn and Indeed are intentionally absent — they
 * are fine as *manual* application sources, but not as scrape targets.
 */
export const DISCOVERY_CHANNELS: ApplicationSource[] = [
  'Greenhouse',
  'Lever',
  'Ashby',
  'RemoteOK',
  'Adzuna',
  'Company site',
]

export const SENIORITY_LEVELS: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'staff', 'lead', 'director']

export const DISCOVERED_STATUS_LABELS: Record<DiscoveredStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  dismissed: 'Dismissed',
  drafted: 'Draft ready',
  prepared: 'Prepared',
}

export function statusIndex(status: ApplicationStatus) {
  return LINEAR_PIPELINE.indexOf(status)
}
