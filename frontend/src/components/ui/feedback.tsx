import type { ReactNode } from 'react'
import { cn, clamp } from '@/lib/utils'
import { useChartTheme } from '@/lib/viz'
import { Button, Spinner } from './primitives'

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-12 text-sm text-ink-500', className)}>
      <Spinner className="h-4 w-4" />
      {label}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-ink-100', className)} />
}

export function EmptyState({
  title,
  body,
  action,
  icon = '○',
  className,
}: {
  title: string
  body?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-lg text-ink-400">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
      {body && <div className="mt-1 max-w-md text-sm text-ink-500">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error')
  return (
    <div className={cn('rounded-xl border border-rose-200 bg-rose-50 p-4', className)}>
      <div className="text-sm font-semibold text-rose-800">That request failed</div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-rose-700">{message}</p>
      {onRetry && (
        <Button size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Progress({
  value,
  max = 100,
  tone = 'brand',
  className,
  showLabel = false,
}: {
  value: number
  max?: number
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral'
  className?: string
  showLabel?: boolean
}) {
  const ratio = max > 0 ? clamp(value / max, 0, 1) : 0
  const fills = {
    brand: 'bg-brand-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    neutral: 'bg-ink-400',
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
        <div className={cn('h-full rounded-full transition-all', fills[tone])} style={{ width: `${ratio * 100}%` }} />
      </div>
      {showLabel && (
        <span className="w-10 text-right text-xs font-medium tabular-nums text-ink-600">
          {Math.round(ratio * 100)}%
        </span>
      )}
    </div>
  )
}

/** Score ring used for resume score and JD match. */
export function ScoreRing({
  value,
  max = 100,
  size = 84,
  label,
  sublabel,
}: {
  value: number
  max?: number
  size?: number
  label?: string
  sublabel?: string
}) {
  // SVG stroke takes a colour, not a class, so the ring reads its status hues
  // and its track from the theme rather than from a fixed light-mode triple.
  const { CHROME, STATUS } = useChartTheme()
  const ratio = max > 0 ? clamp(value / max, 0, 1) : 0
  const stroke = size < 60 ? 6 : 8
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const tone = ratio >= 0.75 ? STATUS.good : ratio >= 0.5 ? STATUS.warning : STATUS.critical

  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHROME.grid} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums text-ink-900">{Math.round(value)}</span>
          {max !== 100 && <span className="text-[10px] text-ink-400">/ {max}</span>}
        </div>
      </div>
      {(label || sublabel) && (
        <div>
          {label && <div className="text-sm font-semibold text-ink-800">{label}</div>}
          {sublabel && <div className="text-xs text-ink-500">{sublabel}</div>}
        </div>
      )}
    </div>
  )
}

export function StatTile({
  label,
  value,
  delta,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  delta?: { value: string; positive: boolean } | null
  hint?: string
  tone?: 'neutral' | 'brand' | 'success' | 'warning'
}) {
  const accents = {
    neutral: 'border-ink-200',
    brand: 'border-brand-200',
    success: 'border-emerald-200',
    warning: 'border-amber-200',
  }
  return (
    <div className={cn('rounded-xl border bg-surface p-4 shadow-card', accents[tone])}>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-ink-900">{value}</span>
        {delta && (
          <span
            className={cn(
              'text-xs font-medium',
              delta.positive ? 'text-emerald-600' : 'text-rose-600',
            )}
          >
            {delta.value}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  )
}

/** Used wherever an AI generation is running, with the honest wait expectation. */
export function GeneratingState({
  title = 'Generating…',
  steps,
  className,
}: {
  title?: string
  steps: string[]
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-brand-200 bg-brand-50/60 p-5', className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
        <Spinner className="h-4 w-4" />
        {title}
      </div>
      <ul className="mt-3 space-y-1.5">
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-2 text-xs text-brand-700">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400"
              style={{ animationDelay: `${i * 220}ms` }}
            />
            {step}
          </li>
        ))}
      </ul>
    </div>
  )
}
