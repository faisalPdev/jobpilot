import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CoverLetter } from '@/types'
import { api } from '@/lib/api'
import { download, relativeTime, slugify, wordCount } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, LinkButton, PageHeader } from '@/components/ui/primitives'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback'
import { Textarea } from '@/components/ui/inputs'
import { ConfirmDialog } from '@/components/ui/overlays'
import { TruthGuardPanel } from '@/components/tailor/ChangeList'

export function CoverLettersPage() {
  const letters = useAsync(() => api.coverLetters.list(), [])
  const jds = useAsync(() => api.jds.list(), [])
  const [selected, setSelected] = useState<CoverLetter | null>(null)
  const [deleting, setDeleting] = useState<CoverLetter | null>(null)
  const [pending, setPending] = useState(false)

  const active = selected ?? letters.data?.[0] ?? null
  const jdFor = (letter: CoverLetter | null) =>
    letter ? jds.data?.find((jd) => jd.id === letter.job_description_id) ?? null : null

  const save = async (content: string) => {
    if (!active) return
    setSelected({ ...active, content })
    try {
      await api.coverLetters.update(active.id, { content })
    } catch (err) {
      toastError(err, 'Could not save')
    }
  }

  const remove = async () => {
    if (!deleting) return
    setPending(true)
    try {
      await api.coverLetters.remove(deleting.id)
      toast.success('Deleted')
      if (active?.id === deleting.id) setSelected(null)
      setDeleting(null)
      letters.reload()
    } catch (err) {
      toastError(err, 'Could not delete')
    } finally {
      setPending(false)
    }
  }

  if (letters.loading && !letters.data) return <LoadingState label="Loading cover letters…" />
  if (letters.error) return <ErrorState error={letters.error} onRetry={letters.reload} />

  const rows = letters.data ?? []

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Cover letters"
        subtitle="Drafted from the posting plus your own bullets, in the tone you pick. Edited text is saved as you type."
        actions={<LinkButton to="/tailor" variant="primary">Draft a new one</LinkButton>}
      />

      {rows.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="✎"
            title="No cover letters yet"
            body="Generate one alongside a tailored resume — the tailoring page has the tone options and the “why this company” field."
            action={<LinkButton to="/tailor" variant="primary">Open the tailoring engine</LinkButton>}
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="panel divide-y divide-ink-100">
            {rows.map((letter) => {
              const jd = jdFor(letter)
              return (
                <button
                  key={letter.id}
                  type="button"
                  onClick={() => setSelected(letter)}
                  className={`block w-full p-3 text-left transition-colors ${
                    active?.id === letter.id ? 'bg-brand-50' : 'hover:bg-ink-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink-900">
                      {jd?.company_name ?? 'Unknown company'}
                    </span>
                    <Badge tone="neutral">{letter.tone}</Badge>
                  </div>
                  <p className="truncate text-xs text-ink-500">{jd?.role_title ?? 'Job description removed'}</p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {wordCount(letter.content)} words · {relativeTime(letter.created_at)}
                  </p>
                  {letter.truth_flags.length > 0 && (
                    <Badge tone="danger" className="mt-1">
                      {letter.truth_flags.length} unverified
                    </Badge>
                  )}
                </button>
              )
            })}
          </aside>

          {active && (
            <div className="panel p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">
                    {jdFor(active)?.role_title ?? 'Cover letter'}
                  </h2>
                  <p className="text-xs text-ink-500">
                    {jdFor(active)?.company_name} · {active.tone} tone · {wordCount(active.content)} words
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(active.content)
                      toast.success('Copied')
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      download(
                        `cover-letter-${slugify(jdFor(active)?.company_name ?? 'company')}.txt`,
                        active.content,
                        'text/plain',
                      )
                    }
                  >
                    Download
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(active)}>
                    Delete
                  </Button>
                </div>
              </div>

              <TruthGuardPanel flags={active.truth_flags} />

              {active.why_company_notes && (
                <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    Your “why this company” notes
                  </div>
                  <p className="mt-1 text-xs text-ink-700">{active.why_company_notes}</p>
                </div>
              )}

              <Textarea
                rows={22}
                value={active.content}
                onChange={(e) => save(e.target.value)}
                className="mt-3 font-serif text-sm leading-relaxed"
              />

              <Hint className="mt-2">
                Read it once before sending. A generated letter that no human has read is obvious to the person
                reading it.{' '}
                {jdFor(active) && (
                  <Link to={`/job-descriptions/${jdFor(active)!.id}`} className="link">
                    See the posting
                  </Link>
                )}
              </Hint>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this cover letter?"
        body="Applications that already attached a frozen copy keep it."
        confirmLabel="Delete"
        destructive
        loading={pending}
      />
    </div>
  )
}
