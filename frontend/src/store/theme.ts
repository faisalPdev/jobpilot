import { create } from 'zustand'

/** What the user picked. `system` follows the OS and can change while the tab is open. */
export type ThemePreference = 'light' | 'dark' | 'system'
/** What is actually painted. Never `system`. */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'jobpilot.theme'

const PREFERENCES: ThemePreference[] = ['light', 'dark', 'system']

export function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return PREFERENCES.includes(raw as ThemePreference) ? (raw as ThemePreference) : 'system'
  } catch {
    // Private mode, or storage disabled by policy. Following the OS is the
    // better failure than forcing light.
    return 'system'
  }
}

function systemTheme(): ResolvedTheme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference
}

/**
 * Every colour in the app is a CSS variable keyed off this class, so flipping it
 * is the whole of the theme switch. index.html sets it before first paint; this
 * only has to keep it in sync afterwards.
 */
function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
}

interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  /** Subscribes to OS changes. Returns the unsubscribe, for the effect cleanup. */
  init: () => () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  preference: readStoredPreference(),
  resolved: resolveTheme(readStoredPreference()),

  setPreference(preference) {
    const resolved = resolveTheme(preference)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference)
    } catch {
      // The choice still applies to this tab; it just will not survive a reload.
    }
    applyTheme(resolved)
    set({ preference, resolved })
  },

  init() {
    applyTheme(get().resolved)

    if (typeof matchMedia !== 'function') return () => {}
    const query = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      // Only `system` tracks the OS; an explicit choice outranks it.
      if (get().preference !== 'system') return
      const resolved = systemTheme()
      applyTheme(resolved)
      set({ resolved })
    }

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  },
}))

/** The painted theme, for the few places that need a colour in JS rather than CSS. */
export function useResolvedTheme(): ResolvedTheme {
  return useTheme((s) => s.resolved)
}
