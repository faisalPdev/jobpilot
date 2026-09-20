import clsx, { type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

let counter = 0
/** Stable-enough client ids; the real backend returns uuids. */
export function uid(prefix = 'id') {
  counter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export function daysFromNowIso(days: number) {
  return daysAgoIso(-days)
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relativeTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60_000)
  if (Math.abs(mins) < 1) return 'just now'
  if (Math.abs(mins) < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return `${days}d ago`
  return formatDate(iso)
}

export function pct(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** Month key for grouping, e.g. 2026-09. */
export function monthKey(iso: string) {
  return iso.slice(0, 7)
}

/** ISO week start (Monday) as YYYY-MM-DD, used by the volume chart. */
export function weekStart(iso: string) {
  const d = new Date(iso)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whitelist-sanitise pasted rich text down to bold/italic only. The editor is
 * deliberately constrained so exports stay ATS-clean (§2).
 *
 * Implemented as a direct tag filter rather than tokenise-and-restore, which is
 * the kind of thing that quietly eats a plain number out of "cut cost by 31%".
 */
export function sanitizeInlineHtml(html: string) {
  return html
    // Anything outside the whitelist goes — tag and attributes together.
    .replace(/<(?!\/?(?:b|strong|i|em)\b)[^>]*>/gi, ' ')
    .replace(/<(\/?)strong\b[^>]*>/gi, '<$1b>')
    .replace(/<(\/?)em\b[^>]*>/gi, '<$1i>')
    // Strip attributes from the two tags we keep (style, class, contenteditable…).
    .replace(/<(b|i)\b[^>]*>/gi, (_match, tag: string) => `<${tag.toLowerCase()}>`)
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length
}

export function titleCase(s: string) {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase())
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function sortByOrder<T extends { order_index: number }>(items: T[]) {
  return [...items].sort((a, b) => a.order_index - b.order_index)
}

export function reindex<T extends { order_index: number }>(items: T[]) {
  return items.map((item, i) => ({ ...item, order_index: i }))
}

export function move<T>(items: T[], from: number, to: number) {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item)
    acc[k] = acc[k] ?? []
    acc[k].push(item)
    return acc
  }, {})
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

export function download(filename: string, content: string | Blob, mime = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
