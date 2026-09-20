import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { extractTextFromFile } from '@/lib/ai/resumeParse'
import type { ParseResult } from '@/lib/ai/resumeParse'
import type { ResumeMode } from '@/types'
import { textToDocumentHtml } from '@/lib/doc/convert'
import { defaultDocumentPage } from '@/lib/doc/render'
import { cn } from '@/lib/utils'
import { Badge, Button, Hint } from '@/components/ui/primitives'
import { Field, Input, Textarea } from '@/components/ui/inputs'
import { Modal } from '@/components/ui/overlays'
import { GeneratingState, Progress } from '@/components/ui/feedback'
import { toast, toastError } from '@/store/toast'

/**
 * Resume import (§2.1). Heuristic parse, then a manual-correction step — parsing
 * accuracy is never 100%, so the user always sees what was extracted before it
 * becomes their profile.
 */
export function ImportResumeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('Imported resume')
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [parse, setParse] = useState<ParseResult | null>(null)
  const [target, setTarget] = useState<ResumeMode>('structured')
  const [stage, setStage] = useState<'input' | 'parsing' | 'review' | 'saving'>('input')

  const reset = () => {
    setText('')
    setNote(null)
    setParse(null)
    setTarget('structured')
    setStage('input')
  }

  const onFile = async (file: File) => {
    setStage('parsing')
    try {
      const extracted = await extractTextFromFile(file)
      setNote(extracted.note)
      setText(extracted.text)
      if (!extracted.text.trim()) {
        setStage('input')
        toast.error('Nothing could be read from that file', extracted.note ?? 'Try pasting the text instead.')
        return
      }
      const result = await api.resumes.parseOnly(extracted.text)
      setParse(result)
      setTitle(result.content.contact.full_name ? `${result.content.contact.full_name} — imported` : file.name)
      setStage('review')
    } catch (err) {
      toastError(err, 'Import failed')
      setStage('input')
    }
  }

  const parsePasted = async () => {
    if (!text.trim()) {
      toast.info('Paste your resume text first')
      return
    }
    setStage('parsing')
    try {
      const result = await api.resumes.parseOnly(text)
      setParse(result)
      setStage('review')
    } catch (err) {
      toastError(err, 'Parse failed')
      setStage('input')
    }
  }

  const save = async () => {
    if (!parse) return
    setStage('saving')
    try {
      // Either way the structured fields are stored. Importing "as a document"
      // additionally lays the extracted text out as an editable page, so the
      // conversion back is available without a second import.
      const content =
        target === 'freeform'
          ? {
              ...parse.content,
              mode: 'freeform' as const,
              document: { html: textToDocumentHtml(text), page: defaultDocumentPage() },
            }
          : parse.content
      const created = await api.resumes.create({ title, content })
      toast.success(
        'Imported',
        target === 'freeform'
          ? 'Your page is editable — check the layout, the extraction is never perfect.'
          : 'Check every field — the parser is good, not perfect.',
      )
      onClose()
      reset()
      navigate(`/resumes/${created.resume.id}`)
    } catch (err) {
      toastError(err, 'Could not save the imported resume')
      setStage('review')
    }
  }

  const counts = parse
    ? {
        experience: parse.content.experience.length,
        bullets: parse.content.experience.reduce((n, e) => n + e.bullets.length, 0),
        education: parse.content.education.length,
        skills: parse.content.skills.reduce((n, g) => n + g.skills.length, 0),
        projects: parse.content.projects.length,
      }
    : null

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      title="Import an existing resume"
      subtitle="PDF, DOCX or plain text. It becomes structured data you can edit, not an attachment."
      size="lg"
      footer={
        stage === 'review' || stage === 'saving' ? (
          <>
            <Button onClick={reset}>Start over</Button>
            <Button variant="primary" onClick={save} loading={stage === 'saving'}>
              {target === 'freeform' ? 'Open as a document' : 'Create resume and review fields'}
            </Button>
          </>
        ) : (
          <Button onClick={parsePasted} variant="primary" loading={stage === 'parsing'}>
            Parse pasted text
          </Button>
        )
      }
    >
      {stage === 'parsing' && (
        <GeneratingState
          title="Parsing your resume"
          steps={[
            'Extracting text',
            'Detecting section headers',
            'Splitting roles, dates and bullets',
            'Inferring skills',
          ]}
        />
      )}

      {stage === 'input' && (
        <div className="space-y-4">
          <div
            className="rounded-xl border-2 border-dashed border-ink-300 p-6 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file) void onFile(file)
            }}
          >
            <p className="text-sm font-medium text-ink-800">Drop a PDF or DOCX here</p>
            <p className="mt-1 text-xs text-ink-500">or</p>
            <Button className="mt-2" onClick={() => fileRef.current?.click()}>
              Choose a file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onFile(file)
              }}
            />
          </div>

          <Hint>
            In mock mode the extraction runs entirely in your browser, so compressed PDFs may come out partial —
            pasting the text always works. With the backend connected, extraction uses the server-side
            pdfplumber/docx pipeline plus an LLM pass for messy layouts.
          </Hint>

          <Field label="Or paste the text">
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume…" />
          </Field>
        </div>
      )}

      {stage !== 'input' && stage !== 'parsing' && parse && counts && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <TargetCard
              active={target === 'structured'}
              onClick={() => setTarget('structured')}
              title="As a structured profile"
              body="Fields the match score, the tailoring engine and discovery can read. Templates apply."
            />
            <TargetCard
              active={target === 'freeform'}
              onClick={() => setTarget('freeform')}
              title="As an editable document"
              body="The extracted text laid out as a page you edit directly — closest to the file you uploaded."
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-ink-700">Parse confidence</span>
                <span className="text-xs tabular-nums text-ink-500">{parse.confidence}%</span>
              </div>
              <Progress
                value={parse.confidence}
                tone={parse.confidence >= 80 ? 'success' : parse.confidence >= 60 ? 'warning' : 'danger'}
                className="mt-1"
              />
            </div>
          </div>

          {note && <div className="rounded-lg bg-ink-50 p-2.5 text-xs text-ink-600">{note}</div>}

          {parse.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              {parse.warnings.map((w) => (
                <li key={w} className="text-xs text-amber-900">
                  ▲ {w}
                </li>
              ))}
            </ul>
          )}

          <Field label="Resume title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Object.entries(counts).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-ink-200 p-2 text-center">
                <div className="text-lg font-semibold tabular-nums text-ink-900">{value}</div>
                <div className="text-[10px] uppercase tracking-wide text-ink-500">{key}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-ink-200">
            <div className="border-b border-ink-100 px-3 py-2 text-xs font-semibold text-ink-700">
              What was detected
            </div>
            <dl className="divide-y divide-ink-100 text-xs">
              <Row label="Name" value={parse.content.contact.full_name} />
              <Row label="Email" value={parse.content.contact.email} />
              <Row label="Phone" value={parse.content.contact.phone} />
              <Row label="Location" value={parse.content.contact.location} />
              <Row
                label="Roles"
                value={parse.content.experience.map((e) => `${e.title || '?'} @ ${e.company || '?'}`).join(' · ')}
              />
            </dl>
          </div>

          {parse.unparsed.length > 0 && (
            <details className="rounded-lg border border-ink-200 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink-700">
                {parse.unparsed.length} lines could not be placed
                <Badge tone="warning" className="ml-2">
                  review
                </Badge>
              </summary>
              <ul className="mt-2 space-y-1">
                {parse.unparsed.map((line, i) => (
                  <li key={i} className="rounded bg-ink-50 px-2 py-1 text-[11px] text-ink-600">
                    {line}
                  </li>
                ))}
              </ul>
              <Hint className="mt-2">Nothing is thrown away silently — add these manually if they matter.</Hint>
            </details>
          )}
        </div>
      )}
    </Modal>
  )
}

function TargetCard({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean
  onClick: () => void
  title: string
  body: string
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
      <div className="text-sm font-medium text-ink-900">{title}</div>
      <p className="mt-1 text-xs text-ink-600">{body}</p>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-1.5">
      <dt className="text-ink-500">{label}</dt>
      <dd className={value ? 'text-right text-ink-800' : 'text-right text-amber-600'}>
        {value || 'not detected'}
      </dd>
    </div>
  )
}
