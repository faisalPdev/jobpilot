import type { Api } from './apiTypes'
import { mockApi } from './mock/handlers'
import { httpApi } from './httpApi'

export type ApiMode = 'mock' | 'http'

export const API_MODE: ApiMode =
  (import.meta.env.VITE_API_MODE as ApiMode | undefined) === 'http' ? 'http' : 'mock'

/**
 * The one import every page uses. Which implementation it resolves to is a build
 * -time env decision (see .env.example), and nothing above this line cares.
 */
export const api: Api = API_MODE === 'http' ? httpApi : mockApi

export { ApiError } from './mock/handlers'
export type { Api } from './apiTypes'

export function apiErrorMessage(err: unknown) {
  if (err && typeof err === 'object' && 'message' in err) return String((err as Error).message)
  return 'Something went wrong.'
}
