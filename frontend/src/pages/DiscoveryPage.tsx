import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ApplicationSource, DiscoveredJob, DiscoveredStatus, SavedSearch, Seniority } from '@/types'
import { api } from '@/lib/api'
import { DISCOVERED_STATUS_LABELS, DISCOVERY_CHANNELS, SENIORITY_LEVELS } from '@/lib/pipeline'
import { cn, relativeTime } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, PageHeader, Pill } from '@/components/ui/primitives'
import { EmptyState, ErrorState, GeneratingState, LoadingState, Progress } from '@/components/ui/feedback'
import { Checkbox, Field, Input, Select, Switch, TagInput } from '@/components/ui/inputs'
import { ConfirmDialog, Modal } from '@/components/ui/overlays'

const EMPTY_SEARCH: Omit<SavedSearch, 'id' | 'user_id' | 'created_at' | 'last_run_at'> = {
  name: '',
  keywords: [],
  seniority: [],
  locations: [],
  remote_only: false,
  salary_floor: null,
  industries_include: [],
  industries_exclude: [],
  company_size: [],
  channels: ['Greenhouse', 'Lever', 'Ashby'],
  fit_threshold: 65,
  auto_draft: false,
  digest: 'daily',
  is_active: true,
}

export function DiscoveryPage() {
  const navigate = useNavigate()
  const searches = useAsync(() => api.discovery.listSearches(), [])
  const jobs = useAsync(() => api.discovery.listJobs(), [])
  const [filter, setFilter] = useState<DiscoveredStatus[]>(['new', 'drafted', 'reviewed'])
  const [minScore, setMinScore] = useState(0)
  const [scanning, setScanning] = useState<string | null>(null)
  const [preparing, setPreparing] = useState<string | null>(null)
  const [editing, setEditing] = useState<SavedSearch | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SavedSearch | null>(null)

  const rows = useMemo(
    () =>
      (jobs.data ?? []).filter(
        (job) => (filter.length === 0 || filter.includes(job.status)) && job.match_score >= minScore,
      ),
    [jobs.data, filter, minScore],
  )

  const runScan = async (search: SavedSearch) => {
    setScanning(search.id)
    try {
      const result = await api.discovery.runScan(search.id)
      toast.success(
        `Scan complete: ${result.found.length} new`,
        result.drafted
          ? `${result.drafted} drafts queued for your review — nothing was submitted.`
          : 'Nothing above your fit threshold needed a draft.',
      )
      jobs.reload()
      searches.reload()
    } catch (err) {
      toastError(err, 'Scan failed')
    } finally {
      setScanning(null)
    }
  }

  const prepare = async (job: DiscoveredJob) => {
    setPreparing(job.id)
    try {
      const result = await api.discovery.prepare(job.id)
      toast.success('Prepared', 'Tailored draft, cover letter and a tracker entry in “Saved”. You submit it.')
      jobs.reload()
      navigate(`/applications/${result.application.id}`)
    } catch (err) {
      toastError(err, 'Could not prepare the application')
    } finally {
      setPreparing(null)
    }
  }

  const setStatus = async (job: DiscoveredJob, status: DiscoveredStatus) => {
    jobs.setData((prev) => (prev ?? []).map((row) => (row.id === job.id ? { ...row, status } : row)))
    try {
      await api.discovery.setJobStatus(job.id, status)
    } catch (err) {
      toastError(err, 'Could not update')
      jobs.reload()
    }
  }

  if (searches.loading && !searches.data) return <LoadingState label="Loading the discovery agent…" />
  if (searches.error) return <ErrorState error={searches.error} onRetry={searches.reload} />

  const searchRows = searches.data ?? []
  const newCount = (jobs.data ?? []).filter((j) => j.status === 'new').length

  return (
    <div className="mx-auto max-w-[95rem]">
      <PageHeader
        title="Discovery agent"
        subtitle="Finds roles through official job-board APIs and public feeds, ranks them against your master resume, and drafts materials. It stops before applying — you submit on the employer's own site."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            New saved search
          </Button>
        }
      />

      <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
        <p className="text-xs text-brand-900">
          <span className="font-semibold">Level 0 automation, by design.</span> Sourcing uses Greenhouse, Lever,
          Ashby, RemoteOK and Adzuna style public endpoints plus career-page change detection. LinkedIn and Indeed
          are deliberately absent as scrape targets — they are fine to record as a manual application source, but
          automating against a logged-in session puts your account at risk and breaks their terms.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          {searchRows.map((search) => (
            <section key={search.id} className="panel p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink-900">{search.name}</h3>
                  <p className="text-[11px] text-ink-500">
                    {search.last_run_at ? `Last run ${relativeTime(search.last_run_at)}` : 'Never run'} ·{' '}
                    {search.digest === 'off' ? 'no digest' : `${search.digest} digest`}
                  </p>
                </div>
                <Badge tone={search.is_active ? 'success' : 'neutral'}>
                  {search.is_active ? 'active' : 'paused'}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {search.keywords.slice(0, 4).map((k) => (
                  <span key={k} className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">
                    {k}
                  </span>
                ))}
                {search.remote_only && (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">remote only</span>
                )}
                {search.salary_floor && (
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">
                    ≥ {search.salary_floor.toLocaleString()}
                  </span>
                )}
              </div>

              <dl className="mt-3 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Fit threshold</dt>
                  <dd className="tabular-nums text-ink-800">{search.fit_threshold}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Auto-draft</dt>
                  <dd className="text-ink-800">{search.auto_draft ? 'on (queued for review)' : 'off'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Channels</dt>
                  <dd className="text-right text-ink-800">{search.channels.join(', ')}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => runScan(search)} loading={scanning === search.id}>
                  Run scan now
                </Button>
                <Button size="sm" onClick={() => setEditing(search)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(search)} aria-label="Delete search">
                  ✕
                </Button>
              </div>
            </section>
          ))}

          {searchRows.length === 0 && (
            <div className="panel">
              <EmptyState
                icon="◎"
                title="No saved searches"
                body="Describe the role you want once. The agent re-runs it on your schedule and ranks what it finds against your master resume."
                action={
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    Create one
                  </Button>
                }
              />
            </div>
          )}
        </aside>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(DISCOVERED_STATUS_LABELS) as DiscoveredStatus[]).map((status) => (
              <Pill
                key={status}
                active={filter.includes(status)}
                onClick={() =>
                  setFilter((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]))
                }
              >
                {DISCOVERED_STATUS_LABELS[status]}
                <span className="ml-1 tabular-nums text-ink-400">
                  {(jobs.data ?? []).filter((j) => j.status === status).length}
                </span>
              </Pill>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs text-ink-500" htmlFor="minScore">
                Min fit
              </label>
              <input
                id="minScore"
                type="range"
                min={0}
                max={100}
                step={5}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-28"
              />
              <span className="w-6 text-xs tabular-nums text-ink-700">{minScore}</span>
            </div>
          </div>

          {newCount > 0 && (
            <div className="rounded-xl border border-ink-200 bg-surface p-3">
              <p className="text-xs text-ink-700">
                <span className="font-semibold">{newCount} new match{newCount === 1 ? '' : 'es'}</span> since your
                last review. Batch-review them here rather than one at a time.
              </p>
            </div>
          )}

          {preparing && (
            <GeneratingState
              title="Preparing the application"
              steps={[
                'Tailoring your master resume to this posting',
                'Drafting a cover letter',
                'Validating every claim against your profile',
                'Creating a tracker entry in “Saved”',
              ]}
            />
          )}

          {jobs.loading && !jobs.data ? (
            <LoadingState label="Loading matches…" />
          ) : rows.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon="◎"
                title="No matches to review"
                body="Run a scan, or loosen the filters above."
              />
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((job) => (
                <li key={job.id} className="panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink-900">{job.role_title}</h3>
                        <Badge
                          tone={job.status === 'new' ? 'brand' : job.status === 'dismissed' ? 'neutral' : 'info'}
                        >
                          {DISCOVERED_STATUS_LABELS[job.status]}
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-600">
                        {job.company_name} · {job.location}
                        {job.remote && ' · remote'} · via {job.channel}
                        {job.salary_text && ` · ${job.salary_text}`}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {job.match_reasons.map((reason) => (
                          <span
                            key={reason}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px]',
                              reason.startsWith('Missing')
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-emerald-50 text-emerald-800',
                            )}
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="w-40 shrink-0">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-ink-500">fit</span>
                        <span className="text-sm font-semibold tabular-nums text-ink-900">{job.match_score}</span>
                      </div>
                      <Progress
                        value={job.match_score}
                        tone={job.match_score >= 75 ? 'success' : job.match_score >= 60 ? 'brand' : 'warning'}
                        className="mt-1"
                      />
                      <p className="mt-1 text-right text-[10px] text-ink-400">{relativeTime(job.discovered_at)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => prepare(job)}
                      loading={preparing === job.id}
                      disabled={job.status === 'prepared'}
                    >
                      {job.status === 'prepared' ? 'Prepared' : 'Prepare application'}
                    </Button>
                    <Link
                      to={`/job-descriptions/${job.job_description_id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-ink-200 px-2.5 text-xs font-medium text-ink-800 hover:bg-ink-50"
                    >
                      See parsed JD
                    </Link>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center rounded-lg border border-ink-200 px-2.5 text-xs font-medium text-ink-800 hover:bg-ink-50"
                      title="Opens the employer's own posting — you apply there"
                    >
                      Apply on their site ↗
                    </a>
                    <div className="flex-1" />
                    {job.status !== 'dismissed' ? (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(job, 'dismissed')}>
                        Dismiss
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(job, 'new')}>
                        Restore
                      </Button>
                    )}
                    {job.application_id && (
                      <Link to={`/applications/${job.application_id}`} className="link text-xs">
                        Open tracker entry →
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Hint>
            “Prepare application” tailors your resume, drafts a cover letter, and creates a tracker entry in{' '}
            <em>Saved</em> status. It never submits anything on your behalf.
          </Hint>
        </div>
      </div>

      <SearchEditor
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          searches.reload()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.discovery.removeSearch(deleting.id)
            toast.success('Search deleted')
            setDeleting(null)
            searches.reload()
            jobs.reload()
          } catch (err) {
            toastError(err, 'Could not delete')
          }
        }}
        title={`Delete “${deleting?.name}”?`}
        body="Matches found by this search are removed from the feed. Applications you already prepared stay in the tracker."
        confirmLabel="Delete"
        destructive
      />
    </div>
  )
}

function SearchEditor({
  value,
  onClose,
  onSaved,
}: {
  value: SavedSearch | 'new' | null
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = value === 'new'
  const [form, setForm] = useState(() => (isNew || !value ? EMPTY_SEARCH : value))
  const [pending, setPending] = useState(false)
  const [key, setKey] = useState('')

  // Re-seed the form whenever a different search is opened.
  const currentKey = value === 'new' ? 'new' : (value?.id ?? '')
  if (currentKey !== key) {
    setKey(currentKey)
    setForm(value === 'new' || !value ? EMPTY_SEARCH : value)
  }

  const save = async () => {
    setPending(true)
    try {
      if (isNew) await api.discovery.createSearch({ ...form, name: form.name.trim() || 'Untitled search' })
      else if (value) await api.discovery.updateSearch(value.id, form)
      toast.success(isNew ? 'Search created' : 'Search updated')
      onSaved()
    } catch (err) {
      toastError(err, 'Could not save the search')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={isNew ? 'New saved search' : 'Edit saved search'}
      subtitle="The agent re-runs this on your schedule and scores every result against your master resume."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={pending}>
            {isNew ? 'Create' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Senior backend — UK / remote EU"
          />
        </Field>

        <Field label="Title keywords" hint="Matched against the role title and the posting body.">
          <TagInput
            value={form.keywords}
            onChange={(keywords) => setForm({ ...form, keywords })}
            placeholder="backend engineer, platform engineer…"
            suggestions={['backend engineer', 'platform engineer', 'staff engineer', 'python', 'data engineer']}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Locations">
            <TagInput
              value={form.locations}
              onChange={(locations) => setForm({ ...form, locations })}
              placeholder="London, Remote (EU)…"
            />
          </Field>
          <Field label="Salary floor" hint="Postings without comp data are kept and flagged.">
            <Input
              type="number"
              value={form.salary_floor ?? ''}
              onChange={(e) => setForm({ ...form, salary_floor: e.target.value ? Number(e.target.value) : null })}
              placeholder="95000"
            />
          </Field>
        </div>

        <div>
          <span className="label">Seniority</span>
          <div className="flex flex-wrap gap-1.5">
            {SENIORITY_LEVELS.map((level) => (
              <Pill
                key={level}
                active={form.seniority.includes(level)}
                onClick={() =>
                  setForm({
                    ...form,
                    seniority: form.seniority.includes(level)
                      ? form.seniority.filter((s) => s !== level)
                      : [...form.seniority, level as Seniority],
                  })
                }
              >
                {level}
              </Pill>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Channels</span>
          <div className="flex flex-wrap gap-1.5">
            {DISCOVERY_CHANNELS.map((channel) => (
              <Pill
                key={channel}
                active={form.channels.includes(channel)}
                onClick={() =>
                  setForm({
                    ...form,
                    channels: form.channels.includes(channel)
                      ? form.channels.filter((c) => c !== channel)
                      : [...form.channels, channel as ApplicationSource],
                  })
                }
              >
                {channel}
              </Pill>
            ))}
          </div>
          <Hint className="mt-1.5">
            Only sources with an official API, a public JSON endpoint, or a feed. This list is intentionally short.
          </Hint>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Industries to include">
            <TagInput
              value={form.industries_include}
              onChange={(industries_include) => setForm({ ...form, industries_include })}
              placeholder="fintech, health…"
            />
          </Field>
          <Field label="Industries to exclude">
            <TagInput
              value={form.industries_exclude}
              onChange={(industries_exclude) => setForm({ ...form, industries_exclude })}
              placeholder="gambling, defence…"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fit threshold" hint="Below this, a match is listed but never auto-drafted.">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.fit_threshold}
              onChange={(e) => setForm({ ...form, fit_threshold: Number(e.target.value) })}
            />
          </Field>
          <Field label="Digest">
            <Select
              value={form.digest}
              onChange={(e) => setForm({ ...form, digest: e.target.value as SavedSearch['digest'] })}
            >
              <option value="off">Off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-ink-200 p-3">
          <Switch
            checked={form.auto_draft}
            onChange={(auto_draft) => setForm({ ...form, auto_draft })}
            label="Auto-draft materials above the threshold"
            hint="Queues a tailored resume and cover letter for review. Never submits."
          />
          <Switch
            checked={form.is_active}
            onChange={(is_active) => setForm({ ...form, is_active })}
            label="Search is active"
            hint="Pause it without losing the criteria."
          />
          <Checkbox
            checked={form.remote_only}
            onChange={(remote_only) => setForm({ ...form, remote_only })}
            label="Remote roles only"
          />
        </div>
      </div>
    </Modal>
  )
}
