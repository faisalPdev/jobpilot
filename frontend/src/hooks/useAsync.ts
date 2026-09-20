import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: unknown
  loading: boolean
  reload: () => void
  setData: (updater: T | ((prev: T | null) => T)) => void
}

/**
 * Small data-fetching hook. Deliberately not a full query cache: the app's data is
 * per-user and mutation-heavy, so an explicit reload is easier to reason about than
 * invalidation rules.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const alive = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    alive.current = true
    setLoading(true)
    setError(null)
    fnRef
      .current()
      .then((result) => {
        if (alive.current) setDataState(result)
      })
      .catch((err) => {
        if (alive.current) setError(err)
      })
      .finally(() => {
        if (alive.current) setLoading(false)
      })
    return () => {
      alive.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater))
  }, [])

  return { data, error, loading, reload: () => setNonce((n) => n + 1), setData }
}

/** Wrap a mutation so the UI can show a pending state without boilerplate. */
export function useAction<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  const [pending, setPending] = useState(false)
  const run = useCallback(
    async (...args: Args) => {
      setPending(true)
      try {
        return await fn(...args)
      } finally {
        setPending(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return { run, pending }
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Persisted UI preference (view mode, filters) — keeps the app feeling stateful. */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable — preference just will not persist */
    }
  }, [key, value])
  return [value, setValue] as const
}
