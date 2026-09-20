import { useResolvedTheme, type ResolvedTheme } from '@/store/theme'

/**
 * Chart tokens.
 *
 * The light set is not picked by eye: the categorical trio and the ordinal blue
 * ramp were run through the palette validator against this app's white chart
 * surface (lightness band, chroma floor, CVD separation, normal-vision floor,
 * contrast / monotonicity + step gaps for the ordinal ramp). Aqua sits below
 * 3:1 on white, so every chart that uses it ships visible labels or a table view.
 *
 * The dark set is the same hues lifted onto the dark chart surface, with the
 * ordinal ramp reversed so magnitude still reads as "more ink": on a dark
 * ground the loudest step is the lightest one, not the darkest. It has NOT been
 * through the validator yet.
 *
 * If you re-theme the app, re-run the validator against both surfaces rather
 * than nudging hexes.
 */
export interface ChartTheme {
  /** Categorical slots, in fixed order. Never cycled: a 4th series folds to "Other". */
  SERIES: readonly string[]
  /** Ordinal ramp for stage-like magnitudes (funnel). Quietest step first. */
  ORDINAL_BLUE: readonly string[]
  /** Reserved status colours — never reused as a series. Always paired with a label. */
  STATUS: { good: string; warning: string; serious: string; critical: string }
  CHROME: {
    surface: string
    grid: string
    axis: string
    muted: string
    secondary: string
    primary: string
    /** The band a bar chart highlights under the cursor. */
    cursor: string
  }
  AXIS_TICK: { fill: string; fontSize: number }
}

const LIGHT = {
  SERIES: ['#2a78d6', '#eb6834', '#1baf7a'],
  ORDINAL_BLUE: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'],
  STATUS: {
    good: '#0ca30c',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
  },
  CHROME: {
    surface: '#ffffff',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    muted: '#898781',
    secondary: '#52514e',
    primary: '#0b0b0b',
    cursor: '#f6f7f9',
  },
} as const satisfies Omit<ChartTheme, 'AXIS_TICK'>

const DARK = {
  SERIES: ['#5fa8f0', '#f5915f', '#3fc79a'],
  ORDINAL_BLUE: ['#2c4f7c', '#3a6ba8', '#4a88d0', '#6ba8e8', '#9ccbf5'],
  STATUS: {
    good: '#3fbf5c',
    warning: '#fbbf24',
    serious: '#f5915f',
    critical: '#f4626b',
  },
  CHROME: {
    surface: '#161a21',
    grid: '#2b323d',
    axis: '#3d4553',
    muted: '#8b95a6',
    secondary: '#c7cfdc',
    primary: '#f2f5f9',
    cursor: '#1f2530',
  },
} as const satisfies Omit<ChartTheme, 'AXIS_TICK'>

export function chartTheme(mode: ResolvedTheme): ChartTheme {
  const base = mode === 'dark' ? DARK : LIGHT
  return { ...base, AXIS_TICK: { fill: base.CHROME.muted, fontSize: 11 } }
}

/**
 * Recharts wants real colour strings for its SVG props, not CSS variables, so
 * charts subscribe to the theme instead of inheriting it.
 */
export function useChartTheme(): ChartTheme {
  return chartTheme(useResolvedTheme())
}

/** Bars are capped rather than filling their band, so the band keeps some air. */
export const BAR_MAX = 22

export function compact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n * 10) / 10)
}

export function percentLabel(ratio: number, digits = 0) {
  return `${(ratio * 100).toFixed(digits)}%`
}

export function shortWeek(period: string) {
  const d = new Date(period)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function shortMonth(period: string) {
  const d = new Date(`${period}-01`)
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}
