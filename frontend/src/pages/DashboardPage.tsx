import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { SOURCES } from '@/lib/pipeline'
import { applicationsToCsvRows, downloadCsv, APPLICATION_CSV_COLUMNS } from '@/lib/export/csv'
import { formatDate, pct, relativeTime } from '@/lib/utils'
import { useAsync, useLocalState } from '@/hooks/useAsync'
import { useAuth } from '@/store/auth'
import { toast } from '@/store/toast'
import { Badge, Button, Hint, LinkButton, PageHeader, Pill } from '@/components/ui/primitives'
import { ErrorState, LoadingState, Progress, StatTile } from '@/components/ui/feedback'
import { Select } from '@/components/ui/inputs'
import {
  FunnelBars,
  ResumePerformance,
  SkillGapBars,
  SourceBars,
  StageDurationBars,
  VolumeBars,
} from '@/components/charts/dashboard'

type RangeKey = '30d' | '90d' | '6m' | 'all'

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '6m', label: 'Last 6 months', days: 182 },
  { key: 'all', label: 'All time', days: null },
]

export function DashboardPage() {
  const { user } = useAuth()
  const [range, setRange] = useLocalState<RangeKey>('jobpilot.dash.range', '90d')
  const [source, setSource] = useState<string>('')

  const from = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days
    if (!days) return undefined
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }, [range])

  const dashboard = useAsync(
    () => api.analytics.dashboard({ from, source: source ? [source] : undefined }),
    [from, source],
  )
  const applications = useAsync(() => api.applications.list(), [])

  const exportCsv = () => {
    if (!applications.data?.length) {
      toast.info('Nothing to export yet')
      return
    }
    downloadCsv('jobpilot-applications.csv', applicationsToCsvRows(applications.data), APPLICATION_CSV_COLUMNS)
    toast.success('Exported', 'A CSV of every application, useful for visa or benefits reporting.')
  }

  if (dashboard.loading && !dashboard.data) return <LoadingState label="Crunching your pipeline…" />
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={dashboard.reload} />
  if (!dashboard.data) return null

  const { funnel, volume, response, sources, skill_gaps, follow_ups_due, generated_at } = dashboard.data
  const goalProgress = volume.goal > 0 ? volume.current_week / volume.goal : 0

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`${greeting()}, ${user?.full_name?.split(' ')[0] ?? 'there'}`}
        subtitle={`Everything below is computed from your own tracker data · updated ${relativeTime(generated_at)}`}
        actions={
          <>
            <Button onClick={exportCsv}>Export CSV</Button>
            <LinkButton to="/discovery" variant="primary">
              Review new matches
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Pill key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </Pill>
        ))}
        <div className="ml-auto w-44">
          <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Hero row: the four numbers a job seeker actually asks about. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Applications in range"
          value={funnel.total}
          hint={`${volume.current_week} this week against a goal of ${volume.goal}`}
          tone="brand"
        />
        <StatTile
          label="Response rate"
          value={pct(funnel.response_rate)}
          hint={
            response.avg_days_to_first_response != null
              ? `First reply averages ${response.avg_days_to_first_response} days`
              : 'No responses recorded yet'
          }
        />
        <StatTile
          label="Interview rate"
          value={pct(funnel.interview_rate)}
          hint={`${funnel.stages.find((s) => s.status === 'Interview')?.count ?? 0} reached interview`}
          tone="success"
        />
        <StatTile
          label="Ghosted after 14 days"
          value={pct(response.no_response_rate)}
          hint="No reply of any kind, two weeks after applying"
          tone={response.no_response_rate > 0.6 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-1">
          <h3 className="text-sm font-semibold text-ink-900">Weekly goal</h3>
          <p className="mt-0.5 text-xs text-ink-500">
            {volume.current_week} of {volume.goal} applications this week
          </p>
          <div className="mt-3">
            <Progress
              value={volume.current_week}
              max={volume.goal}
              tone={goalProgress >= 1 ? 'success' : goalProgress >= 0.5 ? 'brand' : 'warning'}
              showLabel
            />
          </div>
          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-ink-500">Current streak</dt>
              <dd className="font-medium tabular-nums text-ink-800">{volume.current_streak_weeks} weeks</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Best streak</dt>
              <dd className="font-medium tabular-nums text-ink-800">{volume.best_streak_weeks} weeks</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Offers</dt>
              <dd className="font-medium tabular-nums text-ink-800">
                {funnel.stages.find((s) => s.status === 'Offer')?.count ?? 0}
              </dd>
            </div>
          </dl>
          <Hint className="mt-3">
            Change the target in <Link to="/settings" className="link">Settings</Link>.
          </Hint>
        </div>

        <div className="panel p-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Follow-ups due</h3>
              <p className="mt-0.5 text-xs text-ink-500">
                Open applications with no movement for {user?.follow_up_days ?? 7}+ days.
              </p>
            </div>
            <Badge tone={follow_ups_due.length ? 'warning' : 'success'}>
              {follow_ups_due.length} due
            </Badge>
          </div>

          {follow_ups_due.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">Nothing to chase. Enjoy it while it lasts.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {follow_ups_due.slice(0, 6).map((app) => (
                <li key={app.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link to={`/applications/${app.id}`} className="truncate text-sm font-medium text-ink-800 hover:text-brand-700">
                      {app.role_title}
                    </Link>
                    <div className="text-xs text-ink-500">
                      {app.company_name} · {app.status} · applied {formatDate(app.applied_at)}
                    </div>
                  </div>
                  <LinkButton to={`/applications/${app.id}`} size="sm">
                    Open
                  </LinkButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <FunnelBars funnel={funnel} />
        <VolumeBars volume={volume} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <SourceBars sources={sources} />
        <ResumePerformance funnel={funnel} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SkillGapBars gaps={skill_gaps} />
        <StageDurationBars response={response} />
      </div>
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
