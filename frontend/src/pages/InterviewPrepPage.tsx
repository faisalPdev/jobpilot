import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { relativeTime } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, PageHeader, Pill } from '@/components/ui/primitives'
import { EmptyState, ErrorState, GeneratingState, LoadingState } from '@/components/ui/feedback'
import { Field, Select } from '@/components/ui/inputs'
import { Tabs } from '@/components/ui/data'

export function InterviewPrepPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessions = useAsync(() => api.interview.listSessions(), [])
  const jds = useAsync(() => api.jds.list(), [])
  const applications = useAsync(() => api.applications.list(), [])
  const resumes = useAsync(() => api.resumes.list(), [])
  const bank = useAsync(() => api.interview.listBank(), [])

  const [tab, setTab] = useState<'sessions' | 'bank'>('sessions')
  const [jdId, setJdId] = useState(params.get('jd') ?? '')
  const [applicationId, setApplicationId] = useState(params.get('application') ?? '')
  const [resumeId, setResumeId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [bankFilter, setBankFilter] = useState('')

  useEffect(() => {
    // Freeform documents have no structured fields to read, so they are not
    // offered here at all.
    const usable = (resumes.data ?? []).filter((r) => r.mode !== 'freeform')
    if (!resumeId && usable.length) {
      setResumeId(usable.find((r) => r.is_master)?.id ?? usable[0].id)
    }
  }, [resumes.data, resumeId])

  // Arriving from an application: adopt its posting automatically.
  useEffect(() => {
    if (!applicationId || jdId) return
    const app = applications.data?.find((row) => row.id === applicationId)
    if (app?.job_description_id) setJdId(app.job_description_id)
    if (app?.resume_id) setResumeId(app.resume_id)
  }, [applicationId, applications.data, jdId])

  const generate = async () => {
    if (!jdId) {
      toast.info('Pick a job description first')
      return
    }
    setGenerating(true)
    try {
      const session = await api.interview.generate({
        job_description_id: jdId,
        application_id: applicationId || null,
        resume_id: resumeId || null,
      })
      toast.success(`${session.questions.length} questions generated`)
      navigate(`/interview-prep/${session.id}`)
    } catch (err) {
      toastError(err, 'Could not generate the question set')
    } finally {
      setGenerating(false)
    }
  }

  if (sessions.loading && !sessions.data) return <LoadingState label="Loading interview prep…" />
  if (sessions.error) return <ErrorState error={sessions.error} onRetry={sessions.reload} />

  const rows = sessions.data ?? []
  const bankRows = (bank.data ?? []).filter((row) =>
    bankFilter ? row.kind === bankFilter : true,
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Interview preparation"
        subtitle="Questions derived from the specific posting, STAR drafts built from your own bullets, and a mock round that gives feedback on structure and specificity."
      />

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="panel h-fit p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">New prep session</h3>
          <div className="space-y-3">
            <Field label="Job description" hint="Questions come from this posting's requirements.">
              <Select value={jdId} onChange={(e) => setJdId(e.target.value)}>
                <option value="">Select a posting…</option>
                {(jds.data ?? []).map((jd) => (
                  <option key={jd.id} value={jd.id}>
                    {jd.role_title} — {jd.company_name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Link to an application" hint="Optional, keeps prep next to the record.">
              <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
                <option value="">Not linked</option>
                {(applications.data ?? []).map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.role_title} — {app.company_name} ({app.status})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Ground answers in" hint="STAR drafts are assembled from this resume's bullets only.">
              <Select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                {(resumes.data ?? []).filter((r) => r.mode !== 'freeform').map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.title}
                    {resume.is_master ? ' (master)' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Button variant="primary" className="w-full justify-center" onClick={generate} loading={generating} disabled={!jdId}>
              Generate questions
            </Button>

            {(jds.data ?? []).length === 0 && (
              <Hint>
                No postings yet.{' '}
                <Link to="/job-descriptions" className="link">
                  Add a job description
                </Link>{' '}
                first — a generic question bank is not worth much.
              </Hint>
            )}
          </div>
        </section>

        <div>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'sessions', label: 'Sessions', count: rows.length },
              { id: 'bank', label: 'Question bank', count: bank.data?.length },
            ]}
            className="mb-4"
          />

          {generating && (
            <GeneratingState
              className="mb-3"
              title="Building your prep"
              steps={[
                'Reading each requirement in the posting',
                'Writing role-specific technical questions',
                'Adding behavioural questions per must-have',
                'Assembling a company brief from the posting',
              ]}
            />
          )}

          {tab === 'sessions' &&
            (rows.length === 0 ? (
              <div className="panel">
                <EmptyState
                  icon="✻"
                  title="No prep sessions yet"
                  body="Pick a posting on the left. You get technical, behavioural, domain and culture questions traced back to the requirement that prompted them."
                />
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((session) => {
                  const jd = jds.data?.find((row) => row.id === session.job_description_id)
                  const drafted = session.questions.filter((q) => q.star_draft).length
                  const answered = session.transcript.filter((t) => t.role === 'candidate').length
                  return (
                    <li key={session.id} className="panel p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/interview-prep/${session.id}`}
                            className="text-sm font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {jd?.role_title ?? 'Prep session'}
                          </Link>
                          <p className="text-xs text-ink-600">
                            {jd?.company_name ?? 'Posting removed'} · created {relativeTime(session.created_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone="neutral">{session.questions.length} questions</Badge>
                          {drafted > 0 && <Badge tone="brand">{drafted} STAR drafts</Badge>}
                          {answered > 0 && <Badge tone="success">{answered} answered</Badge>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          to={`/interview-prep/${session.id}`}
                          className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-xs font-medium text-on-primary hover:bg-primary-hover"
                        >
                          Open
                        </Link>
                        {session.application_id && (
                          <Link
                            to={`/applications/${session.application_id}`}
                            className="inline-flex h-8 items-center rounded-lg border border-ink-200 px-2.5 text-xs font-medium text-ink-800 hover:bg-ink-50"
                          >
                            Application
                          </Link>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ))}

          {tab === 'bank' &&
            (bankRows.length === 0 ? (
              <div className="panel">
                <EmptyState
                  icon="❑"
                  title="Nothing saved to the bank"
                  body="Save the questions worth rehearsing from a session — they become reusable across similar roles."
                />
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {['', 'behavioral', 'technical', 'domain', 'culture', 'closing'].map((kind) => (
                    <Pill key={kind || 'all'} active={bankFilter === kind} onClick={() => setBankFilter(kind)}>
                      {kind === '' ? 'All' : kind}
                    </Pill>
                  ))}
                </div>
                <ul className="space-y-2">
                  {bankRows.map((row) => (
                    <li key={row.bank_id} className="panel p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-ink-900">{row.question}</p>
                          <p className="mt-1 text-[11px] text-ink-500">
                            {row.kind} · {row.difficulty} · from {row.role_title} @ {row.company_name} ·{' '}
                            {relativeTime(row.saved_at)}
                          </p>
                          {row.star_draft && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs font-medium text-brand-700">
                                Saved STAR draft
                              </summary>
                              <dl className="mt-1.5 space-y-1 text-[11px]">
                                <StarRow label="S" value={row.star_draft.situation} />
                                <StarRow label="T" value={row.star_draft.task} />
                                <StarRow label="A" value={row.star_draft.action} />
                                <StarRow label="R" value={row.star_draft.result} />
                              </dl>
                            </details>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove from bank"
                          onClick={async () => {
                            await api.interview.removeFromBank(row.bank_id)
                            bank.reload()
                          }}
                        >
                          ✕
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ))}
        </div>
      </div>
    </div>
  )
}

function StarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-4 shrink-0 font-semibold text-ink-500">{label}</dt>
      <dd className="text-ink-700">{value}</dd>
    </div>
  )
}
