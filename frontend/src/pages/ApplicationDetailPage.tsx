import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ApplicationContact, ApplicationStatus } from '@/types'
import { api } from '@/lib/api'
import { PIPELINE, SOURCES, STATUS_STYLES } from '@/lib/pipeline'
import { renderResumeText } from '@/lib/export/render'
import { cn, download, formatDate, formatDateTime, relativeTime } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, LinkButton, PageHeader } from '@/components/ui/primitives'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/inputs'
import { ConfirmDialog, Modal } from '@/components/ui/overlays'
import { KeyValue, Tabs } from '@/components/ui/data'

export function ApplicationDetailPage() {
  const { applicationId = '' } = useParams()
  const navigate = useNavigate()
  const app = useAsync(() => api.applications.get(applicationId), [applicationId])
  const history = useAsync(() => api.applications.history(applicationId), [applicationId])
  const resumes = useAsync(() => api.resumes.list(), [])
  const letters = useAsync(() => api.coverLetters.list(), [])

  const [tab, setTab] = useState<'timeline' | 'notes' | 'contacts' | 'attachments' | 'jd'>('timeline')
  const [note, setNote] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(null)
  const [addingContact, setAddingContact] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pending, setPending] = useState(false)

  const setStatus = async (status: ApplicationStatus, noteText: string) => {
    setPending(true)
    try {
      await api.applications.setStatus(applicationId, status, noteText)
      toast.success(`Moved to ${status}`)
      setPendingStatus(null)
      setStatusNote('')
      app.reload()
      history.reload()
    } catch (err) {
      toastError(err, 'Could not change the status')
    } finally {
      setPending(false)
    }
  }

  const addNote = async () => {
    if (!note.trim()) return
    try {
      await api.applications.addNote(applicationId, note.trim())
      setNote('')
      app.reload()
    } catch (err) {
      toastError(err, 'Could not add the note')
    }
  }

  const patch = async (patchBody: Parameters<typeof api.applications.update>[1]) => {
    try {
      await api.applications.update(applicationId, patchBody)
      app.reload()
    } catch (err) {
      toastError(err, 'Could not update')
    }
  }

  /** §4 — freeze exactly what was submitted, not "the current version". */
  const freezeResume = async () => {
    if (!app.data?.resume_id) {
      toast.info('Pick the resume you sent first')
      return
    }
    setPending(true)
    try {
      const { resume, version } = await api.resumes.get(app.data.resume_id)
      const snapshot = renderResumeText(version.content)
      await api.applications.attachSnapshot(applicationId, {
        kind: 'resume',
        format: 'pdf',
        filename: `${resume.title.replace(/\s+/g, '-').toLowerCase()}-v${version.version_number}.pdf`,
        snapshot,
      })
      await api.applications.update(applicationId, { resume_version_id: version.id })
      toast.success('Snapshot frozen', 'This exact text is now attached to the application forever.')
      app.reload()
    } catch (err) {
      toastError(err, 'Could not freeze the snapshot')
    } finally {
      setPending(false)
    }
  }

  const remove = async () => {
    setPending(true)
    try {
      await api.applications.remove(applicationId)
      toast.success('Deleted')
      navigate('/applications')
    } catch (err) {
      toastError(err, 'Could not delete')
    } finally {
      setPending(false)
    }
  }

  if (app.loading && !app.data) return <LoadingState label="Loading the application…" />
  if (app.error) return <ErrorState error={app.error} onRetry={app.reload} />
  if (!app.data) return null

  const row = app.data
  const resume = resumes.data?.find((r) => r.id === row.resume_id)
  const letter = letters.data?.find((l) => l.id === row.cover_letter_id)
  const overdue = row.next_follow_up_at && row.next_follow_up_at <= new Date().toISOString()

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={row.role_title}
        subtitle={
          <>
            {row.company_name}
            {row.location && ` · ${row.location}`} ·{' '}
            <Link to="/applications" className="link">
              back to the tracker
            </Link>
          </>
        }
        actions={
          <>
            {row.job_description_id && (
              <LinkButton to={`/job-descriptions/${row.job_description_id}`}>View posting</LinkButton>
            )}
            <LinkButton to={`/interview-prep?application=${row.id}`} variant="primary">
              Interview prep
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {/* Stage control — the primary action on this page. */}
          <section className="panel p-4">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Stage</h3>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => (status === row.status ? undefined : setPendingStatus(status))}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    status === row.status
                      ? STATUS_STYLES[status].badge
                      : 'border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50',
                  )}
                >
                  {status}
                  {status === row.status && ' ✓'}
                </button>
              ))}
            </div>
            {overdue && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="text-xs text-amber-900">
                  Follow-up was due {relativeTime(row.next_follow_up_at)}. A short, specific nudge beats silence.
                </p>
              </div>
            )}
          </section>

          <section className="panel p-4">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'timeline', label: 'Timeline', count: history.data?.length },
                { id: 'notes', label: 'Notes', count: row.notes.length },
                { id: 'contacts', label: 'Contacts', count: row.contacts.length },
                { id: 'attachments', label: 'Submitted files', count: row.attachments.length },
                { id: 'jd', label: 'JD snapshot' },
              ]}
              className="mb-4"
            />

            {tab === 'timeline' && (
              <ol className="relative space-y-3 border-l border-ink-200 pl-4">
                {(history.data ?? []).map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface',
                        STATUS_STYLES[entry.to_status].dot,
                      )}
                    />
                    <div className="text-sm text-ink-800">
                      {entry.from_status ? `${entry.from_status} → ` : ''}
                      <span className="font-medium">{entry.to_status}</span>
                    </div>
                    <div className="text-xs text-ink-400">{formatDateTime(entry.changed_at)}</div>
                    {entry.note && <p className="mt-0.5 text-xs text-ink-600">{entry.note}</p>}
                  </li>
                ))}
                {(history.data ?? []).length === 0 && <Hint>No transitions recorded yet.</Hint>}
              </ol>
            )}

            {tab === 'notes' && (
              <div className="space-y-3">
                <div>
                  <Textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What was said, who said it, what happens next…"
                  />
                  <Button className="mt-2" variant="primary" size="sm" onClick={addNote} disabled={!note.trim()}>
                    Add note
                  </Button>
                </div>
                <ul className="space-y-2">
                  {row.notes.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-ink-200 p-2.5">
                      <p className="whitespace-pre-wrap text-sm text-ink-800">{entry.body}</p>
                      <p className="mt-1 text-[11px] text-ink-400">{formatDateTime(entry.created_at)}</p>
                    </li>
                  ))}
                  {row.notes.length === 0 && <Hint>No notes yet.</Hint>}
                </ul>
              </div>
            )}

            {tab === 'contacts' && (
              <div className="space-y-3">
                <Button size="sm" onClick={() => setAddingContact(true)}>
                  + Add contact
                </Button>
                <ul className="space-y-2">
                  {row.contacts.map((contact) => (
                    <li key={contact.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-200 p-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink-900">{contact.name}</span>
                          <Badge tone="neutral">{contact.kind.replace('_', ' ')}</Badge>
                        </div>
                        <p className="text-xs text-ink-600">{contact.role}</p>
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="link text-xs">
                            {contact.email}
                          </a>
                        )}
                        {contact.linkedin && (
                          <a href={contact.linkedin} target="_blank" rel="noreferrer" className="link ml-2 text-xs">
                            LinkedIn
                          </a>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove contact"
                        onClick={async () => {
                          await api.applications.removeContact(applicationId, contact.id)
                          app.reload()
                        }}
                      >
                        ✕
                      </Button>
                    </li>
                  ))}
                  {row.contacts.length === 0 && (
                    <Hint>
                      Recruiter, hiring manager, interviewers, the person who referred you — all worth recording
                      before the follow-up.
                    </Hint>
                  )}
                </ul>
              </div>
            )}

            {tab === 'attachments' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={freezeResume} loading={pending}>
                    Freeze the resume I sent
                  </Button>
                </div>
                <Hint>
                  An application must remember the exact document that was submitted. Resumes keep changing; this
                  snapshot does not, which is what keeps the conversion-by-resume analytics honest.
                </Hint>
                <ul className="space-y-2">
                  {row.attachments.map((attachment) => (
                    <li key={attachment.id} className="rounded-lg border border-ink-200 p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink-900">{attachment.filename}</div>
                          <div className="text-[11px] text-ink-500">
                            {attachment.kind} · {attachment.format.toUpperCase()} ·{' '}
                            {Math.round(attachment.size_bytes / 1024)} KB · {formatDate(attachment.created_at)}
                          </div>
                          <code className="mt-1 block truncate text-[10px] text-ink-400">
                            {attachment.storage_key}
                          </code>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => download(`${attachment.filename}.txt`, attachment.snapshot, 'text/plain')}
                        >
                          Download snapshot
                        </Button>
                      </div>
                    </li>
                  ))}
                  {row.attachments.length === 0 && <Hint>Nothing frozen yet for this application.</Hint>}
                </ul>
              </div>
            )}

            {tab === 'jd' && (
              <div>
                {row.jd_snapshot ? (
                  <pre className="scrollbar-thin max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-700">
                    {row.jd_snapshot}
                  </pre>
                ) : (
                  <Hint>
                    No JD snapshot stored. Link a job description to this application and the posting text is kept
                    verbatim — job URLs die fast.
                  </Hint>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel p-4">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Details</h3>
            <KeyValue
              rows={[
                { label: 'Status', value: <Badge tone="neutral">{row.status}</Badge> },
                { label: 'Applied', value: formatDate(row.applied_at) },
                { label: 'Match', value: row.match_score != null ? Math.round(row.match_score) : '—' },
                { label: 'Salary', value: row.salary_text || '—' },
                {
                  label: 'Follow-up',
                  value: row.next_follow_up_at ? relativeTime(row.next_follow_up_at) : '—',
                },
                { label: 'Created', value: formatDate(row.created_at) },
              ]}
            />
          </section>

          <section className="panel p-4 space-y-3">
            <h3 className="text-sm font-semibold text-ink-900">Materials sent</h3>
            <Field label="Resume">
              <Select
                value={row.resume_id ?? ''}
                onChange={(e) => patch({ resume_id: e.target.value || null })}
              >
                <option value="">Not recorded</option>
                {(resumes.data ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </Select>
            </Field>
            {resume && (
              <Link to={`/resumes/${resume.id}`} className="link text-xs">
                Open {resume.title} →
              </Link>
            )}

            <Field label="Cover letter">
              <Select
                value={row.cover_letter_id ?? ''}
                onChange={(e) => patch({ cover_letter_id: e.target.value || null })}
              >
                <option value="">None</option>
                {(letters.data ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.tone} · {formatDate(option.created_at)}
                  </option>
                ))}
              </Select>
            </Field>
            {letter && (
              <Link to="/cover-letters" className="link text-xs">
                Open cover letter →
              </Link>
            )}

            <Field label="Source">
              <Select
                value={row.source}
                onChange={(e) => patch({ source: e.target.value as typeof row.source })}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </section>

          <section className="panel p-4">
            <h3 className="text-sm font-semibold text-ink-900">Danger zone</h3>
            <Hint className="mt-1">Deleting removes the record and its stage history from your analytics.</Hint>
            <Button variant="danger" size="sm" className="mt-2" onClick={() => setDeleting(true)}>
              Delete application
            </Button>
          </section>
        </aside>
      </div>

      <Modal
        open={Boolean(pendingStatus)}
        onClose={() => setPendingStatus(null)}
        title={`Move to ${pendingStatus}`}
        subtitle="The transition is timestamped. A note here is what you will want when you look back in a month."
        size="sm"
        footer={
          <>
            <Button onClick={() => setPendingStatus(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() => pendingStatus && setStatus(pendingStatus, statusNote)}
            >
              Confirm
            </Button>
          </>
        }
      >
        <Field label="Note (optional)">
          <Textarea
            rows={3}
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Recruiter screen booked for Thursday…"
          />
        </Field>
      </Modal>

      <AddContactModal
        open={addingContact}
        onClose={() => setAddingContact(false)}
        onSubmit={async (contact) => {
          await api.applications.addContact(applicationId, contact)
          setAddingContact(false)
          app.reload()
        }}
      />

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={remove}
        title="Delete this application?"
        body="The record, its notes and its stage history are removed."
        confirmLabel="Delete"
        destructive
        loading={pending}
      />
    </div>
  )
}

function AddContactModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (contact: Omit<ApplicationContact, 'id'>) => Promise<void>
}) {
  const [form, setForm] = useState<Omit<ApplicationContact, 'id'>>({
    name: '',
    role: '',
    email: '',
    linkedin: '',
    kind: 'recruiter',
  })
  const [pending, setPending] = useState(false)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a contact"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!form.name.trim()}
            onClick={async () => {
              setPending(true)
              try {
                await onSubmit(form)
                setForm({ name: '', role: '', email: '', linkedin: '', kind: 'recruiter' })
              } finally {
                setPending(false)
              }
            }}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Role">
          <Input
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            placeholder="Technical Recruiter"
          />
        </Field>
        <Field label="Relationship">
          <Select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as ApplicationContact['kind'] })}
          >
            <option value="recruiter">Recruiter</option>
            <option value="hiring_manager">Hiring manager</option>
            <option value="interviewer">Interviewer</option>
            <option value="referral">Referral</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="LinkedIn">
          <Input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}
