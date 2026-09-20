import { useEffect, useRef, useState } from 'react'

/**
 * Scroll and motion primitives for the landing page.
 *
 * Everything here is opt-out rather than opt-in: if IntersectionObserver is
 * missing, or the visitor has asked for reduced motion, each hook resolves to
 * its *finished* state immediately. A marketing page that animates on scroll
 * must never be a marketing page that is blank without JavaScript animation.
 */

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * `once` is the default because a section that re-fades every time it scrolls
 * past reads as a glitch, not as polish.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  once = true,
  rootMargin = '0px 0px -10% 0px',
  threshold = 0.12,
}: { once?: boolean; rootMargin?: string; threshold?: number } = {}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver !== 'function') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setInView(false)
          }
        }
      },
      { rootMargin, threshold },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [once, rootMargin, threshold])

  return [ref, inView] as const
}

/** easeOutCubic — quick off the mark, settles rather than stopping dead. */
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/** Counts 0 → target once `active` flips true. Used by the metric band. */
export function useCountUp(target: number, active: boolean, duration = 1100) {
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) return
    if (reduced || duration <= 0) {
      setValue(target)
      return
    }

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(target * ease(t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, duration, reduced, target])

  return value
}

/**
 * Animates from wherever it currently is to a new target. Unlike useCountUp
 * this re-runs on every change, which is what lets the demo's match score move
 * as changes are accepted instead of snapping.
 */
export function useTween(value: number, duration = 420) {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(value)
  const current = useRef(value)

  useEffect(() => {
    if (reduced || duration <= 0) {
      current.current = value
      setDisplay(value)
      return
    }

    const from = current.current
    if (from === value) return

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const next = from + (value - from) * ease(t)
      current.current = t < 1 ? next : value
      setDisplay(current.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, reduced, value])

  return display
}

/**
 * Which section the reader is in, for the nav. Deliberately a scroll listener
 * rather than an observer: "the last heading I scrolled past" is the answer a
 * reader expects, and an observer gives "whichever section is most visible",
 * which flickers between two short sections.
 */
export function useScrollSpy(ids: readonly string[], offset = 120) {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join('|')

  useEffect(() => {
    const list = key.split('|').filter(Boolean)
    if (!list.length) return

    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      if (atBottom) {
        setActive(list[list.length - 1])
        return
      }

      let current: string | null = null
      for (const id of list) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= offset) current = id
      }
      setActive(current)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [key, offset])

  return active
}

/** 0 → 1 down the page. Drives the hairline progress bar under the nav. */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / max)))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return progress
}

/** True once the page has scrolled past `threshold`. Nav elevation, back-to-top. */
export function useScrolledPast(threshold = 8) {
  const [past, setPast] = useState(false)

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return past
}
