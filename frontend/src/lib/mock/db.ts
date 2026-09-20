/**
 * Mock persistence layer.
 *
 * The frontend can run in two modes (see .env):
 *   VITE_API_MODE=mock -> every endpoint is served from this localStorage database
 *   VITE_API_MODE=http -> the same calls go to the FastAPI backend
 *
 * Keeping the mock behind the same interface as the HTTP client means no page or
 * component knows which one it is talking to.
 */
import type {
  Application,
  AsyncJob,
  BankQuestion,
  CoverLetter,
  DiscoveredJob,
  InterviewPrepSession,
  JobDescription,
  Resume,
  ResumeVersion,
  SavedSearch,
  StatusTransition,
  TailorDraft,
  User,
} from '@/types'

export interface Db {
  version: number
  users: (User & { password: string })[]
  session: { user_id: string; access_token: string; refresh_token: string } | null
  resumes: Resume[]
  resume_versions: ResumeVersion[]
  job_descriptions: JobDescription[]
  tailor_drafts: TailorDraft[]
  cover_letters: CoverLetter[]
  applications: Application[]
  status_history: StatusTransition[]
  saved_searches: SavedSearch[]
  discovered_jobs: DiscoveredJob[]
  prep_sessions: InterviewPrepSession[]
  question_bank: BankQuestion[]
  jobs: AsyncJob[]
  usage: { generations: { kind: string; at: string; cached: boolean }[] }
}

const STORAGE_KEY = 'jobpilot.db.v1'
export const DB_VERSION = 1

let cache: Db | null = null

export function emptyDb(): Db {
  return {
    version: DB_VERSION,
    users: [],
    session: null,
    resumes: [],
    resume_versions: [],
    job_descriptions: [],
    tailor_drafts: [],
    cover_letters: [],
    applications: [],
    status_history: [],
    saved_searches: [],
    discovered_jobs: [],
    prep_sessions: [],
    question_bank: [],
    jobs: [],
    usage: { generations: [] },
  }
}

export function loadDb(): Db {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Db
      if (parsed.version === DB_VERSION) {
        cache = { ...emptyDb(), ...parsed }
        return cache
      }
    }
  } catch {
    // Corrupt or unavailable storage: fall through to a fresh database.
  }
  cache = emptyDb()
  return cache
}

export function saveDb(db: Db) {
  cache = db
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (err) {
    // Quota exceeded is realistic here (resume snapshots are chunky) — surface it
    // rather than losing writes silently.
    console.warn('Could not persist the mock database:', err)
  }
}

/** Read-modify-write helper so callers never forget to persist. */
export function mutate<T>(fn: (db: Db) => T): T {
  const db = loadDb()
  const result = fn(db)
  saveDb(db)
  return result
}

export function resetDb() {
  cache = null
  localStorage.removeItem(STORAGE_KEY)
}

export function exportDb() {
  return JSON.stringify(loadDb(), null, 2)
}

export function importDb(json: string) {
  const parsed = JSON.parse(json) as Db
  saveDb({ ...emptyDb(), ...parsed, version: DB_VERSION })
}
