import { useState } from 'react'
import type { MatchReport, ParsedJD } from '@/types'
import { cn } from '@/lib/utils'
import { Badge, Hint, Pill } from '@/components/ui/primitives'
import { Progress, ScoreRing } from '@/components/ui/feedback'

/**
 * Match / gap analysis (§3). Green for matched, amber for "missing but relevant"
 * with an explicit "only if true" framing — the product never nudges the user
 * toward claiming a skill they do not have.
 */
export function MatchReportView({
  report,
  jd,
  compact = false,
}: {
  report: MatchReport
  jd: ParsedJD
  compact?: boolean
}) {
  const [tab, setTab] = useState<'matched' | 'missing'>('missing')
  const musts = report.missing.filter((m) => m.kind === 'must_have')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ScoreRing
          value={report.score}
          size={compact ? 64 : 84}
          label={`${verdict(report.score)} match`}
          sublabel={`${report.matched.length} matched · ${report.missing.length} gaps`}
        />
        <div className="flex flex-wrap gap-2">
          {jd.seniority && <Badge tone="neutral">{jd.seniority}</Badge>}
          {jd.years_experience_min != null && <Badge tone="neutral">{jd.years_experience_min}+ years</Badge>}
          {jd.remote && <Badge tone="success">remote</Badge>}
          {jd.salary_text && <Badge tone="neutral">{jd.salary_text}</Badge>}
        </div>
      </div>

      {!compact && (
        <div className="space-y-2">
          {report.subscores.map((sub) => (
            <div key={sub.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-ink-700">{sub.label}</span>
                <span className="text-xs tabular-nums text-ink-500">
                  {sub.score} / {sub.max}
                </span>
              </div>
              <Progress
                value={sub.score}
                max={sub.max}
                tone={sub.score / sub.max >= 0.7 ? 'success' : sub.score / sub.max >= 0.4 ? 'warning' : 'danger'}
                className="mt-1"
              />
            </div>
          ))}
          <Hint>
            Every subscore is visible so the number is auditable. Must-have coverage is weighted heaviest, because
            that is what a screener filters on.
          </Hint>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Pill active={tab === 'missing'} onClick={() => setTab('missing')}>
          Gaps ({report.missing.length})
        </Pill>
        <Pill active={tab === 'matched'} onClick={() => setTab('matched')}>
          Matched ({report.matched.length})
        </Pill>
        {musts.length > 0 && (
          <span className="ml-auto text-[11px] text-amber-700">{musts.length} required skills missing</span>
        )}
      </div>

      {tab === 'matched' ? (
        <ul className="space-y-1.5">
          {report.matched.map((row) => (
            <li key={row.keyword} className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-emerald-900">{row.keyword}</span>
                <Badge tone={row.weight >= 3 ? 'success' : 'neutral'}>
                  {row.weight >= 3 ? 'required' : 'nice-to-have'}
                </Badge>
              </div>
              <ul className="mt-1 space-y-0.5">
                {row.evidence.slice(0, 2).map((evidence, i) => (
                  <li key={i} className="text-[11px] text-emerald-800">
                    ↳ {evidence}
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {report.matched.length === 0 && (
            <li className="rounded-lg bg-ink-50 p-3 text-sm text-ink-500">
              Nothing matched. If this role is a genuine stretch, that is useful information too.
            </li>
          )}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {report.missing.map((row) => (
            <li
              key={row.keyword}
              className={cn(
                'rounded-lg border p-2.5',
                row.kind === 'must_have' ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-ink-50',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink-900">{row.keyword}</span>
                <Badge tone={row.kind === 'must_have' ? 'warning' : 'neutral'}>
                  {row.kind === 'must_have' ? 'required' : 'nice-to-have'}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-ink-600">{row.suggestion}</p>
              {row.closest_evidence && (
                <p className="mt-1 text-[11px] text-ink-500">Closest thing you have: {row.closest_evidence}</p>
              )}
            </li>
          ))}
          {report.missing.length === 0 && (
            <li className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              No gaps against this posting. Tailoring is about emphasis now, not coverage.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function verdict(score: number) {
  if (score >= 80) return 'Strong'
  if (score >= 65) return 'Good'
  if (score >= 45) return 'Partial'
  return 'Weak'
}

/** Requirement list with per-atom classification, from the JD parser. */
export function RequirementList({ jd }: { jd: ParsedJD }) {
  const [kind, setKind] = useState<'must_have' | 'nice_to_have' | 'responsibility'>('must_have')
  const rows = jd.requirements.filter((r) => r.kind === kind)

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {(
          [
            ['must_have', 'Must-have'],
            ['nice_to_have', 'Nice-to-have'],
            ['responsibility', 'Responsibilities'],
          ] as const
        ).map(([key, label]) => (
          <Pill key={key} active={kind === key} onClick={() => setKind(key)}>
            {label} ({jd.requirements.filter((r) => r.kind === key).length})
          </Pill>
        ))}
      </div>

      <ul className="space-y-1">
        {rows.map((req) => (
          <li key={req.id} className="rounded-lg border border-ink-200 p-2.5">
            <p className="text-xs text-ink-800">{req.text}</p>
            {req.keyword && (
              <span className="mt-1 inline-block rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">
                {req.keyword}
              </span>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-lg bg-ink-50 p-3 text-xs text-ink-500">
            The parser found none of these in the posting.
          </li>
        )}
      </ul>
    </div>
  )
}
