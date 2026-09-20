import { useMemo, useState } from 'react'
import type { ResumeContent, ResumeVersion } from '@/types'
import { formatDateTime, relativeTime, stripHtml } from '@/lib/utils'
import { renderResumeText } from '@/lib/export/render'
import { Badge, Button, Hint } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/** Line-level diff between two renders of the resume, for the version timeline. */
function diffLines(before: string, after: string) {
  const a = before.split('\n')
  const b = after.split('\n')
  const bSet = new Set(b)
  const aSet = new Set(a)
  const removed = a.filter((line) => line.trim() && !bSet.has(line))
  const added = b.filter((line) => line.trim() && !aSet.has(line))
  return { removed, added }
}

export function VersionHistory({
  versions,
  currentVersionId,
  onRestore,
  restoring,
}: {
  versions: ResumeVersion[]
  currentVersionId: string
  onRestore: (versionId: string) => void
  restoring: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  const diffs = useMemo(() => {
    const map = new Map<string, { removed: string[]; added: string[] }>()
    const ordered = [...versions].sort((a, b) => a.version_number - b.version_number)
    ordered.forEach((version, i) => {
      const prev = ordered[i - 1]
      map.set(
        version.id,
        prev
          ? diffLines(renderResumeText(prev.content), renderResumeText(version.content))
          : { removed: [], added: [] },
      )
    })
    return map
  }, [versions])

  if (!versions.length) return <Hint>No versions yet — the first save creates one.</Hint>

  return (
    <div className="space-y-2">
      <Hint>
        Every save is a snapshot. Restoring adds a new version rather than rewriting history, so an application
        can always point at the exact resume that was sent.
      </Hint>

      <ol className="relative space-y-2 border-l border-ink-200 pl-4">
        {versions.map((version) => {
          const diff = diffs.get(version.id)
          const isCurrent = version.id === currentVersionId
          const isOpen = openId === version.id
          return (
            <li key={version.id} className="relative">
              <span
                className={cn(
                  'absolute -left-[21px] top-2.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface',
                  isCurrent ? 'bg-brand-500' : 'bg-ink-300',
                )}
              />
              <div className="rounded-lg border border-ink-200 bg-surface p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-800">v{version.version_number}</span>
                      {isCurrent && <Badge tone="brand">current</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-600">{version.label || 'Saved'}</p>
                    <p className="text-[11px] text-ink-400" title={formatDateTime(version.created_at)}>
                      {relativeTime(version.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(isOpen ? null : version.id)}>
                      {isOpen ? 'Hide' : 'Diff'}
                    </Button>
                    {!isCurrent && (
                      <Button size="sm" onClick={() => onRestore(version.id)} loading={restoring}>
                        Restore
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-2 space-y-1 border-t border-ink-100 pt-2">
                    {!diff || (!diff.added.length && !diff.removed.length) ? (
                      <p className="text-xs text-ink-400">
                        {version.version_number === 1 ? 'First version.' : 'No text changes from the previous version.'}
                      </p>
                    ) : (
                      <>
                        {diff.removed.slice(0, 8).map((line, i) => (
                          <p key={`r${i}`} className="diff-del rounded px-1.5 py-0.5 text-[11px]">
                            − {stripHtml(line).slice(0, 160)}
                          </p>
                        ))}
                        {diff.added.slice(0, 8).map((line, i) => (
                          <p key={`a${i}`} className="diff-ins rounded px-1.5 py-0.5 text-[11px]">
                            + {stripHtml(line).slice(0, 160)}
                          </p>
                        ))}
                        {(diff.added.length > 8 || diff.removed.length > 8) && (
                          <p className="text-[11px] text-ink-400">
                            …and {Math.max(0, diff.added.length - 8) + Math.max(0, diff.removed.length - 8)} more
                            changed lines
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Compact side-by-side used by the tailoring diff and the version compare. */
export function TextDiff({
  before,
  after,
  beforeLabel = 'Before',
  afterLabel = 'After',
}: {
  before: string
  after: string
  beforeLabel?: string
  afterLabel?: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <div className="label">{beforeLabel}</div>
        <p className="whitespace-pre-wrap rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-900">{before || '—'}</p>
      </div>
      <div>
        <div className="label">{afterLabel}</div>
        <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
          {after || '—'}
        </p>
      </div>
    </div>
  )
}

export function contentSignature(content: ResumeContent) {
  return renderResumeText(content)
}
