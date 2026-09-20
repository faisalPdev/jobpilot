import type { Application } from '@/types'
import { download } from '../utils'

export function toCsv(rows: Record<string, unknown>[], columns?: string[]) {
  if (!rows.length) return ''
  const cols = columns ?? Object.keys(rows[0])
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  download(filename, toCsv(rows, columns), 'text/csv;charset=utf-8')
}

/** Minimal RFC-4180-ish parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const cells: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) cells.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) cells.push(row)

  if (!cells.length) return { headers: [], rows: [] }
  const headers = cells[0].map((h) => h.trim())
  const rows = cells.slice(1).map((line) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (line[i] ?? '').trim()
    })
    return obj
  })
  return { headers, rows }
}

export const APPLICATION_CSV_COLUMNS = [
  'company_name',
  'role_title',
  'location',
  'source',
  'status',
  'salary_text',
  'applied_at',
  'match_score',
  'next_follow_up_at',
  'notes',
]

export function applicationsToCsvRows(apps: Application[]) {
  return apps.map((a) => ({
    company_name: a.company_name,
    role_title: a.role_title,
    location: a.location,
    source: a.source,
    status: a.status,
    salary_text: a.salary_text,
    applied_at: a.applied_at ?? '',
    match_score: a.match_score ?? '',
    next_follow_up_at: a.next_follow_up_at ?? '',
    notes: a.notes.map((n) => n.body).join(' | '),
  }))
}

/** Template handed to users migrating from a spreadsheet (§4 "bulk import"). */
export const CSV_IMPORT_TEMPLATE = `company_name,role_title,location,source,status,applied_at,salary_text,notes
Acme Corp,Senior Backend Engineer,Remote,LinkedIn,Applied,2026-08-14,"$140k - $170k",Referred by a former colleague
Globex,Platform Engineer,"Berlin, DE",Company site,Screening,2026-08-20,,Recruiter call booked
`
