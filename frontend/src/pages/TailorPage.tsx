import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { CoverLetter, CoverLetterTone, TailorDraft } from '@/types'
import { api } from '@/lib/api'
import { DEFAULT_TAILOR_OPTIONS, type TailorOptions } from '@/lib/ai/tailor'
import { download, slugify } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, PageHeader } from '@/components/ui/primitives'
import { EmptyState, GeneratingState, LoadingState, ScoreRing } from '@/components/ui/feedback'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/inputs'
import { Modal } from '@/components/ui/overlays'
import { Tabs } from '@/components/ui/data'
import { ResumePreview } from '@/components/resume/ResumePreview'
import { ChangeList, DensityPanel, TruthGuardPanel } from '@/components/tailor/ChangeList'
import { AddJdModal } from './JobDescriptionsPage'

const TONES: { id: CoverLetterTone; label: string; hint: string }[] = [
  { id: 'formal', label: 'Formal', hint: 'Four paragraphs, conventional. Safe for large corporates.' },
  { id: 'conversational', label: 'Conversational', hint: 'Three paragraphs, first person, warmer. Good for startups.' },
  { id: 'concise', label: 'Concise', hint: 'Two short paragraphs. For when the form has a 1000-character limit.' },
]

export function TailorPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const resumes = useAsync(() => api.resumes.list(), [])
  const jds = useAsync(() => api.jds.list(), [])

  const [resumeId, setResumeId] = useState('')
  const [jdId, setJdId] = useState(params.get('jd') ?? '')
  const [options, setOptions] = useState<TailorOptions>(DEFAULT_TAILOR_OPTIONS)
  const [draft, setDraft] = useState<TailorDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [tab, setTab] = useState<'changes' | 'preview' | 'letter'>('changes')
  const [addingJd, setAddingJd] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [variantTitle, setVariantTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const [tone, setTone] = useState<CoverLetterTone>('conversational')
  const [whyCompany, setWhyCompany] = useState('')
  const [letter, setLetter] = useState<CoverLetter | null>(null)
  const [letterPending, setLetterPending] = useState(false)

  useEffect(() => {
    // Freeform documents have no structured fields to read, so they are not
    // offered here at all.
    const usable = (resumes.data ?? []).filter((r) => r.mode !== 'freeform')
    if (!resumeId && usable.length) {
      setResumeId(usable.find((r) => r.is_master)?.id ?? usable[0].id)
    }
  }, [resumes.data, resumeId])

  const jd = jds.data?.find((row) => row.id === jdId) ?? null
  const baseResume = resumes.data?.find((row) => row.id === resumeId) ?? null

  const baseContent = useAsync(
    () => (resumeId ? api.resumes.get(resumeId).then((r) => r.version.content) : Promise.resolve(null)),
    [resumeId],
  )

  const generate = async () => {
    if (!resumeId || !jdId) {
      toast.info('Pick a resume and a job description first')
      return
    }
    setGenerating(true)
    setDraft(null)
    try {
      const result = await api.tailoring.generate({ resume_id: resumeId, job_description_id: jdId, options })
      setDraft(result)
      setVariantTitle(`${jd?.company_name ?? 'Tailored'} — ${jd?.role_title ?? 'variant'}`.slice(0, 60))
      setTab('changes')
      toast.success(
        'Draft ready',
        `${result.changes.length} proposed changes · match ${Math.round(result.match_before)} → ${Math.round(
          result.match_after,
        )}`,
      )
    } catch (err) {
      toastError(err, 'Tailoring failed')
    } finally {
      setGenerating(false)
    }
  }

  const setChanges = async (updater: (changes: TailorDraft['changes']) => TailorDraft['changes']) => {
    if (!draft) return
    const next = updater(draft.changes)
    // Optimistic: the engine re-derives content and rescores from the accepted set.
    setDraft({ ...draft, changes: next })
    try {
      const updated = await api.tailoring.setChanges(draft.id, next)
      setDraft(updated)
    } catch (err) {
      toastError(err, 'Could not update the draft')
    }
  }

  const saveVariant = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const created = await api.tailoring.saveVariant(draft.id, variantTitle.trim() || 'Tailored variant')
      toast.success('Variant saved', 'Linked to this job description, ready to export or attach.')
      setSaveOpen(false)
      navigate(`/resumes/${created.resume.id}`)
    } catch (err) {
      toastError(err, 'Could not save the variant')
    } finally {
      setSaving(false)
    }
  }

  const generateLetter = async () => {
    if (!jdId) return
    setLetterPending(true)
    try {
      const result = await api.coverLetters.generate({
        job_description_id: jdId,
        resume_id: resumeId || null,
        tone,
        why_company_notes: whyCompany,
      })
      setLetter(result)
      setTab('letter')
      toast.success('Cover letter drafted')
    } catch (err) {
      toastError(err, 'Could not draft the cover letter')
    } finally {
      setLetterPending(false)
    }
  }

  const saveLetterEdits = async (content: string) => {
    if (!letter) return
    setLetter({ ...letter, content })
    try {
      await api.coverLetters.update(letter.id, { content })
    } catch (err) {
      toastError(err, 'Could not save the edit')
    }
  }

  const acceptedCount = draft?.changes.filter((c) => c.accepted).length ?? 0
  const matchDelta = draft ? Math.round(draft.match_after) - Math.round(draft.match_before) : 0

  const trackApplication = useMemo(
    () => async () => {
      if (!jd) return
      try {
        const dup = await api.applications.checkDuplicate({
          company_name: jd.company_name,
          role_title: jd.role_title,
        })
        if (dup?.reason === 'exact') {
          toast.info('Already tracked', `Opening the existing record (${dup.status}).`)
          navigate(`/applications/${dup.application_id}`)
          return
        }
        const app = await api.applications.create({
          company_name: jd.company_name,
          role_title: jd.role_title,
          location: jd.parsed.location,
          source: jd.source,
          status: 'Saved',
          job_description_id: jd.id,
          resume_id: resumeId || null,
          cover_letter_id: letter?.id ?? null,
          match_score: draft ? Math.round(draft.match_after) : null,
          salary_text: jd.parsed.salary_text ?? '',
          jd_snapshot: jd.raw_text,
        })
        toast.success('Tracked', 'Status “Saved” — submitting stays your call.')
        navigate(`/applications/${app.id}`)
      } catch (err) {
        toastError(err, 'Could not create the application')
      }
    },
    [jd, resumeId, letter, draft, navigate],
  )

  if (resumes.loading && !resumes.data) return <LoadingState label="Loading…" />

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="JD tailoring engine"
        subtitle="Reorders and rephrases what you already wrote to match a specific posting. It will not invent experience — and a validator checks that after generation, not just before."
        actions={
          draft && (
            <>
              <Button onClick={trackApplication}>Add to tracker</Button>
              <Button variant="primary" onClick={() => setSaveOpen(true)}>
                Save as variant ({acceptedCount})
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <section className="panel p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-900">Inputs</h3>
            <div className="space-y-3">
              <Field label="Base resume" hint="Usually your master — tailoring never edits it in place.">
                <Select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                  {(resumes.data ?? []).filter((r) => r.mode !== 'freeform').map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.title}
                      {resume.is_master ? ' (master)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Job description">
                <Select
                  value={jdId}
                  onChange={(e) => {
                    setJdId(e.target.value)
                    setParams(e.target.value ? { jd: e.target.value } : {})
                    setDraft(null)
                    setLetter(null)
                  }}
                >
                  <option value="">Select a posting…</option>
                  {(jds.data ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.role_title} — {row.company_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button size="sm" onClick={() => setAddingJd(true)}>
                + Add a new job description
              </Button>
            </div>
          </section>

          <section className="panel p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-900">What to change</h3>
            <div className="space-y-2.5">
              <Checkbox
                checked={options.rewrite_summary}
                onChange={(v) => setOptions({ ...options, rewrite_summary: v })}
                label="Rewrite summary and headline"
                hint="Points them at the target role using skills you already list."
              />
              <Checkbox
                checked={options.rewrite_bullets}
                onChange={(v) => setOptions({ ...options, rewrite_bullets: v })}
                label="Strengthen bullets"
                hint="Drops weak openers, leads with action verbs, mirrors the JD's terms."
              />
              <Checkbox
                checked={options.reorder}
                onChange={(v) => setOptions({ ...options, reorder: v })}
                label="Reorder for relevance"
                hint="Most relevant bullets and roles first. Dates are never touched."
              />
              <Field label="Max bullet rewrites">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={options.max_bullet_rewrites}
                  onChange={(e) =>
                    setOptions({ ...options, max_bullet_rewrites: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </Field>
            </div>

            <Button
              variant="primary"
              className="mt-4 w-full justify-center"
              onClick={generate}
              loading={generating}
              disabled={!jdId || !resumeId}
            >
              Generate tailored draft
            </Button>
            <Hint className="mt-2">
              Runs as a background job in production (LLM calls are slow enough that a synchronous request would
              feel broken).
            </Hint>
          </section>

          {draft && (
            <section className="panel p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-900">Match impact</h3>
              <div className="flex items-center justify-between gap-3">
                <ScoreRing value={draft.match_before} size={62} label="Before" />
                <span className="text-lg text-ink-300">→</span>
                <ScoreRing value={draft.match_after} size={62} label="After" />
              </div>
              <p className="mt-3 text-center text-xs">
                {matchDelta > 0 ? (
                  <span className="font-medium text-emerald-700">+{matchDelta} points from accepted changes</span>
                ) : matchDelta < 0 ? (
                  <span className="font-medium text-rose-700">{matchDelta} points</span>
                ) : (
                  <span className="text-ink-500">No change in score</span>
                )}
              </p>
              <Hint className="mt-2">
                Score moves because emphasis and vocabulary changed — not because anything was added to your history.
              </Hint>
            </section>
          )}

          {draft && (
            <>
              <TruthGuardPanel flags={draft.truth_flags} />
              <DensityPanel density={draft.density} />
            </>
          )}
        </aside>

        <div className="panel p-4">
          {generating ? (
            <GeneratingState
              title="Tailoring your resume"
              steps={[
                'Matching each JD requirement against your profile',
                'Ranking bullets by relevance',
                'Rewriting weak phrasing (no new claims)',
                'Running the truthfulness validator',
                'Checking keyword density',
              ]}
            />
          ) : !draft ? (
            <EmptyState
              icon="✦"
              title={jd ? `Ready to tailor for ${jd.company_name}` : 'Pick a job description to start'}
              body={
                jd
                  ? 'The engine will propose a change list you can accept or reject line by line. Your master resume is never modified.'
                  : 'Add or select a posting on the left. Everything downstream — match score, tailored draft, cover letter, interview questions — reuses that one parse.'
              }
              action={
                jd ? (
                  <Button variant="primary" onClick={generate}>
                    Generate tailored draft
                  </Button>
                ) : (
                  <Button onClick={() => setAddingJd(true)}>Add a job description</Button>
                )
              }
            />
          ) : (
            <>
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'changes', label: 'Changes', count: draft.changes.length },
                  { id: 'preview', label: 'Tailored preview' },
                  { id: 'letter', label: 'Cover letter' },
                ]}
                className="mb-4"
              />

              {tab === 'changes' && (
                <ChangeList
                  changes={draft.changes}
                  truthFlags={draft.truth_flags}
                  onToggle={(id, accepted) =>
                    setChanges((changes) => changes.map((c) => (c.id === id ? { ...c, accepted } : c)))
                  }
                  onToggleAll={(accepted) => setChanges((changes) => changes.map((c) => ({ ...c, accepted })))}
                />
              )}

              {tab === 'preview' && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="label mb-0">Base</span>
                      <Badge tone="neutral">{baseResume?.title}</Badge>
                    </div>
                    {baseContent.data ? (
                      <ResumePreview
                        content={baseContent.data}
                        templateId={baseResume?.template_id ?? 'ats-classic'}
                      />
                    ) : (
                      <LoadingState label="Loading base…" />
                    )}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="label mb-0">Tailored</span>
                      <Badge tone="brand">{acceptedCount} changes applied</Badge>
                    </div>
                    <ResumePreview content={draft.content} templateId={baseResume?.template_id ?? 'ats-classic'} />
                  </div>
                </div>
              )}

              {tab === 'letter' && (
                <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div>
                      <span className="label">Tone</span>
                      <div className="space-y-1.5">
                        {TONES.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setTone(option.id)}
                            className={`w-full rounded-lg border p-2.5 text-left ${
                              tone === option.id ? 'border-brand-400 bg-brand-50' : 'border-ink-200 hover:border-ink-300'
                            }`}
                          >
                            <div className="text-sm font-medium text-ink-900">{option.label}</div>
                            <div className="text-[11px] text-ink-500">{option.hint}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Field
                      label="Why this company (optional)"
                      hint="Your own words go in verbatim — this is the one place the letter can say something the resume does not."
                    >
                      <Textarea
                        rows={4}
                        value={whyCompany}
                        onChange={(e) => setWhyCompany(e.target.value)}
                        placeholder="I have used their API for two years and…"
                      />
                    </Field>

                    <Button variant="primary" className="w-full justify-center" onClick={generateLetter} loading={letterPending}>
                      {letter ? 'Regenerate' : 'Draft cover letter'}
                    </Button>
                  </div>

                  <div>
                    {letterPending ? (
                      <GeneratingState
                        title="Drafting"
                        steps={['Selecting your strongest relevant bullets', 'Writing in the selected tone', 'Validating every claim']}
                      />
                    ) : letter ? (
                      <div className="space-y-3">
                        <TruthGuardPanel flags={letter.truth_flags} />
                        <Textarea
                          rows={20}
                          value={letter.content}
                          onChange={(e) => saveLetterEdits(e.target.value)}
                          className="font-serif text-sm leading-relaxed"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => {
                              void navigator.clipboard.writeText(letter.content)
                              toast.success('Copied')
                            }}
                          >
                            Copy
                          </Button>
                          <Button
                            onClick={() =>
                              download(
                                `cover-letter-${slugify(jd?.company_name ?? 'company')}.txt`,
                                letter.content,
                                'text/plain',
                              )
                            }
                          >
                            Download .txt
                          </Button>
                          <Link to="/cover-letters" className="link self-center text-xs">
                            All cover letters →
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <EmptyState
                        icon="✎"
                        title="No cover letter yet"
                        body="The draft is built from your strongest JD-relevant bullets, so every claim in it is already on your resume."
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddJdModal
        open={addingJd}
        onClose={() => setAddingJd(false)}
        onCreated={(id) => {
          jds.reload()
          setJdId(id)
          setParams({ jd: id })
        }}
      />

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save as a tailored variant"
        subtitle="Only the accepted changes are baked in. The variant is linked to this posting."
        size="sm"
        footer={
          <>
            <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveVariant} loading={saving}>
              Save variant
            </Button>
          </>
        }
      >
        <Field label="Title">
          <Input value={variantTitle} onChange={(e) => setVariantTitle(e.target.value)} autoFocus />
        </Field>
        <Hint className="mt-2">
          {acceptedCount} of {draft?.changes.length ?? 0} changes accepted.
        </Hint>
      </Modal>
    </div>
  )
}
