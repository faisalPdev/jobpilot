import { cn } from '@/lib/utils'
import { useTheme, type ThemePreference } from '@/store/theme'

const OPTIONS: { value: ThemePreference; label: string; icon: string; hint: string }[] = [
  { value: 'light', label: 'Light', icon: '☀', hint: 'Always light' },
  { value: 'dark', label: 'Dark', icon: '☾', hint: 'Always dark' },
  { value: 'system', label: 'System', icon: '◐', hint: 'Follow your operating system' },
]

/**
 * Three states, not a two-way switch: "system" is a real choice and has to stay
 * distinguishable from whichever of light/dark it currently resolves to.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const preference = useTheme((s) => s.preference)
  const setPreference = useTheme((s) => s.setPreference)

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-50 p-0.5', className)}
    >
      {OPTIONS.map((option) => {
        const active = preference === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => setPreference(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-surface text-ink-900 shadow-card'
                : 'text-ink-500 hover:text-ink-800',
            )}
          >
            <span aria-hidden className="text-[13px] leading-none">
              {option.icon}
            </span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Header affordance. Cycles light -> dark -> system so the whole control fits in
 * one 32px slot; the labelled group above stays the discoverable version in
 * Settings.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const preference = useTheme((s) => s.preference)
  const resolved = useTheme((s) => s.resolved)
  const setPreference = useTheme((s) => s.setPreference)

  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2]
  const next = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length]

  return (
    <button
      type="button"
      onClick={() => setPreference(next.value)}
      title={`Theme: ${current.label.toLowerCase()}${
        preference === 'system' ? ` (${resolved})` : ''
      } — switch to ${next.label.toLowerCase()}`}
      aria-label={`Colour theme: ${current.label}. Switch to ${next.label}.`}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800',
        className,
      )}
    >
      <span aria-hidden>{current.icon}</span>
    </button>
  )
}
