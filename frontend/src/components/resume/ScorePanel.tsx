import type { AtsReport, ResumeScore, TemplateId } from '@/types'
import { TEMPLATES, templateMeta } from '@/lib/export/templates'
import { cn } from '@/lib/utils'
import { Badge, Hint } from '@/components/ui/primitives'
import { Progress, ScoreRing } from '@/components/ui/feedback'

/**
 * Resume score as an actionable checklist (§2): the number is a summary of the
 * rows, not a verdict on its own.
 */
export function ScorePanel({ score }: { score: ResumeScore }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <ScoreRing
          value={score.total}
          max={score.max}
          label={verdict(score.total)}
          sublabel={`${score.total} of ${score.max} on the rubric`}
        />
      </div>

      <div className="space-y-3">
        {score.subscores.map((sub) => (
          <div key={sub.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-ink-700">{sub.label}</span>
              <span className="text-xs tabular-nums text-ink-500">
                {sub.score} / {sub.max}
              </span>
            </div>
            <Progress
              value={sub.score}
              max={sub.max}
              tone={sub.score / sub.max >= 0.75 ? 'success' : sub.score / sub.max >= 0.4 ? 'warning' : 'danger'}
              className="mt-1"
            />
            <ul className="mt-1.5 space-y-1">
              {sub.findings.map((finding, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className={finding.ok ? 'text-emerald-600' : 'text-amber-600'}>
                    {finding.ok ? '✓' : '•'}
                  </span>
                  <span className={finding.ok ? 'text-ink-600' : 'text-ink-700'}>{finding.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function verdict(total: number) {
  if (total >= 85) return 'Strong'
  if (total >= 70) return 'Solid'
  if (total >= 50) return 'Needs work'
  return 'Thin'
}

/** ATS compatibility checker (§2). */
export function AtsPanel({
  report,
  templateId,
  onTemplateChange,
}: {
  report: AtsReport
  templateId: TemplateId
  onTemplateChange?: (id: TemplateId) => void
}) {
  const meta = templateMeta(templateId)
  const errors = report.issues.filter((i) => i.severity === 'error')
  const warnings = report.issues.filter((i) => i.severity === 'warning')
  const infos = report.issues.filter((i) => i.severity === 'info')

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {report.passed ? (
          <Badge tone="success">✓ No blocking issues</Badge>
        ) : (
          <Badge tone="danger">{errors.length} blocking issue{errors.length === 1 ? '' : 's'}</Badge>
        )}
        <Badge tone={meta.ats_safe ? 'neutral' : 'warning'}>
          {meta.ats_safe ? 'ATS-safe template' : 'Designed template'}
        </Badge>
      </div>

      {!meta.ats_safe && onTemplateChange && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">
            You are on a multi-column layout. Good for a referral or a direct email; risky for a portal upload.
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-amber-900 underline"
            onClick={() => onTemplateChange('ats-classic')}
          >
            Switch to Classic (ATS-safe)
          </button>
        </div>
      )}

      {report.issues.length === 0 ? (
        <p className="text-xs text-ink-500">
          Nothing to fix: single column, standard headers, contact details in the body, no exotic markup.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...errors, ...warnings, ...infos].map((issue) => (
            <li
              key={issue.code + issue.message}
              className={cn(
                'rounded-lg border p-2.5',
                issue.severity === 'error'
                  ? 'border-rose-200 bg-rose-50'
                  : issue.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-ink-200 bg-ink-50',
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-px text-xs font-bold',
                    issue.severity === 'error'
                      ? 'text-rose-600'
                      : issue.severity === 'warning'
                        ? 'text-amber-600'
                        : 'text-ink-400',
                  )}
                >
                  {issue.severity === 'error' ? '!' : issue.severity === 'warning' ? '▲' : 'i'}
                </span>
                <div>
                  <p className="text-xs font-medium text-ink-800">{issue.message}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{issue.fix}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TemplatePicker({
  value,
  onChange,
}: {
  value: TemplateId
  onChange: (id: TemplateId) => void
}) {
  return (
    <div className="space-y-2">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onChange(template.id)}
          className={cn(
            'w-full rounded-lg border p-3 text-left transition-colors',
            value === template.id
              ? 'border-brand-400 bg-brand-50'
              : 'border-ink-200 bg-surface hover:border-ink-300',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-900">{template.name}</span>
            <Badge tone={template.ats_safe ? 'success' : 'warning'}>
              {template.ats_safe ? 'ATS-safe' : 'Design'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-ink-600">{template.description}</p>
          <p className="mt-1 text-[11px] text-ink-400">Best for: {template.best_for}</p>
        </button>
      ))}
      <Hint>
        Four single-column ATS layouts and two designed ones. The designed layouts are for referrals and
        direct-to-hiring-manager sends, where a human opens the file.
      </Hint>
    </div>
  )
}
