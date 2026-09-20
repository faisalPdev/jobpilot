import type { KeywordDensityReport, TailorChange, TruthFlag } from '@/types'
import { cn } from '@/lib/utils'
import { Badge, Button, Hint } from '@/components/ui/primitives'

const KIND_LABELS: Record<TailorChange['kind'], string> = {
  summary_rewrite: 'Summary',
  headline_rewrite: 'Headline',
  bullet_rewrite: 'Bullet rewrite',
  bullet_reorder: 'Bullet order',
  experience_reorder: 'Role order',
  skills_reorder: 'Skill order',
}

/**
 * Per-change review (§3 "diff view"). Nothing is applied to a saved resume until
 * the user accepts it here, and each row carries its rationale and the JD
 * keywords it pulls in.
 */
export function ChangeList({
  changes,
  onToggle,
  onToggleAll,
  truthFlags,
}: {
  changes: TailorChange[]
  onToggle: (id: string, accepted: boolean) => void
  onToggleAll: (accepted: boolean) => void
  truthFlags: TruthFlag[]
}) {
  const accepted = changes.filter((c) => c.accepted).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-ink-600">
          <span className="font-semibold text-ink-900">{accepted}</span> of {changes.length} changes accepted
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onToggleAll(true)}>
            Accept all
          </Button>
          <Button size="sm" onClick={() => onToggleAll(false)}>
            Reject all
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {changes.map((change) => {
          const flags = truthFlags.filter((f) => f.change_id === change.id)
          const isReorder = change.kind.endsWith('reorder')
          return (
            <li
              key={change.id}
              className={cn(
                'rounded-xl border p-3 transition-colors',
                change.accepted ? 'border-brand-200 bg-brand-50/40' : 'border-ink-200 bg-surface',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isReorder ? 'neutral' : 'brand'}>{KIND_LABELS[change.kind]}</Badge>
                    <span className="truncate text-xs text-ink-500">{change.path}</span>
                    {flags.length > 0 && <Badge tone="danger">{flags.length} unverified</Badge>}
                  </div>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={change.accepted}
                    onChange={(e) => onToggle(change.id, e.target.checked)}
                    className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                  />
                  <span className="text-ink-600">{change.accepted ? 'Accepted' : 'Rejected'}</span>
                </label>
              </div>

              <div className="mt-2 space-y-1.5">
                {isReorder ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <pre className="whitespace-pre-wrap rounded-lg bg-ink-50 px-2 py-1.5 text-[11px] text-ink-600">
                      {change.before}
                    </pre>
                    <pre className="whitespace-pre-wrap rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-900">
                      {change.after}
                    </pre>
                  </div>
                ) : (
                  <>
                    <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-900">
                      <span className="mr-1 font-semibold">−</span>
                      {change.before || <em className="text-rose-500">empty</em>}
                    </p>
                    <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
                      <span className="mr-1 font-semibold">+</span>
                      {change.after}
                    </p>
                  </>
                )}
              </div>

              <p className="mt-2 text-[11px] text-ink-500">{change.rationale}</p>

              {change.keywords.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {change.keywords.map((keyword) => (
                    <span key={keyword} className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] text-brand-800">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              {flags.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {flags.map((flag) => (
                    <li key={flag.entity} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5">
                      <p className="text-[11px] text-rose-900">{flag.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {changes.length === 0 && (
        <p className="rounded-lg bg-ink-50 p-4 text-sm text-ink-500">
          The engine found nothing worth changing for this posting. That usually means your bullets already lead
          with impact and use the posting's vocabulary.
        </p>
      )}
    </div>
  )
}

/** §3.1 — the post-generation validator's output, shown prominently. */
export function TruthGuardPanel({ flags }: { flags: TruthFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="text-xs font-semibold text-emerald-900">✓ Truthfulness check passed</div>
        <p className="mt-1 text-[11px] text-emerald-800">
          Every company, tool, certification and number in the generated text traces back to something in your
          resume. Nothing new was introduced.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
      <div className="text-xs font-semibold text-rose-900">
        {flags.length} claim{flags.length === 1 ? '' : 's'} could not be verified
      </div>
      <p className="mt-1 text-[11px] text-rose-800">
        These appear in the generated text but not in your source resume. Reject the change, or add the fact to your
        profile if it is genuinely true.
      </p>
      <ul className="mt-2 space-y-1">
        {flags.map((flag) => (
          <li key={`${flag.kind}-${flag.entity}`} className="rounded bg-surface/70 px-2 py-1">
            <span className="text-[11px] font-medium text-rose-900">{flag.entity}</span>
            <span className="ml-1.5 rounded bg-rose-100 px-1 text-[10px] uppercase text-rose-700">{flag.kind}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** §3 — keyword-stuffing guardrail. */
export function DensityPanel({ density }: { density: KeywordDensityReport }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        density.ok ? 'border-ink-200 bg-surface' : 'border-amber-200 bg-amber-50',
      )}
    >
      <div className="text-xs font-semibold text-ink-900">
        {density.ok ? '✓ Keyword density looks human' : '▲ Possible keyword stuffing'}
      </div>
      <p className="mt-1 text-[11px] text-ink-600">
        {density.total_words} words scanned. A resume that games a naive ATS but reads as spam to a person is a net
        loss.
      </p>
      {!density.ok && (
        <ul className="mt-2 space-y-1">
          {density.overused.map((row) => (
            <li key={row.keyword} className="flex justify-between rounded bg-surface/70 px-2 py-1 text-[11px]">
              <span className="font-medium text-amber-900">{row.keyword}</span>
              <span className="tabular-nums text-amber-800">
                {row.count}× ({row.per_1000}/1000 words)
              </span>
            </li>
          ))}
        </ul>
      )}
      <Hint className="mt-2">Threshold: 12 mentions per 1000 words, with at least 4 mentions.</Hint>
    </div>
  )
}
