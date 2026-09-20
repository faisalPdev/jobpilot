import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Resume, ResumeContent, ResumeMode } from '@/types'
import { api } from '@/lib/api'
import { templateMeta } from '@/lib/export/templates'
import { emptyResumeContent } from '@/lib/resumeFactory'
import { blankDocumentHtml } from '@/lib/doc/convert'
import { defaultDocumentPage } from '@/lib/doc/render'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/store/auth'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, PageHeader } from '@/components/ui/primitives'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/inputs'
import { ConfirmDialog, Modal } from '@/components/ui/overlays'
import { ImportResumeModal } from '@/components/resume/ImportResumeModal'

export function ResumesPage() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const resumes = useAsync(() => api.resumes.list(), [])
  const jds = useAsync(() => api.jds.list(), [])
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<ResumeMode>('structured')
  const [pending, setPending] = useState(false)
  const [deleting, setDeleting] = useState<Resume | null>(null)

  const openCreate = (nextMode: ResumeMode) => {
    setMode(nextMode)
    setCreating(true)
  }

  /** A blank document still starts from the profile shell, so the structured
      fields exist (empty) and a later conversion has somewhere to land. */
  const blankDocument = (): ResumeContent => ({
    ...emptyResumeContent(),
    contact: { ...emptyResumeContent().contact, full_name: user?.full_name ?? '', email: user?.email ?? '' },
    mode: 'freeform',
    document: {
      html: blankDocumentHtml(user?.full_name ?? '', user?.email ?? ''),
      page: defaultDocumentPage(),
    },
  })

  const create = async () => {
    setPending(true)
    try {
      const created = await api.resumes.create({
        title: title.trim() || (mode === 'freeform' ? 'Untitled document' : 'Untitled resume'),
        content: mode === 'freeform' ? blankDocument() : undefined,
      })
      toast.success(mode === 'freeform' ? 'Blank document created' : 'Resume created')
      setCreating(false)
      setTitle('')
      navigate(`/resumes/${created.resume.id}`)
    } catch (err) {
      toastError(err, 'Could not create the resume')
    } finally {
      setPending(false)
    }
  }

  const duplicate = async (resume: Resume) => {
    try {
      const copy = await api.resumes.duplicate(resume.id, `${resume.title} (copy)`)
      toast.success('Duplicated')
      navigate(`/resumes/${copy.resume.id}`)
    } catch (err) {
      toastError(err, 'Could not duplicate')
    }
  }

  const remove = async () => {
    if (!deleting) return
    setPending(true)
    try {
      await api.resumes.remove(deleting.id)
      toast.success('Deleted', 'Applications keep the version that was actually sent.')
      setDeleting(null)
      resumes.reload()
    } catch (err) {
      toastError(err, 'Could not delete')
    } finally {
      setPending(false)
    }
  }

  const setMaster = async (resume: Resume) => {
    if (resume.mode === 'freeform') {
      toast.error(
        'A document cannot be the master resume',
        'Matching, tailoring and discovery read structured fields. Convert it in the editor first.',
      )
      return
    }
    try {
      await api.resumes.update(resume.id, { is_master: true })
      toast.success('Master resume updated', 'Matching, tailoring and discovery all score against this one.')
      resumes.reload()
    } catch (err) {
      toastError(err, 'Could not update')
    }
  }

  if (resumes.loading && !resumes.data) return <LoadingState label="Loading your resumes…" />
  if (resumes.error) return <ErrorState error={resumes.error} onRetry={resumes.reload} />

  const rows = resumes.data ?? []
  const master = rows.find((r) => r.is_master)
  const documents = rows.filter((r) => !r.is_master && r.mode === 'freeform')
  const variants = rows.filter((r) => !r.is_master && r.mode !== 'freeform')

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Resumes"
        subtitle="One master profile plus a tailored variant per application. Every save is a version you can diff and restore."
        actions={
          <>
            <Button onClick={() => setImporting(true)}>Import PDF / DOCX</Button>
            <Button onClick={() => openCreate('freeform')}>Blank document</Button>
            <Button variant="primary" onClick={() => openCreate('structured')}>
              New resume
            </Button>
          </>
        }
      />

      {rows.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="▤"
            title="No resumes yet"
            body="Import an existing file, build a structured profile the app can tailor for you, or write a page from scratch in the document editor."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setImporting(true)}>Import</Button>
                <Button onClick={() => openCreate('freeform')}>Write from scratch</Button>
                <Button variant="primary" onClick={() => openCreate('structured')}>
                  Start a structured resume
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Master</h2>
            {master ? (
              <ResumeCard
                resume={master}
                jdTitle={null}
                onDuplicate={() => duplicate(master)}
                onDelete={null}
                onSetMaster={null}
              />
            ) : (
              <div className="panel p-4">
                <Hint>
                  No master resume is set. Pick one below — matching, tailoring and discovery all score against it.
                </Hint>
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Tailored variants ({variants.length})
              </h2>
              <Link to="/tailor" className="link text-xs">
                Tailor for a new job description →
              </Link>
            </div>
            {variants.length === 0 ? (
              <div className="panel">
                <EmptyState
                  icon="✦"
                  title="No tailored variants yet"
                  body="Paste a job description and the tailoring engine will produce a reviewable variant."
                  action={<Button variant="primary" onClick={() => navigate('/tailor')}>Open the tailoring engine</Button>}
                />
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {variants.map((resume) => (
                  <ResumeCard
                    key={resume.id}
                    resume={resume}
                    jdTitle={
                      jds.data?.find((jd) => jd.id === resume.job_description_id)
                        ? `${jds.data.find((jd) => jd.id === resume.job_description_id)!.role_title} @ ${
                            jds.data.find((jd) => jd.id === resume.job_description_id)!.company_name
                          }`
                        : null
                    }
                    onDuplicate={() => duplicate(resume)}
                    onDelete={() => setDeleting(resume)}
                    onSetMaster={() => setMaster(resume)}
                  />
                ))}
              </div>
            )}
          </section>

          {documents.length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Documents ({documents.length})
                </h2>
                <span className="text-xs text-ink-400">laid out by hand · not tailored automatically</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {documents.map((resume) => (
                  <ResumeCard
                    key={resume.id}
                    resume={resume}
                    jdTitle={null}
                    onDuplicate={() => duplicate(resume)}
                    onDelete={() => setDeleting(resume)}
                    onSetMaster={null}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New resume"
        subtitle="Pick how you want to write it. You can switch modes later, in either direction."
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} loading={pending}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeCard
              active={mode === 'structured'}
              onClick={() => setMode('structured')}
              title="Structured resume"
              badge="recommended"
              body="Fill in fields — roles, bullets, skills — and pick a template. This is what the match score, the tailoring engine and discovery read."
              note="Guided, and automatable."
            />
            <ModeCard
              active={mode === 'freeform'}
              onClick={() => setMode('freeform')}
              title="Blank document"
              badge="full control"
              body="A page and a caret. Headings, fonts, spacing, order — you lay it out yourself, like a word processor, and export the exact page."
              note="No template, no fields. Tailoring cannot read it until you convert."
            />
          </div>

          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === 'freeform' ? 'CV — long form' : 'Backend engineer — 2026'}
              autoFocus
            />
          </Field>
        </div>
      </Modal>

      <ImportResumeModal open={importing} onClose={() => setImporting(false)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete “${deleting?.title}”?`}
        body="The resume and its version history go away. Applications that used it keep their frozen snapshot, so your analytics stay intact."
        confirmLabel="Delete"
        destructive
        loading={pending}
      />
    </div>
  )
}

function ModeCard({
  active,
  onClick,
  title,
  badge,
  body,
  note,
}: {
  active: boolean
  onClick: () => void
  title: string
  badge: string
  body: string
  note: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl border p-3 text-left transition-colors',
        active ? 'border-brand-400 bg-brand-50' : 'border-ink-200 bg-surface hover:border-ink-300',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-900">{title}</span>
        <Badge tone={active ? 'brand' : 'neutral'}>{badge}</Badge>
      </div>
      <p className="mt-1 text-xs text-ink-600">{body}</p>
      <p className="mt-1 text-[11px] text-ink-400">{note}</p>
    </button>
  )
}

function ResumeCard({
  resume,
  jdTitle,
  onDuplicate,
  onDelete,
  onSetMaster,
}: {
  resume: Resume
  jdTitle: string | null
  onDuplicate: () => void
  onDelete: (() => void) | null
  onSetMaster: (() => void) | null
}) {
  const template = templateMeta(resume.template_id)
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/resumes/${resume.id}`} className="truncate text-sm font-semibold text-ink-900 hover:text-brand-700">
              {resume.title}
            </Link>
            {resume.is_master && <Badge tone="brand">master</Badge>}
            {resume.mode === 'freeform' ? (
              <Badge tone="info" title="Written as a freeform page rather than structured fields">
                document
              </Badge>
            ) : (
              <Badge tone={template.ats_safe ? 'neutral' : 'warning'}>{template.name}</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-500">
            Updated {relativeTime(resume.updated_at)} · created {formatDate(resume.created_at)}
          </p>
          {jdTitle && <p className="mt-1 text-xs text-brand-700">Tailored for {jdTitle}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/resumes/${resume.id}`}
          className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-xs font-medium text-on-primary hover:bg-primary-hover"
        >
          Edit
        </Link>
        <Button size="sm" onClick={onDuplicate}>
          Duplicate
        </Button>
        {onSetMaster && (
          <Button size="sm" onClick={onSetMaster}>
            Make master
          </Button>
        )}
        {onDelete && (
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}
