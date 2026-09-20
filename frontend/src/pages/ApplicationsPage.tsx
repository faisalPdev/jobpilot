import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Application, ApplicationSource, ApplicationStatus, DuplicateWarning } from '@/types'
import { api } from '@/lib/api'
import { PIPELINE, SOURCES, STATUS_STYLES } from '@/lib/pipeline'
import {
  APPLICATION_CSV_COLUMNS,
  CSV_IMPORT_TEMPLATE,
  applicationsToCsvRows,
  downloadCsv,
  parseCsv,
} from '@/lib/export/csv'
import { cn, download, formatDate, relativeTime } from '@/lib/utils'
import { useAsync, useLocalState } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Button, Hint, PageHeader, Pill } from '@/components/ui/primitives'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/inputs'
import { Modal } from '@/components/ui/overlays'
import { DataTable, type Column } from '@/components/ui/data'
import { KanbanBoard } from '@/components/tracker/KanbanBoard'

export function ApplicationsPage() {
  const navigate = useNavigate()
  const applications = useAsync(() => api.applications.list(), [])
  const resumes = useAsync(() => api.resumes.list(), [])
  const [view, setView] = useLocalState<'board' | 'table'>('jobpilot.tracker.view', 'board')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus[]>([])
  const [sourceFilter, setSourceFilter] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({
    key: 'applied_at',
    dir: 'desc',
  })
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)

  const rows = useMemo(() => {
    let list = applications.data ?? []
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (app) =>
          app.company_name.toLowerCase().includes(q) ||
          app.role_title.toLowerCase().includes(q) ||
          app.location.toLowerCase().includes(q),
      )
    }
    if (statusFilter.length) list = list.filter((app) => statusFilter.includes(app.status))
    if (sourceFilter) list = list.filter((app) => app.source === sourceFilter)
    return list
  }, [applications.data, query, statusFilter, sourceFilter])

  const move = async (id: string, status: ApplicationStatus, index: number) => {
    const previous = applications.data ?? []
    applications.setData((prev) =>
      (prev ?? []).map((app) => (app.id === id ? { ...app, status, board_index: index } : app)),
    )
    try {
      await api.applications.reorder(id, status, index)
      toast.success(`Moved to ${status}`, 'The transition is timestamped, so time-in-stage stays accurate.')
      applications.reload()
    } catch (err) {
      applications.setData(previous)
      toastError(err, 'Could not move the card')
    }
  }

  const columns: Column<Application>[] = [
    {
      key: 'role',
      header: 'Role',
      sortValue: (row) => row.role_title,
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/applications/${row.id}`} className="font-medium text-ink-900 hover:text-brand-700">
            {row.role_title}
          </Link>
          <div className="text-xs text-ink-500">
            {row.company_name}
            {row.location && ` · ${row.location}`}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (row) => PIPELINE.indexOf(row.status),
      render: (row) => (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            STATUS_STYLES[row.status].badge,
          )}
        >
          {row.status}
        </span>
      ),
    },
    { key: 'source', header: 'Source', sortValue: (row) => row.source, render: (row) => <span className="text-xs">{row.source}</span> },
    {
      key: 'match',
      header: 'Match',
      className: 'text-right',
      sortValue: (row) => row.match_score ?? -1,
      render: (row) => (
        <span className="tabular-nums text-xs">{row.match_score != null ? Math.round(row.match_score) : '—'}</span>
      ),
    },
    {
      key: 'resume',
      header: 'Resume sent',
      sortValue: (row) => row.resume_id ?? '',
      render: (row) => {
        const resume = resumes.data?.find((r) => r.id === row.resume_id)
        return (
          <span className="text-xs text-ink-600">
            {resume ? resume.title : row.resume_id ? 'deleted resume' : '—'}
            {row.attachments.length > 0 && <span className="ml-1 text-ink-400">📎</span>}
          </span>
        )
      },
    },
    {
      key: 'applied_at',
      header: 'Applied',
      sortValue: (row) => row.applied_at ?? '',
      render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.applied_at)}</span>,
    },
    {
      key: 'follow_up',
      header: 'Follow-up',
      sortValue: (row) => row.next_follow_up_at ?? '',
      render: (row) =>
        row.next_follow_up_at ? (
          <span
            className={cn(
              'whitespace-nowrap text-xs',
              row.next_follow_up_at <= new Date().toISOString() ? 'font-medium text-amber-700' : 'text-ink-500',
            )}
          >
            {relativeTime(row.next_follow_up_at)}
          </span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
  ]

  if (applications.loading && !applications.data) return <LoadingState label="Loading your tracker…" />
  if (applications.error) return <ErrorState error={applications.error} onRetry={applications.reload} />

  const all = applications.data ?? []

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Applications"
        subtitle="Every application, the exact resume that was sent, and a timestamped history of each stage."
        actions={
          <>
            <Button onClick={() => setImporting(true)}>Import CSV</Button>
            <Button
              onClick={() => {
                if (!all.length) {
                  toast.info('Nothing to export yet')
                  return
                }
                downloadCsv('jobpilot-applications.csv', applicationsToCsvRows(all), APPLICATION_CSV_COLUMNS)
                toast.success('Exported')
              }}
            >
              Export CSV
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              Log an application
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full max-w-xs">
          <SearchInput value={query} onChange={setQuery} placeholder="Search company, role, location…" />
        </div>
        <div className="w-40">
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label="Source">
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE.map((status) => (
            <Pill
              key={status}
              active={statusFilter.includes(status)}
              onClick={() =>
                setStatusFilter((prev) =>
                  prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
                )
              }
            >
              {status}
              <span className="ml-1 tabular-nums text-ink-400">
                {all.filter((a) => a.status === status).length}
              </span>
            </Pill>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <Pill active={view === 'board'} onClick={() => setView('board')}>
            Board
          </Pill>
          <Pill active={view === 'table'} onClick={() => setView('table')}>
            Table
          </Pill>
        </div>
      </div>

      {all.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="▦"
            title="Nothing tracked yet"
            body="Log an application manually, import the spreadsheet you have been keeping, or let the discovery agent prepare one."
            action={
              <div className="flex gap-2">
                <Button onClick={() => setImporting(true)}>Import CSV</Button>
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Log an application
                </Button>
              </div>
            }
          />
        </div>
      ) : view === 'board' ? (
        <KanbanBoard applications={rows} onMove={move} />
      ) : (
        <div className="panel">
          <DataTable
            rows={rows}
            columns={columns}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(row) => navigate(`/applications/${row.id}`)}
            empty="No applications match those filters."
          />
        </div>
      )}

      {view === 'board' && rows.length > 0 && (
        <Hint className="mt-2">
          Drag a card between columns to change its stage. Each move writes a timestamped transition, which is what
          the response-time and time-in-stage analytics read.
        </Hint>
      )}

      <AddApplicationModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          applications.reload()
          navigate(`/applications/${id}`)
        }}
      />

      <ImportCsvModal
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => applications.reload()}
      />
    </div>
  )
}

function AddApplicationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const resumes = useAsync(() => api.resumes.list(), [])
  const jds = useAsync(() => api.jds.list(), [])
  const [form, setForm] = useState({
    company_name: '',
    role_title: '',
    location: '',
    source: 'LinkedIn' as ApplicationSource,
    status: 'Applied' as ApplicationStatus,
    salary_text: '',
    resume_id: '',
    job_description_id: '',
  })
  const [duplicate, setDuplicate] = useState<DuplicateWarning | null>(null)
  const [pending, setPending] = useState(false)

  const checkDuplicate = async () => {
    if (!form.company_name.trim() || !form.role_title.trim()) return
    try {
      setDuplicate(
        await api.applications.checkDuplicate({
          company_name: form.company_name,
          role_title: form.role_title,
        }),
      )
    } catch {
      /* duplicate check is advisory */
    }
  }

  const submit = async () => {
    setPending(true)
    try {
      const jd = jds.data?.find((row) => row.id === form.job_description_id)
      const app = await api.applications.create({
        ...form,
        resume_id: form.resume_id || null,
        job_description_id: form.job_description_id || null,
        jd_snapshot: jd?.raw_text ?? '',
      })
      toast.success('Logged')
      onClose()
      onCreated(app.id)
    } catch (err) {
      toastError(err, 'Could not log the application')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log an application"
      subtitle="Record what you actually sent — that is what makes the analytics worth reading."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={pending}
            disabled={!form.company_name.trim() || !form.role_title.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company" required>
          <Input
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            onBlur={checkDuplicate}
            autoFocus
          />
        </Field>
        <Field label="Role" required>
          <Input
            value={form.role_title}
            onChange={(e) => setForm({ ...form, role_title: e.target.value })}
            onBlur={checkDuplicate}
          />
        </Field>
        <Field label="Location">
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </Field>
        <Field label="Salary (as posted)">
          <Input value={form.salary_text} onChange={(e) => setForm({ ...form, salary_text: e.target.value })} />
        </Field>
        <Field label="Source" hint="Feeds the source-performance report.">
          <Select
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value as ApplicationSource })}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as ApplicationStatus })}
          >
            {PIPELINE.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Resume sent" hint="Needed for the conversion-by-resume analytics.">
          <Select value={form.resume_id} onChange={(e) => setForm({ ...form, resume_id: e.target.value })}>
            <option value="">Not recorded</option>
            {(resumes.data ?? []).map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Job description" hint="Links the posting snapshot and the match score.">
          <Select
            value={form.job_description_id}
            onChange={(e) => setForm({ ...form, job_description_id: e.target.value })}
          >
            <option value="">None</option>
            {(jds.data ?? []).map((jd) => (
              <option key={jd.id} value={jd.id}>
                {jd.role_title} — {jd.company_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {duplicate && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-900">
            {duplicate.reason === 'exact' ? 'You already applied to this exact role' : 'You have applied here before'}
          </div>
          <p className="mt-1 text-xs text-amber-800">
            {duplicate.role_title} at {duplicate.company_name} — currently {duplicate.status}
            {duplicate.applied_at && `, applied ${formatDate(duplicate.applied_at)}`}.{' '}
            <Link to={`/applications/${duplicate.application_id}`} className="link">
              Open it
            </Link>
          </p>
        </div>
      )}
    </Modal>
  )
}

function ImportCsvModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; duplicates: DuplicateWarning[] } | null>(
    null,
  )

  const submit = async () => {
    const parsed = parseCsv(text)
    if (!parsed.rows.length) {
      toast.error('Nothing to import', 'The CSV needs a header row and at least one data row.')
      return
    }
    setPending(true)
    try {
      const outcome = await api.applications.bulkImport(parsed.rows)
      setResult(outcome)
      toast.success(`Imported ${outcome.created}`, outcome.skipped ? `${outcome.skipped} skipped` : undefined)
      onImported()
    } catch (err) {
      toastError(err, 'Import failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose()
        setResult(null)
      }}
      title="Import applications from CSV"
      subtitle="For everyone migrating off a spreadsheet."
      size="lg"
      footer={
        <>
          <Button onClick={() => download('jobpilot-import-template.csv', CSV_IMPORT_TEMPLATE, 'text/csv')}>
            Download template
          </Button>
          <Button variant="primary" onClick={submit} loading={pending} disabled={!text.trim()}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Hint>
          Columns recognised: <code>company_name</code>, <code>role_title</code>, <code>location</code>,{' '}
          <code>source</code>, <code>status</code>, <code>applied_at</code>, <code>salary_text</code>,{' '}
          <code>notes</code>. Company and role are required; anything else is optional. Rows that duplicate an
          existing company + role are skipped rather than merged.
        </Hint>

        <Field label="Paste CSV">
          <Textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={CSV_IMPORT_TEMPLATE}
            className="font-mono text-xs"
          />
        </Field>

        <div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) setText(await file.text())
            }}
            className="text-xs"
          />
        </div>

        {result && (
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
            <div className="text-xs font-semibold text-ink-800">
              {result.created} imported · {result.skipped} skipped
            </div>
            {result.duplicates.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.duplicates.map((dup) => (
                  <li key={dup.application_id} className="text-[11px] text-ink-600">
                    Skipped duplicate: {dup.role_title} at {dup.company_name} ({dup.status})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
