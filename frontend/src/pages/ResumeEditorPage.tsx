import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ResumeContent, ResumeDocument, SectionKey, TemplateId } from '@/types'
import { api } from '@/lib/api'
import { SECTION_LABELS } from '@/lib/resumeFactory'
import { checkAts, scoreResume } from '@/lib/ai/score'
import {
  exportResumeDocx,
  exportResumeJson,
  exportResumePdf,
  exportResumeTxt,
  renderResumeText,
} from '@/lib/export'
import {
  defaultDocumentPage,
  exportDocumentDocx,
  exportDocumentHtmlFile,
  exportDocumentPdf,
  exportDocumentTxt,
} from '@/lib/doc/render'
import { documentToText } from '@/lib/doc/sanitize'
import { documentToStructured, structuredToDocumentHtml } from '@/lib/doc/convert'
import { analyzeDocument } from '@/lib/doc/checks'
import { cn, deepClone, download, move, relativeTime, slugify } from '@/lib/utils'
import { useAsync, useDebounced, useLocalState } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, PageHeader } from '@/components/ui/primitives'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/inputs'
import { ConfirmDialog, Modal } from '@/components/ui/overlays'
import { Tabs } from '@/components/ui/data'
import { ResumePreview } from '@/components/resume/ResumePreview'
import { AtsPanel, ScorePanel, TemplatePicker } from '@/components/resume/ScorePanel'
import { VersionHistory } from '@/components/resume/VersionHistory'
import { DocumentEditor, type DocumentEditorHandle } from '@/components/resume/DocumentEditor'
import {
  DocumentChecks,
  DocumentOutline,
  DocumentPageSetup,
} from '@/components/resume/DocumentInspector'
import {
  CertificationsEditor,
  ContactEditor,
  EducationEditor,
  ExperienceEditor,
  LanguagesEditor,
  ProjectsEditor,
  SkillsEditor,
  SummaryEditor,
} from '@/components/resume/SectionEditors'

type SidePanel = 'preview' | 'score' | 'ats' | 'template' | 'versions'
type DocPanel = 'outline' | 'checks' | 'page' | 'versions'

