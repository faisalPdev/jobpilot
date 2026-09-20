/**
 * fetch wrapper for VITE_API_MODE=http: bearer auth, one silent refresh on 401,
 * and errors normalised to ApiError so the UI handles both modes identically.
 */
import { ApiError } from './mock/handlers'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'
const ACCESS_KEY = 'jobpilot.access_token'
const REFRESH_KEY = 'jobpilot.refresh_token'

export function setTokens(access: string | null, refresh: string | null) {
  if (access) localStorage.setItem(ACCESS_KEY, access)
  else localStorage.removeItem(ACCESS_KEY)
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  else localStorage.removeItem(REFRESH_KEY)
}

export function accessToken() {
  return localStorage.getItem(ACCESS_KEY)
}

export function refreshToken() {
  return localStorage.getItem(REFRESH_KEY)
}

async function parse(res: Response) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function attemptRefresh(): Promise<boolean> {
  const token = refreshToken()
  if (!token) return false
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: token }),
  })
  if (!res.ok) {
    setTokens(null, null)
    return false
  }
  const body = (await parse(res)) as { access_token: string; refresh_token?: string } | null
  if (!body?.access_token) return false
  setTokens(body.access_token, body.refresh_token ?? token)
  return true
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | string[] | undefined | null>
  /** Skip the bearer header (login/register). */
  anonymous?: boolean
  retry?: boolean
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = `${BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)))
    else params.append(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, anonymous = false, retry = true } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = accessToken()
  if (!anonymous && token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    throw new ApiError(
      0,
      `Cannot reach the API at ${BASE}. Start the FastAPI backend, or set VITE_API_MODE=mock to run without it. (${
        (err as Error).message
      })`,
    )
  }

  if (res.status === 401 && !anonymous && retry && (await attemptRefresh())) {
    return request<T>(path, { ...options, retry: false })
  }

  const payload = await parse(res)
  if (!res.ok) {
    const detail =
      (payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : null) ?? res.statusText
    throw new ApiError(res.status, detail)
  }
  return payload as T
}
