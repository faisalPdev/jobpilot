import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { InterviewPrepSession, InterviewQuestion, QuestionKind } from '@/types'
import { api } from '@/lib/api'
import { cn, download, relativeTime, slugify } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, PageHeader, Pill } from '@/components/ui/primitives'
import { EmptyState, ErrorState, LoadingState, Progress } from '@/components/ui/feedback'
import { Textarea } from '@/components/ui/inputs'
import { Tabs } from '@/components/ui/data'

const KIND_TONES: Record<QuestionKind, 'brand' | 'info' | 'neutral' | 'warning' | 'success'> = {
  behavioral: 'info',
  technical: 'brand',
  domain: 'warning',
  culture: 'neutral',
  closing: 'success',
}

export function InterviewSessionPage() {
  const { sessionId = '' } = useParams()
  const session = useAsync(() => api.interview.getSession(sessionId), [sessionId])
  const jds = useAsync(() => api.jds.list(), [])
  const [tab, setTab] = useState<'questions' | 'brief' | 'mock'>('questions')
  const [kindFilter, setKindFilter] = useState<QuestionKind | ''>('')
  const [drafting, setDrafting] = useState<string | null>(null)

  const setSession = (next: InterviewPrepSession) => session.setData(next)

  const draftStar = async (question: InterviewQuestion) => {
    setDrafting(question.id)
    try {
      const updated = await api.interview.draftStar(sessionId, question.id)
      if (session.data) {
        setSession({
          ...session.data,
          questions: session.data.questions.map((q) => (q.id === updated.id ? updated : q)),
        })
      }
    } catch (err) {
      toastError(err, 'Could not draft an answer')
    } finally {
      setDrafting(null)
    }
  }

  const saveToBank = async (question: InterviewQuestion) => {
    try {
      await api.interview.saveToBank(sessionId, question.id)
      toast.success('Saved to your question bank')
      session.reload()
    } catch (err) {
      toastError(err, 'Could not save')
    }
  }

  if (session.loading && !session.data) return <LoadingState label="Loading the session…" />
  if (session.error) return <ErrorState error={session.error} onRetry={session.reload} />
  if (!session.data) return null

  const data = session.data
  const jd = jds.data?.find((row) => row.id === data.job_description_id)
  const questions = kindFilter ? data.questions.filter((q) => q.kind === kindFilter) : data.questions
  const drafted = data.questions.filter((q) => q.star_draft).length

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={jd ? `${jd.role_title} — interview prep` : 'Interview prep'}
        subtitle={
          <>
            {jd?.company_name} · {data.questions.length} questions · {drafted} STAR drafts ·{' '}
            <Link to="/interview-prep" className="link">
              all sessions
            </Link>
          </>
        }
        actions={
          <>
            <Button
              onClick={() =>
                download(
                  `interview-prep-${slugify(jd?.company_name ?? 'session')}.md`,
                  exportMarkdown(data, jd?.company_name ?? '', jd?.role_title ?? ''),
                  'text/markdown',
                )
              }
            >
              Export brief
            </Button>
            {data.application_id && (
              <Link
                to={`/applications/${data.application_id}`}
                className="inline-flex h-9 items-center rounded-lg border border-ink-200 bg-surface px-3 text-sm font-medium text-ink-800 hover:bg-ink-50"
              >
                Open application
              </Link>
            )}
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'questions', label: 'Questions', count: data.questions.length },
          { id: 'brief', label: 'Company brief' },
          { id: 'mock', label: 'Mock interview', count: data.transcript.filter((t) => t.role === 'candidate').length },
        ]}
        className="mb-4"
      />

      {tab === 'questions' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Pill active={kindFilter === ''} onClick={() => setKindFilter('')}>
              All ({data.questions.length})
            </Pill>
            {(['technical', 'behavioral', 'domain', 'culture', 'closing'] as QuestionKind[]).map((kind) => (
              <Pill key={kind} active={kindFilter === kind} onClick={() => setKindFilter(kind)}>
                {kind} ({data.questions.filter((q) => q.kind === kind).length})
              </Pill>
            ))}
          </div>

          <ul className="space-y-2">
            {questions.map((question) => (
              <li key={question.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{question.question}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={KIND_TONES[question.kind]}>{question.kind}</Badge>
                      <Badge tone={question.difficulty === 'hard' ? 'danger' : 'neutral'}>
                        {question.difficulty}
                      </Badge>
                      {question.from_requirement && (
                        <span className="text-[11px] text-ink-500">from: {question.from_requirement}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!question.star_draft && (
                      <Button size="sm" onClick={() => draftStar(question)} loading={drafting === question.id}>
                        Draft STAR answer
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={question.saved_to_bank ? 'subtle' : 'secondary'}
                      onClick={() => saveToBank(question)}
                      disabled={question.saved_to_bank}
                    >
                      {question.saved_to_bank ? 'In bank' : 'Save'}
                    </Button>
                  </div>
                </div>

                {question.star_draft && (
                  <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <StarField label="Situation" value={question.star_draft.situation} />
                      <StarField label="Task" value={question.star_draft.task} />
                      <StarField label="Action" value={question.star_draft.action} />
                      <StarField label="Result" value={question.star_draft.result} />
                    </div>
                    <div className="mt-2 border-t border-ink-200 pt-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                        Grounded in
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {question.star_draft.sources.map((source, i) => (
                          <li key={i} className="text-[11px] text-ink-600">
                            ↳ {source}
                          </li>
                        ))}
                      </ul>
                      <Hint className="mt-1.5">
                        Assembled from bullets you wrote. If a draft is thin, that usually means the underlying
                        bullet needs a number — fix it in the resume and regenerate.
                      </Hint>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'brief' && data.company_brief && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel p-4">
            <h3 className="text-sm font-semibold text-ink-900">{data.company_brief.company_name}</h3>
            <p className="mt-1 text-sm text-ink-700">{data.company_brief.one_liner}</p>
            <p className="mt-3 text-sm text-ink-700">{data.company_brief.what_they_do}</p>

            {data.company_brief.mission_values.length > 0 && (
              <>
                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  What the posting emphasises
                </h4>
                <ul className="mt-1.5 space-y-1">
                  {data.company_brief.mission_values.map((value) => (
                    <li key={value} className="text-xs text-ink-700">
                      • {value}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[11px] text-amber-900">{data.company_brief.disclaimer}</p>
            </div>
          </section>

          <div className="space-y-4">
            <section className="panel p-4">
              <h3 className="text-sm font-semibold text-ink-900">Likely themes</h3>
              <ul className="mt-2 space-y-1.5">
                {data.company_brief.interview_themes.map((theme) => (
                  <li key={theme} className="flex gap-2 text-xs text-ink-700">
                    <span className="text-brand-500">▸</span>
                    {theme}
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel p-4">
              <h3 className="text-sm font-semibold text-ink-900">Questions to ask them</h3>
              <ul className="mt-2 space-y-1.5">
                {data.company_brief.questions_to_ask.map((question) => (
                  <li key={question} className="text-xs text-ink-700">
                    • {question}
                  </li>
                ))}
              </ul>
              <Hint className="mt-2">
                Asking nothing reads as disinterest. Pick two and write down the answers you get.
              </Hint>
            </section>
          </div>
        </div>
      )}

      {tab === 'mock' && <MockInterview session={data} onChange={setSession} />}
    </div>
  )
}

function StarField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <p className="mt-0.5 text-xs text-ink-800">{value}</p>
    </div>
  )
}

/** Chat-based mock round with per-answer feedback (§7). */
function MockInterview({
  session,
  onChange,
}: {
  session: InterviewPrepSession
  onChange: (next: InterviewPrepSession) => void
}) {
  const [answer, setAnswer] = useState('')
  const [pending, setPending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const lastInterviewerTurn = [...session.transcript].reverse().find((t) => t.role === 'interviewer')
  const awaitingAnswer =
    lastInterviewerTurn &&
    !session.transcript.some(
      (t) => t.role === 'candidate' && t.question_id === lastInterviewerTurn.question_id,
    )

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [session.transcript.length])

  const askNext = async () => {
    setPending(true)
    try {
      onChange(await api.interview.askNext(session.id))
    } catch (err) {
      toastError(err, 'Could not fetch the next question')
    } finally {
      setPending(false)
    }
  }

  const submit = async () => {
    if (!answer.trim() || !lastInterviewerTurn) return
    setPending(true)
    try {
      const result = await api.interview.answerMock(session.id, {
        question_id: lastInterviewerTurn.question_id ?? '',
        answer: answer.trim(),
      })
      onChange(result.session)
      setAnswer('')
    } catch (err) {
      toastError(err, 'Could not score that answer')
    } finally {
      setPending(false)
    }
  }

  const reset = async () => {
    try {
      onChange(await api.interview.resetMock(session.id))
      toast.success('Transcript cleared')
    } catch (err) {
      toastError(err, 'Could not reset')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="panel flex flex-col">
        <div className="scrollbar-thin max-h-[34rem] flex-1 space-y-3 overflow-y-auto p-4">
          {session.transcript.length === 0 ? (
            <EmptyState
              icon="✻"
              title="Mock round"
              body="One question at a time, from this session's set. Type your answer as you would say it — feedback covers structure, specificity and length."
              action={
                <Button variant="primary" onClick={askNext} loading={pending}>
                  Ask the first question
                </Button>
              }
            />
          ) : (
            session.transcript.map((turn) => (
              <div
                key={turn.id}
                className={cn(
                  'max-w-[85%] rounded-xl p-3',
                  turn.role === 'interviewer'
                    ? 'bg-ink-100 text-ink-900'
                    : turn.role === 'candidate'
                      ? 'ml-auto bg-primary text-on-primary'
                      : 'border border-ink-200 bg-surface',
                )}
              >
                {turn.role === 'feedback' && turn.feedback ? (
                  <FeedbackCard body={turn.body} feedback={turn.feedback} />
                ) : (
                  <>
                    <div
                      className={cn(
                        'mb-1 text-[10px] font-semibold uppercase tracking-wide',
                        turn.role === 'candidate' ? 'text-brand-100' : 'text-ink-500',
                      )}
                    >
                      {turn.role === 'interviewer' ? 'Interviewer' : 'You'}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{turn.body}</p>
                    <div
                      className={cn(
                        'mt-1 text-[10px]',
                        turn.role === 'candidate' ? 'text-brand-200' : 'text-ink-400',
                      )}
                    >
                      {relativeTime(turn.created_at)}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {session.transcript.length > 0 && (
          <div className="border-t border-ink-100 p-3">
            {awaitingAnswer ? (
              <>
                <Textarea
                  rows={4}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Answer as you would out loud — context, what you did, the outcome…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-400">
                    {answer.split(/\s+/).filter(Boolean).length} words · Ctrl/Cmd + Enter to submit
                  </span>
                  <Button variant="primary" size="sm" onClick={submit} loading={pending} disabled={!answer.trim()}>
                    Submit answer
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <Button variant="primary" size="sm" onClick={askNext} loading={pending}>
                  Next question
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  Clear transcript
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="panel h-fit p-4">
        <h3 className="text-sm font-semibold text-ink-900">How answers are scored</h3>
        <ul className="mt-2 space-y-2 text-xs text-ink-600">
          <li>
            <span className="font-medium text-ink-800">Structure (0–10)</span> — is there context, your own action,
            and an outcome?
          </li>
          <li>
            <span className="font-medium text-ink-800">Specificity (0–10)</span> — real numbers, named tools,
            concrete scale.
          </li>
          <li>
            <span className="font-medium text-ink-800">Length (0–10)</span> — 150–250 words is roughly 90 seconds
            spoken.
          </li>
        </ul>
        <Hint className="mt-3">
          The feedback is mechanical on purpose: it catches the failure modes that lose interviews (no numbers,
          "we" instead of "I", rambling) rather than judging your career.
        </Hint>
      </aside>
    </div>
  )
}

function FeedbackCard({ body, feedback }: { body: string; feedback: NonNullable<import('@/types').MockTurn['feedback']> }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Feedback</span>
        <div className="flex items-center gap-2">
          <Badge tone={feedback.used_star ? 'success' : 'warning'}>
            {feedback.used_star ? 'STAR intact' : 'STAR incomplete'}
          </Badge>
          <span className="text-sm font-semibold tabular-nums text-ink-900">{feedback.overall}/10</span>
        </div>
      </div>
      <p className="text-sm text-ink-800">{body}</p>

      <div className="mt-2 space-y-1.5">
        <Bar label="Structure" value={feedback.structure} />
        <Bar label="Specificity" value={feedback.specificity} />
        <Bar label="Length" value={feedback.length} />
      </div>

      {feedback.strengths.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {feedback.strengths.map((s) => (
            <li key={s} className="text-[11px] text-emerald-700">
              ✓ {s}
            </li>
          ))}
        </ul>
      )}
      {feedback.improvements.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {feedback.improvements.map((s) => (
            <li key={s} className="text-[11px] text-amber-700">
              ▲ {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[11px] text-ink-500">{label}</span>
      <Progress value={value} max={10} tone={value >= 7 ? 'success' : value >= 4 ? 'warning' : 'danger'} />
      <span className="w-8 text-right text-[11px] tabular-nums text-ink-600">{value}</span>
    </div>
  )
}

function exportMarkdown(session: InterviewPrepSession, company: string, role: string) {
  const lines: string[] = [`# Interview prep — ${role} at ${company}`, '']
  if (session.company_brief) {
    lines.push('## Company brief', '', session.company_brief.one_liner, '', session.company_brief.what_they_do, '')
    lines.push('### Likely themes', '')
    session.company_brief.interview_themes.forEach((t) => lines.push(`- ${t}`))
    lines.push('', '### Questions to ask', '')
    session.company_brief.questions_to_ask.forEach((q) => lines.push(`- ${q}`))
    lines.push('', `> ${session.company_brief.disclaimer}`, '')
  }
  lines.push('## Questions', '')
  for (const question of session.questions) {
    lines.push(`### ${question.question}`, '', `*${question.kind} · ${question.difficulty} · ${question.from_requirement}*`, '')
    if (question.star_draft) {
      lines.push(
        `- **Situation:** ${question.star_draft.situation}`,
        `- **Task:** ${question.star_draft.task}`,
        `- **Action:** ${question.star_draft.action}`,
        `- **Result:** ${question.star_draft.result}`,
        '',
        `Grounded in: ${question.star_draft.sources.join('; ')}`,
        '',
      )
    }
  }
  return lines.join('\n')
}
