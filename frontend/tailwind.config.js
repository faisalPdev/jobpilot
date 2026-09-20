/**
 * Colours are declared once here as `rgb(var(--c-*) / <alpha-value>)` and given
 * their actual channels in index.css, twice: a light set on `:root` and a dark
 * set under `.dark`. That is what makes dark mode a variable swap rather than a
 * `dark:` variant on every element — an existing `bg-ink-50 text-ink-900` panel
 * keeps meaning "page background, primary text" in both themes.
 *
 * The dark scale is the light scale read backwards, so the semantics of a shade
 * survive the flip: 50 is always the quietest surface, 900 always the loudest
 * text. Anything that must NOT flip (a resume sheet, a scrim, a primary button)
 * uses a fixed token or an explicit `dark:` class instead.
 */
const channel = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

const scale = (name) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => [s, channel(`${name}-${s}`)]))

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: scale('ink'),
        brand: scale('brand'),
        // Status families are redefined too, otherwise every tinted chip stays a
        // bright light-mode swatch on a dark page.
        rose: scale('rose'),
        emerald: scale('emerald'),
        amber: scale('amber'),
        violet: scale('violet'),

        /** Raised surfaces: panels, cards, popovers, inputs. White in light mode. */
        surface: channel('surface'),
        /**
         * A solid, filled action. `brand-600` cannot play this role on its own:
         * `text-brand-700` on a tint is the far more common usage, so the 700
         * end of the ramp has to go light in dark mode, which would leave the
         * primary button's hover unreadable.
         */
        primary: channel('primary'),
        'primary-hover': channel('primary-hover'),
        'on-primary': channel('on-primary'),
        /** A step above `surface` — hovered rows, footers, inset wells. */
        'surface-sunk': channel('surface-sunk'),
        /** Modal/drawer backdrop. Stays dark in both themes. */
        scrim: 'rgb(var(--c-scrim) / <alpha-value>)',
        /** Paper — a printed page rendered on screen. Never flips. */
        paper: '#ffffff',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'Cambria', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
}
