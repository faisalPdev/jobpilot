import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { JD_SAMPLES } from '@/lib/mock/jdSamples'
import { SOURCES } from '@/lib/pipeline'
import { relativeTime, wordCount } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, PageHeader } from '@/components/ui/primitives'
import { EmptyState, ErrorState, GeneratingState, LoadingState } from '@/components/ui/feedback'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/inputs'
import { ConfirmDialog, Modal } from '@/components/ui/overlays'

export function JobDescriptionsPage() {
  const navigate = useNavigate()
  const jds = useAsync(() => api.jds.list(), [])
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const remove = async () => {
    if (!deleting) return
    setPending(true)
    try {
      await api.jds.remove(deleting)
      toast.success('Removed')
      setDeleting(null)
      jds.reload()
    } catch (err) {
      toastError(err, 'Could not remove')
    } finally {
      setPending(false)
    }
  }

  if (jds.loading && !jds.data) return <LoadingState label="Loading job descriptions…" />
  if (jds.error) return <ErrorState error={jds.error} onRetry={jds.reload} />

  const rows = (jds.data ?? []).filter((jd) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      jd.company_name.toLowerCase().includes(q) ||
      jd.role_title.toLowerCase().includes(q) ||
      jd.parsed.must_have_skills.some((s) => s.includes(q))
    )
  })

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Job descriptions"
        subtitle="Paste a posting once. It gets parsed into atomic requirements that the matcher, tailoring engine and interview prep all reuse."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add a job description
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <SearchInput value={query} onChange={setQuery} placeholder="Search company, role or skill…" />
      </div>

      {rows.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="❑"
            title={query ? 'Nothing matches that search' : 'No job descriptions yet'}
            body={
              query
                ? 'Try a different company, role or skill.'
                : 'Paste the text of a posting you care about. Parsing is the foundation for match scoring, tailoring and interview questions.'
            }
            action={
              !query && (
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Add one
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((jd) => (
            <article key={jd.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/job-descriptions/${jd.id}`}
                    className="text-sm font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {jd.role_title}
                  </Link>
                  <p className="text-xs text-ink-600">
                    {jd.company_name} · {jd.parsed.location}
                    {jd.parsed.remote && ' · remote'}
                  </p>
                </div>
                <Badge tone="neutral">{jd.source}</Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {jd.parsed.must_have_skills.slice(0, 6).map((skill) => (
                  <span key={skill} className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">
                    {skill}
                  </span>
                ))}
                {jd.parsed.must_have_skills.length > 6 && (
                  <span className="px-1 text-[11px] text-ink-400">
                    +{jd.parsed.must_have_skills.length - 6} more
                  </span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Requirements" value={jd.parsed.requirements.length} />
                <Stat label="Must-haves" value={jd.parsed.must_have_skills.length} />
                <Stat
                  label="Seniority"
                  value={jd.parsed.seniority ?? '—'}
                />
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to={`/job-descriptions/${jd.id}`}
                  className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-xs font-medium text-on-primary hover:bg-primary-hover"
                >
                  Match &amp; gap
                </Link>
                <Link
                  to={`/tailor?jd=${jd.id}`}
                  className="inline-flex h-8 items-center rounded-lg border border-ink-200 px-2.5 text-xs font-medium text-ink-800 hover:bg-ink-50"
                >
                  Tailor
                </Link>
                <Link
                  to={`/interview-prep?jd=${jd.id}`}
                  className="inline-flex h-8 items-center rounded-lg border border-ink-200 px-2.5 text-xs font-medium text-ink-800 hover:bg-ink-50"
                >
                  Prep
                </Link>
                <div className="flex-1" />
                <span className="text-[11px] text-ink-400">{relativeTime(jd.created_at)}</span>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(jd.id)} aria-label="Delete">
                  ✕
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <AddJdModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          jds.reload()
          navigate(`/job-descriptions/${id}`)
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Remove this job description?"
        body="Applications that reference it keep their own frozen JD snapshot, so nothing in the tracker breaks."
        confirmLabel="Remove"
        destructive
        loading={pending}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-ink-50 py-1.5">
      <dd className="text-sm font-semibold capitalize tabular-nums text-ink-900">{value}</dd>
      <dt className="text-[10px] uppercase tracking-wide text-ink-500">{label}</dt>
    </div>
  )
}

export function AddJdModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [mode, setMode] = useState<'paste' | 'url'>('paste')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('Other')
  const [pending, setPending] = useState(false)

  const submit = async () => {
    setPending(true)
    try {
      const jd =
        mode === 'url'
          ? await api.jds.createFromUrl(url)
          : await api.jds.createFromText({ raw_text: text, source_url: url || null, source })
      toast.success('Parsed', `${jd.parsed.requirements.length} requirements extracted.`)
      setText('')
      setUrl('')
      onClose()
      onCreated(jd.id)
    } catch (err) {
      toastError(err, 'Could not add the job description')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a job description"
      subtitle="Paste the text — parsing extracts must-haves, nice-to-haves, responsibilities and seniority."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={pending}
            disabled={mode === 'paste' ? text.trim().length < 60 : !url.trim()}
          >
            Parse
          </Button>
        </>
      }
    >
      {pending ? (
        <GeneratingState
          title="Parsing the posting"
          steps={[
            'Stripping nav and footer boilerplate',
            'Splitting requirements into atoms',
            'Classifying must-have vs nice-to-have',
            'Detecting seniority, location and comp',
          ]}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant={mode === 'paste' ? 'subtle' : 'ghost'} onClick={() => setMode('paste')}>
              Paste text
            </Button>
            <Button size="sm" variant={mode === 'url' ? 'subtle' : 'ghost'} onClick={() => setMode('url')}>
              From URL
            </Button>
          </div>

          {mode === 'url' ? (
            <>
              <Field label="Job posting URL">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://boards.greenhouse.io/…" />
              </Field>
              <Hint>
                Fetching runs server-side against an allowlist of public job boards. In mock mode this is blocked by
                the browser's CORS policy, so paste the text instead — the parse is identical.
              </Hint>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Source" hint="Where you found it — feeds the source-performance analytics.">
                  <Select value={source} onChange={(e) => setSource(e.target.value)}>
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Original URL" hint="Optional, stored for reference.">
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
                </Field>
              </div>

              <Field
                label="Job description text"
                hint={`${wordCount(text)} words — postings under ~60 words rarely parse well.`}
              >
                <Textarea
                  rows={12}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the whole posting, including the requirements and nice-to-have sections…"
                />
              </Field>

              <div>
                <span className="label">Or load a sample</span>
                <div className="flex flex-wrap gap-1.5">
                  {JD_SAMPLES.map((sample) => (
                    <button
                      key={sample.key}
                      type="button"
                      onClick={() => {
                        setText(sample.text)
                        setUrl(sample.url)
                        setSource(sample.channel)
                      }}
                      className="rounded-md border border-dashed border-ink-300 px-2 py-1 text-[11px] text-ink-600 hover:border-brand-300 hover:text-brand-700"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