export function ResumeEditorPage() {
  const { resumeId = '' } = useParams()
  const loaded = useAsync(() => api.resumes.get(resumeId), [resumeId])
  const versions = useAsync(() => api.resumes.versions(resumeId), [resumeId])
  const jds = useAsync(() => api.jds.list(), [])

  const [content, setContent] = useState<ResumeContent | null>(null)
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState<TemplateId>('ats-classic')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [panel, setPanel] = useLocalState<SidePanel>('jobpilot.editor.panel', 'preview')
  const [docPanel, setDocPanel] = useLocalState<DocPanel>('jobpilot.editor.docPanel', 'outline')
  const [zoom, setZoom] = useLocalState('jobpilot.editor.zoom', 1)
  const [openSection, setOpenSection] = useLocalState<SectionKey | 'contact'>('jobpilot.editor.section', 'contact')
  const [saveLabel, setSaveLabel] = useState('')
  const [savePrompt, setSavePrompt] = useState(false)
  const [convertPrompt, setConvertPrompt] = useState<'to_document' | 'to_structured' | null>(null)
  const [pages, setPages] = useState(1)
  const [jdId, setJdId] = useState('')
  const docRef = useRef<DocumentEditorHandle>(null)

  useEffect(() => {
    if (!loaded.data) return
    setContent(deepClone(loaded.data.version.content))
    setTitle(loaded.data.resume.title)
    setTemplateId(loaded.data.resume.template_id)
    setJdId(loaded.data.resume.job_description_id ?? '')
    setDirty(false)
  }, [loaded.data])

  // Warn before losing unsaved edits — versions are explicit here, not magic.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const freeform = content?.mode === 'freeform'

  // The structured rubric reads fields a document does not have, so it is not
  // run at all in document mode — `DocumentChecks` is the equivalent there.
  const score = useMemo(() => (content && !freeform ? scoreResume(content) : null), [content, freeform])
  const ats = useMemo(
    () => (content && !freeform ? checkAts(content, templateId) : null),
    [content, templateId, freeform],
  )

  // Analysing the page walks the whole DOM, so it trails the caret rather than
  // running on every keystroke.
  const docPage = content?.document?.page
  const docHtml = useDebounced(content?.document?.html ?? '', 350)
  const docReport = useMemo(
    () => (freeform && docPage ? analyzeDocument({ html: docHtml, page: docPage }, pages) : null),
    [freeform, docHtml, docPage, pages],
  )

  const jd = jds.data?.find((row) => row.id === jdId) ?? null

  const patch = (updater: (draft: ResumeContent) => void) => {
    setContent((prev) => {
      if (!prev) return prev
      const next = deepClone(prev)
      updater(next)
      return next
    })
    setDirty(true)
  }

  const setDocument = (next: ResumeDocument) =>
    patch((d) => {
      d.document = next
    })

  const save = async (label: string) => {
    if (!content) return
    setSaving(true)
    try {
      await api.resumes.saveVersion(resumeId, content, label)
      const mode = content.mode ?? 'structured'
      const resume = loaded.data?.resume
      if (
        resume &&
        (title !== resume.title || templateId !== resume.template_id || mode !== (resume.mode ?? 'structured'))
      ) {
        await api.resumes.update(resumeId, { title, template_id: templateId, mode })
      }
      setDirty(false)
      setSavePrompt(false)
      setSaveLabel('')
      toast.success('Version saved', 'Snapshotted, diffable and restorable.')
      loaded.reload()
      versions.reload()
    } catch (err) {
      toastError(err, 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const restore = async (versionId: string) => {
    setRestoring(true)
    try {
      await api.resumes.restoreVersion(resumeId, versionId)
      toast.success('Restored', 'A new version was created from that snapshot.')
      loaded.reload()
      versions.reload()
    } catch (err) {
      toastError(err, 'Could not restore')
    } finally {
      setRestoring(false)
    }
  }

  /* Mode switches. Neither direction deletes anything: the structured fields
     survive a switch to document mode, and the page survives a switch back. */

  const toDocumentMode = () => {
    if (!content) return
    const html = content.document?.html ?? structuredToDocumentHtml(content)
    patch((d) => {
      d.mode = 'freeform'
      d.document = { html, page: d.document?.page ?? defaultDocumentPage() }
    })
    setConvertPrompt(null)
    toast.success(
      'Document mode',
      content.document ? 'Your existing page is back.' : 'Your profile was laid out as an editable page.',
    )
  }

  const toStructuredMode = () => {
    if (!content) return
    const { content: next, parse } = documentToStructured(content)
    setContent(next)
    setDirty(true)
    setConvertPrompt(null)
    toast.success(
      'Structured mode',
      `Parsed at ${parse.confidence}% confidence — check every section before you rely on the match score.`,
    )
    setOpenSection('contact')
  }

  if (loaded.loading && !loaded.data) return <LoadingState label="Opening the editor…" />
  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />
  if (!loaded.data || !content) return null
  if (!freeform && (!score || !ats)) return null

  const resume = loaded.data.resume
  const sections: (SectionKey | 'contact')[] = ['contact', ...content.section_order]
  const doc = content.document

  return (
    <div className={freeform ? 'mx-auto max-w-[100rem]' : 'mx-auto max-w-[110rem]'}>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setDirty(true)
              }}
              className="rounded-md border border-transparent px-1 text-xl font-semibold tracking-tight hover:border-ink-200 focus:border-brand-400 focus:outline-none"
              aria-label="Resume title"
            />
            {resume.is_master && <Badge tone="brand">master</Badge>}
            {freeform && <Badge tone="info">document</Badge>}
            {dirty ? <Badge tone="warning">unsaved changes</Badge> : <Badge tone="success">saved</Badge>}
          </span>
        }
        subtitle={
          <>
            Version {loaded.data.version.version_number} · last saved {relativeTime(loaded.data.version.created_at)} ·{' '}
            <Link to="/resumes" className="link">
              all resumes
            </Link>
          </>
        }
        actions={
          <>
            {freeform && doc ? (
              <>
                <Button onClick={() => setConvertPrompt('to_structured')}>Convert to structured</Button>
                <DocumentExportMenu doc={doc} content={content} title={title} />
              </>
            ) : (
              <>
                <Button onClick={() => setConvertPrompt('to_document')}>Document mode</Button>
                <ExportMenu content={content} templateId={templateId} title={title} />
              </>
            )}
            <Button variant="primary" onClick={() => setSavePrompt(true)} disabled={!dirty} loading={saving}>
              Save version
            </Button>
          </>
        }
      />

      {freeform && resume.is_master && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">
            This is your <b>master</b> resume and it is in document mode. Matching, tailoring and discovery read the
            structured fields, not the page — they will score against whatever was last parsed. Convert back to
            structured, or make a structured resume the master.
          </p>
        </div>
      )}

      {freeform && doc && docReport ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-2">
            <DocumentEditor
              ref={docRef}
              doc={doc}
              onChange={setDocument}
              onSave={() => setSavePrompt(true)}
              onPagesChange={setPages}
              zoom={zoom}
              onZoom={setZoom}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-500">
              <span className="tabular-nums">{docReport.stats.words} words</span>
              <span className="tabular-nums">{docReport.stats.characters} characters</span>
              <span className="tabular-nums">
                {pages} page{pages === 1 ? '' : 's'}
              </span>
              <span className="tabular-nums">{docReport.stats.bullets} bullets</span>
              <span className="ml-auto">
                Ctrl/Cmd+S saves · Tab indents · page margins are in the toolbar (indent cannot shrink them)
              </span>
            </div>
          </div>

          <aside className="space-y-3">
            <Tabs
              value={docPanel}
              onChange={setDocPanel}
              tabs={[
                { id: 'outline', label: 'Outline', count: docReport.outline.length || undefined },
                { id: 'checks', label: 'Checks', count: docReport.issues.length || undefined },
                { id: 'page', label: 'Page' },
                { id: 'versions', label: 'Versions', count: versions.data?.length },
              ]}
            />
            <div className="panel p-3">
              {docPanel === 'outline' && (
                <DocumentOutline report={docReport} onJump={(index) => docRef.current?.scrollToHeading(index)} />
              )}
              {docPanel === 'checks' && <DocumentChecks report={docReport} />}
              {docPanel === 'page' && <DocumentPageSetup doc={doc} onChange={setDocument} />}
              {docPanel === 'versions' && (
                <VersionHistory
                  versions={versions.data ?? []}
                  currentVersionId={resume.current_version_id}
                  onRestore={restore}
                  restoring={restoring}
                />
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_26rem]">
          {/* Section rail: order + visibility, both persisted as data. */}
          <aside className="panel h-fit p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Sections</h3>
              <span className="text-[10px] text-ink-400">order · visibility</span>
            </div>
            <ul className="space-y-1">
              {sections.map((key) => {
                const isContact = key === 'contact'
                const hidden = !isContact && content.hidden_sections.includes(key)
                const count = isContact ? 0 : sectionCount(content, key)
                return (
                  <li key={key}>
                    <div
                      className={cn(
                        'group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm',
                        openSection === key ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100',
                      )}
                    >
                      {!isContact && (
                        <span className="flex flex-col leading-none">
                          <button
                            type="button"
                            className="text-[9px] text-ink-300 hover:text-ink-700"
                            aria-label={`Move ${key} up`}
                            onClick={() => {
                              const index = content.section_order.indexOf(key)
                              if (index > 0) patch((d) => {
                                d.section_order = move(d.section_order, index, index - 1)
                              })
                            }}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="text-[9px] text-ink-300 hover:text-ink-700"
                            aria-label={`Move ${key} down`}
                            onClick={() => {
                              const index = content.section_order.indexOf(key)
                              if (index < content.section_order.length - 1)
                                patch((d) => {
                                  d.section_order = move(d.section_order, index, index + 1)
                                })
                            }}
                          >
                            ▼
                          </button>
                        </span>
                      )}
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => setOpenSection(key)}
                      >
                        {isContact ? 'Contact' : SECTION_LABELS[key]}
                        {!isContact && (
                          <span className={cn('ml-1.5 text-xs', count ? 'text-ink-400' : 'text-amber-600')}>
                            {count || '—'}
                          </span>
                        )}
                      </button>
                      {!isContact && (
                        <button
                          type="button"
                          title={hidden ? 'Show in exports' : 'Hide from exports'}
                          className="text-xs text-ink-300 hover:text-ink-700"
                          onClick={() =>
                            patch((d) => {
                              d.hidden_sections = hidden
                                ? d.hidden_sections.filter((s) => s !== key)
                                : [...d.hidden_sections, key]
                            })
                          }
                        >
                          {hidden ? '◌' : '◉'}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4 border-t border-ink-100 pt-3">
              <Field label="Tailoring context" hint="Optional: highlights this JD's vocabulary while you edit.">
                <select className="input-base" value={jdId} onChange={(e) => setJdId(e.target.value)}>
                  <option value="">No job description</option>
                  {(jds.data ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.role_title} — {row.company_name}
                    </option>
                  ))}
                </select>
              </Field>
              {jd && (
                <Hint className="mt-2">
                  Suggestions will mirror this posting's terms. Nothing is added to your resume automatically.
                </Hint>
              )}
            </div>
          </aside>

          {/* Editor column */}
          <div className="panel p-4">
            <SectionEditor
              section={openSection}
              content={content}
              patch={patch}
              jdKeywords={jd ? jd.parsed.keywords : []}
              jd={jd?.parsed ?? null}
            />
          </div>

          {/* Inspector column */}
          <aside className="space-y-3">
            <Tabs
              value={panel}
              onChange={setPanel}
              tabs={[
                { id: 'preview', label: 'Preview' },
                { id: 'score', label: `Score ${Math.round(score!.total)}` },
                { id: 'ats', label: 'ATS', count: ats!.issues.length || undefined },
                { id: 'template', label: 'Template' },
                { id: 'versions', label: 'Versions', count: versions.data?.length },
              ]}
            />

            <div className="panel p-3">
              {panel === 'preview' && <ResumePreview content={content} templateId={templateId} />}
              {panel === 'score' && <ScorePanel score={score!} />}
              {panel === 'ats' && (
                <AtsPanel
                  report={ats!}
                  templateId={templateId}
                  onTemplateChange={(id) => {
                    setTemplateId(id)
                    setDirty(true)
                  }}
                />
              )}
              {panel === 'template' && (
                <TemplatePicker
                  value={templateId}
                  onChange={(id) => {
                    setTemplateId(id)
                    setDirty(true)
                  }}
                />
              )}
              {panel === 'versions' && (
                <VersionHistory
                  versions={versions.data ?? []}
                  currentVersionId={resume.current_version_id}
                  onRestore={restore}
                  restoring={restoring}
                />
              )}
            </div>
          </aside>
        </div>
      )}

      <Modal
        open={savePrompt}
        onClose={() => setSavePrompt(false)}
        title="Save a new version"
        subtitle="A short label makes the history readable later."
        size="sm"
        footer={
          <>
            <Button onClick={() => setSavePrompt(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => save(saveLabel)} loading={saving}>
              Save version
            </Button>
          </>
        }
      >
        <Field label="Label" hint="Optional, e.g. “Added metrics to the Ledgerline bullets”.">
          <Input value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} autoFocus />
        </Field>
      </Modal>

      <ConfirmDialog
        open={convertPrompt === 'to_document'}
        onClose={() => setConvertPrompt(null)}
        onConfirm={toDocumentMode}
        title="Switch to document mode?"
        body={
          content.document
            ? 'Your existing page comes back exactly as you left it. The structured fields stay where they are — nothing is deleted either way.'
            : 'Your profile is laid out as an editable A4 page you control completely: type, spacing, order, everything. The structured fields are kept, but matching, tailoring and the resume score read those fields, not the page — so they will go stale until you convert back.'
        }
        confirmLabel="Switch to document mode"
      />

      <ConfirmDialog
        open={convertPrompt === 'to_structured'}
        onClose={() => setConvertPrompt(null)}
        onConfirm={toStructuredMode}
        title="Convert this page back to structured fields?"
        body="The page is read with the same parser used for resume imports, and the result replaces the structured fields. It is a good draft, not a guarantee — check every section afterwards. Your page is kept, so you can switch back to it at any time."
        confirmLabel="Parse the page"
      />
    </div>
  )
}

function sectionCount(content: ResumeContent, key: SectionKey) {
  switch (key) {
    case 'summary':
      return content.summary.trim() ? 1 : 0
    case 'experience':
      return content.experience.length
    case 'education':
      return content.education.length
    case 'skills':
      return content.skills.reduce((n, g) => n + g.skills.length, 0)
    case 'projects':
      return content.projects.length
    case 'certifications':
      return content.certifications.length
    case 'languages':
      return content.languages.length
  }
}

function SectionEditor({
  section,
  content,
  patch,
  jdKeywords,
  jd,
}: {
  section: SectionKey | 'contact'
  content: ResumeContent
  patch: (updater: (draft: ResumeContent) => void) => void
  jdKeywords: string[]
  jd: import('@/types').ParsedJD | null
}) {
  const heading = section === 'contact' ? 'Contact' : SECTION_LABELS[section]

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">{heading}</h2>
        {section !== 'contact' && content.hidden_sections.includes(section) && (
          <Badge tone="warning">hidden from exports</Badge>
        )}
      </div>

      {section === 'contact' && (
        <ContactEditor value={content.contact} onChange={(next) => patch((d) => void (d.contact = next))} />
      )}
      {section === 'summary' && (
        <SummaryEditor value={content.summary} onChange={(next) => patch((d) => void (d.summary = next))} />
      )}
      {section === 'experience' && (
        <ExperienceEditor
          items={content.experience}
          onChange={(next) => patch((d) => void (d.experience = next))}
          jd={jd}
        />
      )}
      {section === 'education' && (
        <EducationEditor items={content.education} onChange={(next) => patch((d) => void (d.education = next))} />
      )}
      {section === 'skills' && (
        <SkillsEditor
          groups={content.skills}
          onChange={(next) => patch((d) => void (d.skills = next))}
          jdKeywords={jdKeywords}
        />
      )}
      {section === 'projects' && (
        <ProjectsEditor items={content.projects} onChange={(next) => patch((d) => void (d.projects = next))} jd={jd} />
      )}
      {section === 'certifications' && (
        <CertificationsEditor
          items={content.certifications}
          onChange={(next) => patch((d) => void (d.certifications = next))}
        />
      )}
      {section === 'languages' && (
        <LanguagesEditor items={content.languages} onChange={(next) => patch((d) => void (d.languages = next))} />
      )}
    </div>
  )
}

function ExportMenu({
  content,
  templateId,
  title,
}: {
  content: ResumeContent
  templateId: TemplateId
  title: string
}) {
  return (
    <Menu label="Export ▾">
      {(run) => (
        <>
          <MenuItem
            label="PDF"
            hint="Opens the print dialog — same CSS as the preview"
            onClick={() => run(() => exportResumePdf(content, templateId, title), 'PDF ready in the print dialog')}
          />
          <MenuItem
            label="DOCX"
            hint="Word-compatible document"
            onClick={() => run(() => exportResumeDocx(content, templateId, title), 'DOCX downloaded')}
          />
          <MenuItem
            label="Plain text"
            hint="For paste-into-form applications"
            onClick={() => run(() => exportResumeTxt(content, title), 'Text file downloaded')}
          />
          <MenuItem
            label="Copy plain text"
            hint="Straight to the clipboard"
            onClick={() =>
              run(() => void navigator.clipboard.writeText(renderResumeText(content)), 'Copied to clipboard')
            }
          />
          <MenuItem
            label="JSON"
            hint="The structured profile itself"
            onClick={() => run(() => exportResumeJson(content, title), 'JSON downloaded')}
          />
          <Hint className="px-2 py-1.5">
            PDF uses the browser's print-to-PDF here. With the backend connected it is rendered server-side so the
            exact bytes can be frozen onto an application.
          </Hint>
        </>
      )}
    </Menu>
  )
}

function DocumentExportMenu({
  doc,
  content,
  title,
}: {
  doc: ResumeDocument
  content: ResumeContent
  title: string
}) {
  return (
    <Menu label="Export ▾">
      {(run) => (
        <>
          <MenuItem
            label="PDF"
            hint="Print dialog — real page margins, real pagination"
            onClick={() => run(() => exportDocumentPdf(doc, title), 'PDF ready in the print dialog')}
          />
          <MenuItem
            label="DOCX"
            hint="Word-compatible document"
            onClick={() => run(() => exportDocumentDocx(doc, title), 'DOCX downloaded')}
          />
          <MenuItem
            label="Plain text"
            hint="What an ATS extracts — worth reading before you send"
            onClick={() => run(() => exportDocumentTxt(doc, title), 'Text file downloaded')}
          />
          <MenuItem
            label="Copy plain text"
            hint="Straight to the clipboard"
            onClick={() => run(() => void navigator.clipboard.writeText(documentToText(doc.html)), 'Copied to clipboard')}
          />
          <MenuItem
            label="HTML"
            hint="The page itself, self-contained"
            onClick={() => run(() => exportDocumentHtmlFile(doc, title), 'HTML downloaded')}
          />
          <MenuItem
            label="JSON"
            hint="Page plus the structured fields kept alongside it"
            onClick={() =>
              run(
                () => download(`${slugify(title)}.json`, JSON.stringify(content, null, 2), 'application/json'),
                'JSON downloaded',
              )
            }
          />
          <Hint className="px-2 py-1.5">
            The PDF is printed from the same stylesheet the editor uses, so the file matches the page you are
            looking at.
          </Hint>
        </>
      )}
    </Menu>
  )
}

/** Shared dropdown shell for the two export menus. */
function Menu({
  label,
  children,
}: {
  label: string
  children: (run: (fn: () => void, message: string) => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  const run = (fn: () => void, message: string) => {
    try {
      fn()
      toast.success(message)
    } catch (err) {
      toastError(err, 'Export failed')
    } finally {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <Button onClick={() => setOpen((v) => !v)}>{label}</Button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-ink-200 bg-surface p-1.5 shadow-pop">
            {children(run)}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-ink-100"
    >
      <div className="text-sm font-medium text-ink-800">{label}</div>
      <div className="text-[11px] text-ink-500">{hint}</div>
    </button>
  )
}
