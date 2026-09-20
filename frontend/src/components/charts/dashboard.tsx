import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  FunnelReport,
  ResponseTimeReport,
  SkillGapReport,
  SourceReport,
  VolumeReport,
} from '@/types'
import { BAR_MAX, percentLabel, shortWeek, useChartTheme } from '@/lib/viz'
import { cn } from '@/lib/utils'
import { Pill } from '@/components/ui/primitives'

/* ------------------------------------------------------------------ frame */

export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
  height = 260,
  actions,
}: {
  title: string
  subtitle?: string
  /** Required whenever two or more series are plotted. */
  legend?: { label: string; color: string }[]
  /** A table view is always available, so no value is locked inside a mark. */
  table?: ReactNode
  children: ReactNode
  height?: number
  actions?: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {actions}
          {table && (
            <Pill active={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Chart' : 'Table'}
            </Pill>
          )}
        </div>
      </div>

      {legend && legend.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-3">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-xs text-ink-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {showTable && table ? (
        <div className="scrollbar-thin overflow-x-auto">{table}</div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </section>
  )
}

function TooltipBox({
  active,
  payload,
  label,
  rows,
}: {
  active?: boolean
  payload?: { payload: Record<string, unknown> }[]
  label?: string | number
  rows: (row: Record<string, unknown>) => { label: string; value: ReactNode }[]
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-ink-200 bg-surface px-3 py-2 shadow-pop">
      <div className="mb-1 text-xs font-semibold text-ink-900">{String(label ?? '')}</div>
      <dl className="space-y-0.5">
        {rows(row).map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 text-xs">
            <dt className="text-ink-500">{r.label}</dt>
            <dd className="font-medium tabular-nums text-ink-800">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/* ----------------------------------------------------------------- funnel */

export function FunnelBars({ funnel }: { funnel: FunnelReport }) {
  const { AXIS_TICK, CHROME, ORDINAL_BLUE } = useChartTheme()
  const data = funnel.stages.map((stage, i) => ({
    ...stage,
    fill: ORDINAL_BLUE[Math.min(i, ORDINAL_BLUE.length - 1)],
    conversionLabel: i === 0 ? '' : percentLabel(stage.conversion),
  }))

  return (
    <ChartFrame
      title="Pipeline funnel"
      subtitle="Counts the furthest stage each application reached, so a later rejection does not erase an interview."
      height={data.length * 44 + 24}
      table={
        <table className="table-base">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Reached</th>
              <th>Conversion from previous</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.status}>
                <td>{row.status}</td>
                <td className="tabular-nums">{row.count}</td>
                <td className="tabular-nums">{row.conversionLabel || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="status"
            width={78}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: CHROME.cursor }}
            content={
              <TooltipBox
                rows={(row) => [
                  { label: 'Reached', value: String(row.count) },
                  { label: 'From previous', value: (row.conversionLabel as string) || '—' },
                ]}
              />
            }
          />
          <Bar dataKey="count" maxBarSize={BAR_MAX} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.status} fill={row.fill} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              className="fill-ink-800"
              style={{ fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ----------------------------------------------------------------- volume */

export function VolumeBars({ volume }: { volume: VolumeReport }) {
  const { AXIS_TICK, CHROME, ORDINAL_BLUE, SERIES } = useChartTheme()
  const [grain, setGrain] = useState<'weekly' | 'monthly'>('weekly')
  const rows = grain === 'weekly' ? volume.weekly : volume.monthly
  const data = rows.map((row) => ({
    ...row,
    label: grain === 'weekly' ? shortWeek(row.period) : row.period,
    hitGoal: row.applications >= row.goal,
  }))

  return (
    <ChartFrame
      title="Application volume"
      subtitle={`Target ${volume.goal}/week · current streak ${volume.current_streak_weeks} week${
        volume.current_streak_weeks === 1 ? '' : 's'
      } (best ${volume.best_streak_weeks})`}
      actions={
        <>
          <Pill active={grain === 'weekly'} onClick={() => setGrain('weekly')}>
            Weekly
          </Pill>
          <Pill active={grain === 'monthly'} onClick={() => setGrain('monthly')}>
            Monthly
          </Pill>
        </>
      }
      table={
        <table className="table-base">
          <thead>
            <tr>
              <th>Period</th>
              <th>Applications</th>
              <th>Goal</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.period}>
                <td>{row.label}</td>
                <td className="tabular-nums">{row.applications}</td>
                <td className="tabular-nums">{row.goal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 4, left: -18 }} barGap={2}>
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: CHROME.axis }} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: CHROME.cursor }}
            content={
              <TooltipBox
                rows={(row) => [
                  { label: 'Applications', value: String(row.applications) },
                  { label: 'Goal', value: String(row.goal) },
                ]}
              />
            }
          />
          <ReferenceLine
            y={rows[0]?.goal ?? 0}
            stroke={CHROME.axis}
            strokeWidth={1}
            label={{ value: 'goal', position: 'insideTopRight', fill: CHROME.muted, fontSize: 10 }}
          />
          <Bar dataKey="applications" maxBarSize={BAR_MAX} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((row) => (
              // One series, two states: on/off target. The state is also in the
              // tooltip and the table, so colour is not carrying it alone.
              <Cell key={row.period} fill={row.hitGoal ? SERIES[0] : ORDINAL_BLUE[0]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ---------------------------------------------------------------- sources */

export function SourceBars({ sources }: { sources: SourceReport }) {
  const { AXIS_TICK, CHROME, SERIES } = useChartTheme()
  const data = sources.rows.map((row) => ({
    ...row,
    interviewPct: row.interview_rate * 100,
    responsePct: row.response_rate * 100,
  }))

  return (
    <ChartFrame
      title="Source performance"
      subtitle="Which channels convert, not just which you use most. Volume is in the tooltip and the table."
      legend={[
        { label: 'Response rate', color: SERIES[0] },
        { label: 'Interview rate', color: SERIES[1] },
      ]}
      height={Math.max(200, data.length * 42)}
      table={
        <table className="table-base">
          <thead>
            <tr>
              <th>Source</th>
              <th>Applications</th>
              <th>Responses</th>
              <th>Interviews</th>
              <th>Offers</th>
              <th>Response rate</th>
              <th>Interview rate</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.source}>
                <td>{row.source}</td>
                <td className="tabular-nums">{row.applications}</td>
                <td className="tabular-nums">{row.responses}</td>
                <td className="tabular-nums">{row.interviews}</td>
                <td className="tabular-nums">{row.offers}</td>
                <td className="tabular-nums">{percentLabel(row.response_rate)}</td>
                <td className="tabular-nums">{percentLabel(row.interview_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }} barGap={2}>
          <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} unit="%" />
          <YAxis type="category" dataKey="source" width={92} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: CHROME.cursor }}
            content={
              <TooltipBox
                rows={(row) => [
                  { label: 'Applications', value: String(row.applications) },
                  { label: 'Responses', value: `${row.responses} (${percentLabel(Number(row.response_rate))})` },
                  { label: 'Interviews', value: `${row.interviews} (${percentLabel(Number(row.interview_rate))})` },
                  { label: 'Offers', value: String(row.offers) },
                ]}
              />
            }
          />
          <Bar dataKey="responsePct" fill={SERIES[0]} maxBarSize={10} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          <Bar dataKey="interviewPct" fill={SERIES[1]} maxBarSize={10} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="applications"
              position="right"
              formatter={(v) => `n=${v}`}
              className="fill-ink-400"
              style={{ fontSize: 10 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ------------------------------------------------------------- skill gaps */

export function SkillGapBars({ gaps }: { gaps: SkillGapReport }) {
  const { AXIS_TICK, CHROME, SERIES } = useChartTheme()
  const data = gaps.rows.slice(0, 10).map((row) => ({
    ...row,
    nice: row.occurrences - row.must_have_occurrences,
  }))

  return (
    <ChartFrame
      title="Skill gaps that keep coming up"
      subtitle="Aggregated from the tailoring engine's missing-keyword output across every JD you have looked at."
      legend={[
        { label: 'Listed as required', color: SERIES[0] },
        { label: 'Listed as nice-to-have', color: SERIES[1] },
      ]}
      height={Math.max(220, data.length * 40)}
      table={
        <table className="table-base">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Required in</th>
              <th>Nice-to-have in</th>
              <th>Seen in roles</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.keyword}>
                <td className="font-medium">{row.keyword}</td>
                <td className="tabular-nums">{row.must_have_occurrences}</td>
                <td className="tabular-nums">{row.nice}</td>
                <td className="text-xs text-ink-500">{row.example_roles.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barGap={2}>
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="keyword" width={108} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: CHROME.cursor }}
            content={
              <TooltipBox
                rows={(row) => [
                  { label: 'Required in', value: `${row.must_have_occurrences} postings` },
                  { label: 'Nice-to-have in', value: `${row.nice} postings` },
                  { label: 'Example', value: (row.example_roles as string[])[0] ?? '—' },
                ]}
              />
            }
          />
          <Bar
            dataKey="must_have_occurrences"
            fill={SERIES[0]}
            maxBarSize={10}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
          <Bar dataKey="nice" fill={SERIES[1]} maxBarSize={10} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* --------------------------------------------------------- time in stage */

export function StageDurationBars({ response }: { response: ResponseTimeReport }) {
  const { AXIS_TICK, CHROME, SERIES } = useChartTheme()
  const data = response.time_in_stage.map((row) => ({ ...row }))

  if (!data.length) {
    return (
      <ChartFrame title="Time in stage" subtitle="Needs at least one stage transition to compute.">
        <div className="flex h-full items-center justify-center text-sm text-ink-400">
          No stage transitions recorded yet.
        </div>
      </ChartFrame>
    )
  }

  return (
    <ChartFrame
      title="Time in stage"
      subtitle="Average days spent in each stage. Long screening times are usually the employer, not you."
      height={Math.max(180, data.length * 40)}
      table={
        <table className="table-base">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Average days</th>
              <th>Samples</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.status}>
                <td>{row.status}</td>
                <td className="tabular-nums">{row.avg_days}</td>
                <td className="tabular-nums">{row.samples}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} unit="d" />
          <YAxis type="category" dataKey="status" width={82} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: CHROME.cursor }}
            content={
              <TooltipBox
                rows={(row) => [
                  { label: 'Average', value: `${row.avg_days} days` },
                  { label: 'Samples', value: String(row.samples) },
                ]}
              />
            }
          />
          <Bar dataKey="avg_days" fill={SERIES[0]} maxBarSize={BAR_MAX} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="avg_days"
              position="right"
              formatter={(v) => `${v}d`}
              className="fill-ink-800"
              style={{ fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ------------------------------------------------- resume performance table */

export function ResumePerformance({ funnel }: { funnel: FunnelReport }) {
  const { ORDINAL_BLUE, SERIES, STATUS } = useChartTheme()
  const rows = funnel.by_resume.filter((row) => row.applications > 0)
  const best = Math.max(0.0001, ...rows.map((r) => r.interview_rate))

  return (
    <section className="panel p-4">
      <h3 className="text-sm font-semibold text-ink-900">Interview rate by resume sent</h3>
      <p className="mt-0.5 text-xs text-ink-500">
        The cut nobody else gives you: does tailoring actually convert? Small samples are labelled as such.
      </p>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-400">
          Log which resume you sent with each application and this fills in.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li key={row.resume_id}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="truncate text-sm font-medium text-ink-800">{row.title}</span>
                  {row.is_master && (
                    <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                      baseline
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="tabular-nums font-semibold text-ink-900">
                    {percentLabel(row.interview_rate)}
                  </span>
                  {row.lift_vs_master != null && (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 font-medium tabular-nums',
                        row.lift_vs_master >= 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                      )}
                      title="Interview rate relative to the master resume"
                    >
                      {row.lift_vs_master >= 1 ? '▲' : '▼'} {row.lift_vs_master.toFixed(1)}× vs master
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(row.interview_rate / best) * 100}%`,
                    background: row.is_master ? ORDINAL_BLUE[1] : SERIES[0],
                  }}
                />
              </div>
              <div className="mt-1 text-[11px] text-ink-500">
                {row.applications} sent · {row.interviews} interviews · {row.offers} offers
                {row.applications < 5 && (
                  <span className="ml-1.5" style={{ color: STATUS.serious }}>
                    ⚠ small sample — treat as directional
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
