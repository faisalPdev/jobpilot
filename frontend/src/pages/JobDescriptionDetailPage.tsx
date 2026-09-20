import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, LinkButton, PageHeader } from '@/components/ui/primitives'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { Field, Select } from '@/components/ui/inputs'
import { Tabs } from '@/components/ui/data'
import { MatchReportView, RequirementList } from '@/components/jd/MatchReportView'

export function JobDescriptionDetailPage() {
  const { jdId = '' } = useParams()
  const navigate = useNavigate()
  const jd = useAsync(() => api.jds.get(jdId), [jdId])
  const resumes = useAsync(() => api.resumes.list(), [])
  const [resumeId, setResumeId] = useState('')
  const [tab, setTab] = useState<'match' | 'requirements' | 'raw'>('match')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    // Freeform documents have no structured fields to read, so they are not
    // offered here at all.
    const usable = (resumes.data ?? []).filter((r) => r.mode !== 'freeform')
    if (!resumeId && usable.length) {
      setResumeId(usable.find((r) => r.is_master)?.id ?? usable[0].id)
    }
  }, [resumes.data, resumeId])

  const match = useAsync(
    () => (resumeId ? api.jds.match(jdId, resumeId) : Promise.resolve(null)),
    [jdId, resumeId],
  )

  const trackIt = async () => {
    if (!jd.data) return
    setCreating(true)
    try {
      const duplicate = await api.applications.checkDuplicate({
        company_name: jd.data.company_name,
        role_title: jd.data.role_title,
      })
      if (duplicate?.reason === 'exact') {
        toast.info(
          'You already tracked this one',
          `${duplicate.role_title} at ${duplicate.company_name} — currently ${duplicate.status}.`,
        )
        navigate(`/applications/${duplicate.application_id}`)
        return
      }
      const app = await api.applications.create({
        company_name: jd.data.company_name,
        role_title: jd.data.role_title,
        location: jd.data.parsed.location,
        source: jd.data.source,
        status: 'Saved',
        job_description_id: jd.data.id,
        resume_id: resumeId || null,
        match_score: match.data ? Math.round(match.data.score) : null,
        salary_text: jd.data.parsed.salary_text ?? '',
        jd_snapshot: jd.data.raw_text,
      })
      toast.success('Added to the tracker', 'Saved — you still own the submit.')
      navigate(`/applications/${app.id}`)
    } catch (err) {
      toastError(err, 'Could not add to the tracker')
    } finally {
      setCreating(false)
    }
  }

  if (jd.loading && !jd.data) return <LoadingState label="Loading the posting…" />
  if (jd.error) return <ErrorState error={jd.error} onRetry={jd.reload} />
  if (!jd.data) return null

  const parsed = jd.data.parsed

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={parsed.role_title}
        subtitle={
          <>
            {jd.data.company_name} · {parsed.location}
            {parsed.remote && ' · remote'} · added {formatDate(jd.data.created_at)} ·{' '}
            <Link to="/job-descriptions" className="link">
              all job descriptions
            </Link>
          </>
        }
        actions={
          <>
            <Button onClick={trackIt} loading={creating}>
              Track this role
            </Button>
            <LinkButton to={`/tailor?jd=${jd.data.id}`} variant="primary">
              Tailor resume &amp; cover letter
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="panel p-4">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'match', label: 'Match & gap' },
              { id: 'requirements', label: 'Parsed requirements', count: parsed.requirements.length },
              { id: 'raw', label: 'Original text' },
            ]}
            className="mb-4"
          />

          {tab === 'match' && (
            <>
              <div className="mb-4 max-w-xs">
                <Field label="Score against">
                  <Select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                    {(resumes.data ?? []).filter((r) => r.mode !== 'freeform').map((resume) => (
                      <option key={resume.id} value={resume.id}>
                        {resume.title}
                        {resume.is_master ? ' (master)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {match.loading && <LoadingState label="Scoring…" />}
              {match.error && <ErrorState error={match.error} onRetry={match.reload} />}
              {match.data && <MatchReportView report={match.data} jd={parsed} />}
            </>
          )}

          {tab === 'requirements' && <RequirementList jd={parsed} />}

          {tab === 'raw' && (
            <div>
              {jd.data.source_url && (
                <a href={jd.data.source_url} target="_blank" rel="noreferrer" className="link text-xs">
                  {jd.data.source_url}
                </a>
              )}
              <pre className="scrollbar-thin mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-700">
                {jd.data.raw_text}
              </pre>
              <Hint className="mt-2">
                Stored verbatim. Job URLs go dead within weeks, so the snapshot is the record.
              </Hint>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <section className="panel p-4">
            <h3 className="text-sm font-semibold text-ink-900">What the parser extracted</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="Company" value={parsed.company_name} />
              <Row label="Role" value={parsed.role_title} />
              <Row label="Seniority" value={parsed.seniority ?? 'not stated'} />
              <Row
                label="Experience bar"
                value={parsed.years_experience_min != null ? `${parsed.years_experience_min}+ years` : 'not stated'}
              />
              <Row label="Location" value={parsed.location} />
              <Row label="Compensation" value={parsed.salary_text ?? 'not stated'} />
            </dl>
            <Hint className="mt-3">
              Parsing is heuristic-first with an LLM fallback for messy layouts. Anything wrong here can be fixed by
              re-pasting a cleaner copy of the posting.
            </Hint>
          </section>

          <section className="panel p-4">
            <h3 className="text-sm font-semibold text-ink-900">Must-have skills</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {parsed.must_have_skills.map((skill) => (
                <Badge key={skill} tone="brand">
                  {skill}
                </Badge>
              ))}
              {parsed.must_have_skills.length === 0 && <Hint>None detected.</Hint>}
            </div>

            <h3 className="mt-4 text-sm font-semibold text-ink-900">Nice to have</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {parsed.nice_to_have_skills.map((skill) => (
                <Badge key={skill} tone="neutral">
                  {skill}
                </Badge>
              ))}
              {parsed.nice_to_have_skills.length === 0 && <Hint>None detected.</Hint>}
            </div>
          </section>

          <section className="panel p-4">
            <h3 className="text-sm font-semibold text-ink-900">Next steps</h3>
            <div className="mt-2 space-y-2">
              <LinkButton to={`/tailor?jd=${jd.data.id}`} className="w-full justify-center" variant="primary">
                Generate tailored draft
              </LinkButton>
              <LinkButton to={`/interview-prep?jd=${jd.data.id}`} className="w-full justify-center">
                Build interview prep
              </LinkButton>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right capitalize text-ink-800">{value}</dd>
    </div>
  )
}
