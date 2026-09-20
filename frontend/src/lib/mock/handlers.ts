/**
 * Mock API implementation — the whole product, served from localStorage.
 *
 * Behaviours that matter for realism (and that the UI is built against):
 *  - artificial latency, so loading states are exercised
 *  - generation endpoints record an AsyncJob row, mirroring the Celery queue in §9
 *  - usage is metered, because LLM cost is a first-class concern (§10)
 */
import type {
  Application,
  ApplicationAttachment,
  ApplicationContact,
  ApplicationNote,
  ApplicationSource,
  ApplicationStatus,
  AsyncJob,
  AuthResponse,
  BankQuestion,
  DashboardSummary,
  DiscoveredJob,
  DuplicateWarning,
  FunnelReport,
  ID,
  InterviewPrepSession,
  InterviewQuestion,
  JobDescription,
  JobKind,
  MockTurn,
  ParsedJD,
  Resume,
  ResumeContent,
  ResumeVersion,
  ResponseTimeReport,
  SavedSearch,
  SkillGapReport,
  SourceReport,
  StatusTransition,
  UsageStats,
  User,
  VolumeReport,
} from '@/types'
import type { AnalyticsFilters, Api } from '../apiTypes'
import { type Db, loadDb, mutate, resetDb, saveDb, exportDb, importDb } from './db'
import { DEMO_EMAIL, DEMO_PASSWORD, buildSeedDb } from './seed'
import {
  clamp,
  daysBetween,
  daysFromNowIso,
  deepClone,
  monthKey,
  nowIso,
  sleep,
  stripHtml,
  uid,
  weekStart,
} from '../utils'
import { emptyResumeContent } from '../resumeFactory'
import { parseJobDescription } from '../ai/jd'
import { matchReasons, matchResumeToJD } from '../ai/match'
import { DEFAULT_TAILOR_OPTIONS, applyChanges, generateCoverLetter, keywordDensity, tailorResume } from '../ai/tailor'
import { checkAts, scoreResume } from '../ai/score'
import { parseResumeText } from '../ai/resumeParse'
import { buildCompanyBrief, draftStarAnswer, generateQuestions, scoreMockAnswer } from '../ai/interview'
import { renderResumeText } from '../export/render'
import { LINEAR_PIPELINE, PIPELINE } from '../pipeline'

const GENERATION_CAP = 200

async function latency(min = 90, max = 260) {
  await sleep(min + Math.random() * (max - min))
}

function db() {
  return loadDb()
}

function currentUser(d: Db): User {
  const session = d.session
  const user = session ? d.users.find((u) => u.id === session.user_id) : null
  if (!user) throw new ApiError(401, 'Not authenticated')
  const { password: _password, ...safe } = user
  return safe as User
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

function recordUsage(d: Db, kind: JobKind, cached = false) {
  d.usage.generations.push({ kind, at: nowIso(), cached })
}

/** Mirrors the Celery job rows the real backend exposes at /jobs. */
function recordJob(d: Db, kind: JobKind, message: string, resultId: string | null): AsyncJob {
  const job: AsyncJob = {
    id: uid('job'),
    kind,
    status: 'succeeded',
    progress: 100,
    message,
    result_id: resultId,
    error: null,
    created_at: nowIso(),
    finished_at: nowIso(),
  }
  d.jobs.unshift(job)
  d.jobs = d.jobs.slice(0, 40)
  return job
}

function versionOf(d: Db, resume: Resume): ResumeVersion {
  const version = d.resume_versions.find((v) => v.id === resume.current_version_id)
  if (!version) throw new ApiError(404, 'Resume version not found')
  return version
}

function contentOfResume(d: Db, resumeId: ID): ResumeContent {
  const resume = d.resumes.find((r) => r.id === resumeId)
  if (!resume) throw new ApiError(404, 'Resume not found')
  return versionOf(d, resume).content
}

function findJd(d: Db, id: ID): JobDescription {
  const jd = d.job_descriptions.find((j) => j.id === id)
  if (!jd) throw new ApiError(404, 'Job description not found')
  return jd
}

function findApp(d: Db, id: ID): Application {
  const app = d.applications.find((a) => a.id === id)
  if (!app) throw new ApiError(404, 'Application not found')
  return app
}

function authResponse(d: Db, user: User & { password: string }): AuthResponse {
  const tokens = {
    access_token: `mock.access.${user.id}`,
    refresh_token: `mock.refresh.${user.id}`,
    token_type: 'bearer' as const,
  }
  d.session = { user_id: user.id, ...tokens }
  const { password: _password, ...safe } = user
  return { ...tokens, user: safe as User }
}

function normalizeKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/* ------------------------------------------------------------- analytics */

const OPEN_STATUSES: ApplicationStatus[] = ['Applied', 'Screening', 'Interview']
const RESPONDED: ApplicationStatus[] = ['Screening', 'Interview', 'Offer']

function inRange(iso: string | null, filters: AnalyticsFilters) {
  if (!iso) return true
  if (filters.from && iso < filters.from) return false
  if (filters.to && iso > `${filters.to}T23:59:59.999Z`) return false
  return true
}

function reachedStatus(history: StatusTransition[], appId: ID, statuses: ApplicationStatus[]) {
  return history.some((h) => h.application_id === appId && statuses.includes(h.to_status))
}

/**
 * A funnel must count the furthest stage each application reached, not its current
 * status — otherwise a rejection erases the interview that happened before it.
 */
function furthestStage(history: StatusTransition[], app: Application) {
  const own = LINEAR_PIPELINE.indexOf(app.status)
  const fromHistory = history
    .filter((h) => h.application_id === app.id)
    .reduce((max, h) => Math.max(max, LINEAR_PIPELINE.indexOf(h.to_status)), -1)
  return Math.max(own, fromHistory, 0)
}

function buildFunnel(d: Db, apps: Application[]): FunnelReport {
  const history = d.status_history
  const reach = new Map<ID, number>()
  for (const app of apps) reach.set(app.id, furthestStage(history, app))

  const stages = LINEAR_PIPELINE.map((status, i) => {
    const count = apps.filter((a) => (reach.get(a.id) ?? 0) >= i).length
    const prevCount = i === 0 ? count : apps.filter((a) => (reach.get(a.id) ?? 0) >= i - 1).length
    return { status, count, conversion: prevCount > 0 ? count / prevCount : 0 }
  })

  const countAt = (status: ApplicationStatus) =>
    stages.find((s) => s.status === status)?.count ?? 0
  const applied = countAt('Applied')
  const interviews = countAt('Interview')
  const offers = countAt('Offer')
  const responded = apps.filter((a) => (reach.get(a.id) ?? 0) >= LINEAR_PIPELINE.indexOf('Screening')).length

  /* The differentiated cut (§5): conversion by the resume actually sent. */
  const byResumeMap = new Map<string, { applications: number; interviews: number; offers: number }>()
  for (const app of apps) {
    if (!app.resume_id || !app.applied_at) continue
    const row = byResumeMap.get(app.resume_id) ?? { applications: 0, interviews: 0, offers: 0 }
    const furthest = reach.get(app.id) ?? 0
    row.applications += 1
    if (furthest >= LINEAR_PIPELINE.indexOf('Interview')) row.interviews += 1
    if (furthest >= LINEAR_PIPELINE.indexOf('Offer')) row.offers += 1
    byResumeMap.set(app.resume_id, row)
  }
  const masterId = d.resumes.find((r) => r.is_master)?.id
  const masterRow = masterId ? byResumeMap.get(masterId) : undefined
  const masterRate = masterRow && masterRow.applications ? masterRow.interviews / masterRow.applications : null

  const by_resume = [...byResumeMap.entries()]
    .map(([resumeId, row]) => {
      const resume = d.resumes.find((r) => r.id === resumeId)
      const interviewRate = row.applications ? row.interviews / row.applications : 0
      return {
        resume_id: resumeId,
        title: resume?.title ?? 'Deleted resume',
        is_master: resume?.is_master ?? false,
        applications: row.applications,
        interviews: row.interviews,
        offers: row.offers,
        interview_rate: interviewRate,
        lift_vs_master:
          masterRate && masterRate > 0 && resumeId !== masterId ? interviewRate / masterRate : null,
      }
    })
    .sort((a, b) => b.applications - a.applications)

  return {
    stages,
    total: apps.length,
    offer_rate: applied ? offers / applied : 0,
    interview_rate: applied ? interviews / applied : 0,
    response_rate: applied ? responded / applied : 0,
    by_resume,
  }
}

function buildVolume(apps: Application[], goal: number): VolumeReport {
  const weeks = new Map<string, number>()
  const months = new Map<string, number>()
  for (const app of apps) {
    if (!app.applied_at) continue
    const w = weekStart(app.applied_at)
    weeks.set(w, (weeks.get(w) ?? 0) + 1)
    const m = monthKey(app.applied_at)
    months.set(m, (months.get(m) ?? 0) + 1)
  }

  // Always emit the last 12 weeks, including empty ones — a gap is information.
  const weekly: VolumeReport['weekly'] = []
  for (let i = 11; i >= 0; i -= 1) {
    const period = weekStart(daysFromNowIso(-i * 7))
    weekly.push({ period, applications: weeks.get(period) ?? 0, goal })
  }
  const monthly: VolumeReport['monthly'] = []
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const period = d.toISOString().slice(0, 7)
    monthly.push({ period, applications: months.get(period) ?? 0, goal: goal * 4 })
  }

  let current = 0
  for (let i = weekly.length - 1; i >= 0; i -= 1) {
    if (weekly[i].applications >= goal) current += 1
    else break
  }
  let best = 0
  let run = 0
  for (const w of weekly) {
    if (w.applications >= goal) {
      run += 1
      best = Math.max(best, run)
    } else run = 0
  }

  return {
    weekly,
    monthly,
    current_week: weekly[weekly.length - 1]?.applications ?? 0,
    goal,
    current_streak_weeks: current,
    best_streak_weeks: best,
  }
}

function buildResponse(d: Db, apps: Application[]): ResponseTimeReport {
  const firstResponses: number[] = []
  let noResponse = 0

  for (const app of apps) {
    if (!app.applied_at) continue
    const transitions = d.status_history
      .filter((h) => h.application_id === app.id && h.to_status !== 'Applied')
      .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    const first = transitions[0]
    if (first) firstResponses.push(Math.max(0, daysBetween(app.applied_at, first.changed_at)))
    else if (daysBetween(app.applied_at, nowIso()) > 14) noResponse += 1
  }

  const stageDurations = new Map<ApplicationStatus, number[]>()
  for (const app of apps) {
    const rows = d.status_history
      .filter((h) => h.application_id === app.id)
      .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    rows.forEach((row, i) => {
      const next = rows[i + 1]
      const end = next ? next.changed_at : nowIso()
      const days = Math.max(0, daysBetween(row.changed_at, end))
      const list = stageDurations.get(row.to_status) ?? []
      list.push(days)
      stageDurations.set(row.to_status, list)
    })
  }

  const applied = apps.filter((a) => a.applied_at).length
  return {
    avg_days_to_first_response: firstResponses.length
      ? Math.round((firstResponses.reduce((a, b) => a + b, 0) / firstResponses.length) * 10) / 10
      : null,
    no_response_rate: applied ? noResponse / applied : 0,
    time_in_stage: PIPELINE.map((status) => {
      const list = stageDurations.get(status) ?? []
      return {
        status,
        avg_days: list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : 0,
        samples: list.length,
      }
    }).filter((row) => row.samples > 0),
  }
}

function buildSources(d: Db, apps: Application[]): SourceReport {
  const map = new Map<ApplicationSource, { applications: number; responses: number; interviews: number; offers: number }>()
  for (const app of apps) {
    if (!app.applied_at) continue
    const row = map.get(app.source) ?? { applications: 0, responses: 0, interviews: 0, offers: 0 }
    row.applications += 1
    if (RESPONDED.includes(app.status) || reachedStatus(d.status_history, app.id, RESPONDED)) row.responses += 1
    if (app.status === 'Interview' || reachedStatus(d.status_history, app.id, ['Interview'])) row.interviews += 1
    if (app.status === 'Offer' || reachedStatus(d.status_history, app.id, ['Offer'])) row.offers += 1
    map.set(app.source, row)
  }
  return {
    rows: [...map.entries()]
      .map(([source, row]) => ({
        source,
        ...row,
        response_rate: row.applications ? row.responses / row.applications : 0,
        interview_rate: row.applications ? row.interviews / row.applications : 0,
      }))
      .sort((a, b) => b.applications - a.applications),
  }
}

/**
 * Skill-gap trends (§5): aggregate the missing-keyword output of the tailoring
 * engine across every application, so repeated gaps become visible.
 */
function buildSkillGaps(d: Db, apps: Application[]): SkillGapReport {
  const master = d.resumes.find((r) => r.is_master)
  if (!master) return { rows: [] }
  const content = versionOf(d, master).content

  const counts = new Map<string, { occurrences: number; must: number; roles: Set<string> }>()
  const jdIds = new Set(apps.map((a) => a.job_description_id).filter(Boolean) as string[])
  for (const dj of d.discovered_jobs) jdIds.add(dj.job_description_id)

  for (const jdId of jdIds) {
    const jd = d.job_descriptions.find((j) => j.id === jdId)
    if (!jd) continue
    const report = matchResumeToJD(content, jd.parsed, {
      resume_id: master.id,
      job_description_id: jd.id,
    })
    for (const miss of report.missing) {
      const row = counts.get(miss.keyword) ?? { occurrences: 0, must: 0, roles: new Set<string>() }
      row.occurrences += 1
      if (miss.kind === 'must_have') row.must += 1
      row.roles.add(`${jd.role_title} @ ${jd.company_name}`)
      counts.set(miss.keyword, row)
    }
  }

  return {
    rows: [...counts.entries()]
      .map(([keyword, row]) => ({
        keyword,
        occurrences: row.occurrences,
        must_have_occurrences: row.must,
        example_roles: [...row.roles].slice(0, 4),
      }))
      .sort((a, b) => b.must_have_occurrences - a.must_have_occurrences || b.occurrences - a.occurrences)
      .slice(0, 18),
  }
}

/* ------------------------------------------------------------- discovery */

const DISCOVERY_POOL = [
  { company: 'Alderhill', role: 'Senior Backend Engineer', location: 'Remote (UK)', remote: true, salary: '£100k - £125k' },
  { company: 'Brightmoor', role: 'Platform Engineer', location: 'London, UK', remote: false, salary: '£95k' },
  { company: 'Cranemere', role: 'Staff Software Engineer', location: 'Remote (EU)', remote: true, salary: '€130k' },
  { company: 'Dunmore Systems', role: 'Backend Engineer, Payments', location: 'Dublin, IE', remote: false, salary: '€90k' },
  { company: 'Eastcliff', role: 'Senior Python Engineer', location: 'Remote (Global)', remote: true, salary: '$175k' },
  { company: 'Fairholt', role: 'Engineering Lead, Data', location: 'Manchester, UK', remote: false, salary: '£115k' },
  { company: 'Glenrowan', role: 'Senior Engineer, Infrastructure', location: 'Berlin, DE', remote: true, salary: '€110k' },
]

function syntheticJdText(company: string, role: string, location: string, salary: string) {
  return `${role}
${company} · ${location}

What you'll do
- Own backend services written in Python, deployed with Docker
- Model and query PostgreSQL at scale, including the query plans nobody wants to read
- Build and version REST APIs used by other teams
- Improve CI/CD, testing and observability

What you'll need
- 5+ years of backend experience in Python, ideally FastAPI or Django
- Strong PostgreSQL and SQL fundamentals
- Experience with Docker and cloud infrastructure on AWS
- Comfortable owning system design decisions

Nice to have
- Redis and Celery
- Kubernetes and Terraform
- Kafka
- Experience with LLM APIs

${salary ? `Compensation: ${salary}.` : ''}`
}

function scoreDiscovered(d: Db, parsed: ParsedJD, jdId: ID) {
  const master = d.resumes.find((r) => r.is_master)
  if (!master) return { score: 50, reasons: ['No master resume to score against'] }
  const report = matchResumeToJD(versionOf(d, master).content, parsed, {
    resume_id: master.id,
    job_description_id: jdId,
  })
  return { score: Math.round(report.score), reasons: matchReasons(report, parsed) }
}

/* ----------------------------------------------------------------- API */

export const mockApi: Api = {
  auth: {
    async register({ email, password, full_name }) {
      await latency()
      return mutate((d) => {
        if (d.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
          throw new ApiError(409, 'An account with that email already exists')
        }
        const user = {
          id: uid('usr'),
          email,
          password,
          full_name,
          created_at: nowIso(),
          follow_up_days: 7,
          weekly_application_goal: 10,
          llm_data_consent: false,
        }
        d.users.push(user)

        // A new account starts with an empty master resume, so the editor is never
        // a blank slate with no context.
        const resumeId = uid('res')
        const versionId = uid('rv')
        const content = emptyResumeContent()
        content.contact.full_name = full_name
        content.contact.email = email
        d.resume_versions.push({
          id: versionId,
          resume_id: resumeId,
          version_number: 1,
          content,
          label: 'Created',
          created_at: nowIso(),
        })
        d.resumes.push({
          id: resumeId,
          user_id: user.id,
          title: 'Master resume',
          is_master: true,
          template_id: 'ats-classic',
          tailored_from_resume_id: null,
          job_description_id: null,
          current_version_id: versionId,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
        return authResponse(d, user)
      })
    },

    async login({ email, password }) {
      await latency()
      // The demo credentials work on a fresh browser: seed on first use rather than
      // failing with "wrong password" against an empty database.
      if (email.toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
        return mockApi.auth.loginDemo()
      }
      return mutate((d) => {
        const user = d.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
        if (!user || user.password !== password) throw new ApiError(401, 'Wrong email or password')
        return authResponse(d, user)
      })
    },

    async loginDemo() {
      await latency()
      let d = loadDb()
      if (!d.users.some((u) => u.email === DEMO_EMAIL)) {
        d = buildSeedDb()
        saveDb(d)
      }
      return mutate((next) => {
        const user = next.users.find((u) => u.email === DEMO_EMAIL)
        if (!user) throw new ApiError(500, 'Demo account missing')
        user.password = DEMO_PASSWORD
        return authResponse(next, user)
      })
    },

    async logout() {
      await latency(40, 90)
      mutate((d) => {
        d.session = null
      })
    },

    async me() {
      await latency(30, 80)
      const d = db()
      if (!d.session) return null
      const user = d.users.find((u) => u.id === d.session!.user_id)
      if (!user) return null
      const { password: _password, ...safe } = user
      return safe as User
    },

    async updateProfile(patch) {
      await latency()
      return mutate((d) => {
        const me = currentUser(d)
        const user = d.users.find((u) => u.id === me.id)!
        Object.assign(user, patch, { id: user.id, email: patch.email ?? user.email })
        const { password: _password, ...safe } = user
        return safe as User
      })
    },
  },

  resumes: {
    async list() {
      await latency()
      const d = db()
      const me = currentUser(d)
      return d.resumes
        .filter((r) => r.user_id === me.id)
        .sort((a, b) => Number(b.is_master) - Number(a.is_master) || b.updated_at.localeCompare(a.updated_at))
    },

    async get(id) {
      await latency()
      const d = db()
      const resume = d.resumes.find((r) => r.id === id)
      if (!resume) throw new ApiError(404, 'Resume not found')
      return { resume, version: versionOf(d, resume) }
    },

    async create({ title, content, template_id = 'ats-classic', is_master = false }) {
      await latency()
      return mutate((d) => {
        const me = currentUser(d)
        const resumeId = uid('res')
        const versionId = uid('rv')
        const body = content ?? emptyResumeContent()
        if (!content) {
          body.contact.full_name = me.full_name
          body.contact.email = me.email
        }
        const version: ResumeVersion = {
          id: versionId,
          resume_id: resumeId,
          version_number: 1,
          content: body,
          label: 'Created',
          created_at: nowIso(),
        }
        const resume: Resume = {
          id: resumeId,
          user_id: me.id,
          title,
          is_master: is_master && !d.resumes.some((r) => r.user_id === me.id && r.is_master),
          // Denormalised from the version body so `list()` can badge and filter
          // document resumes without loading every snapshot.
          mode: body.mode ?? 'structured',
          template_id,
          tailored_from_resume_id: null,
          job_description_id: null,
          current_version_id: versionId,
          created_at: nowIso(),
          updated_at: nowIso(),
        }
        d.resume_versions.push(version)
        d.resumes.push(resume)
        return { resume, version }
      })
    },

    async update(id, patch) {
      await latency()
      return mutate((d) => {
        const resume = d.resumes.find((r) => r.id === id)
        if (!resume) throw new ApiError(404, 'Resume not found')
        if (patch.is_master) {
          for (const other of d.resumes.filter((r) => r.user_id === resume.user_id)) {
            other.is_master = false
          }
        }
        Object.assign(resume, patch, { updated_at: nowIso() })
        return resume
      })
    },

    async remove(id) {
      await latency()
      mutate((d) => {
        const resume = d.resumes.find((r) => r.id === id)
        if (!resume) throw new ApiError(404, 'Resume not found')
        if (resume.is_master) throw new ApiError(400, 'The master resume cannot be deleted')
        d.resumes = d.resumes.filter((r) => r.id !== id)
        d.resume_versions = d.resume_versions.filter((v) => v.resume_id !== id)
        // Applications keep pointing at the version that was actually sent, so
        // analytics stay honest; only the live link is cleared.
        for (const app of d.applications) if (app.resume_id === id) app.resume_id = null
      })
    },

    async duplicate(id, title) {
      await latency()
      return mutate((d) => {
        const source = d.resumes.find((r) => r.id === id)
        if (!source) throw new ApiError(404, 'Resume not found')
        const resumeId = uid('res')
        const versionId = uid('rv')
        const version: ResumeVersion = {
          id: versionId,
          resume_id: resumeId,
          version_number: 1,
          content: deepClone(versionOf(d, source).content),
          label: `Copied from ${source.title}`,
          created_at: nowIso(),
        }
        const resume: Resume = {
          ...source,
          id: resumeId,
          title,
          is_master: false,
          current_version_id: versionId,
          tailored_from_resume_id: source.id,
          created_at: nowIso(),
          updated_at: nowIso(),
        }
        d.resume_versions.push(version)
        d.resumes.push(resume)
        return { resume, version }
      })
    },

    async saveVersion(id, content, label = '') {
      await latency()
      return mutate((d) => {
        const resume = d.resumes.find((r) => r.id === id)
        if (!resume) throw new ApiError(404, 'Resume not found')
        const existing = d.resume_versions.filter((v) => v.resume_id === id)
        const version: ResumeVersion = {
          id: uid('rv'),
          resume_id: id,
          version_number: existing.length + 1,
          content: deepClone(content),
          label,
          created_at: nowIso(),
        }
        d.resume_versions.push(version)
        resume.current_version_id = version.id
        resume.mode = content.mode ?? 'structured'
        resume.updated_at = nowIso()
        return version
      })
    },

    async versions(id) {
      await latency()
      return db()
        .resume_versions.filter((v) => v.resume_id === id)
        .sort((a, b) => b.version_number - a.version_number)
    },

    async restoreVersion(id, versionId) {
      await latency()
      return mutate((d) => {
        const resume = d.resumes.find((r) => r.id === id)
        const source = d.resume_versions.find((v) => v.id === versionId)
        if (!resume || !source) throw new ApiError(404, 'Version not found')
        const existing = d.resume_versions.filter((v) => v.resume_id === id)
        // Restoring creates a new version rather than rewriting history.
        const version: ResumeVersion = {
          id: uid('rv'),
          resume_id: id,
          version_number: existing.length + 1,
          content: deepClone(source.content),
          label: `Restored v${source.version_number}`,
          created_at: nowIso(),
        }
        d.resume_versions.push(version)
        resume.current_version_id = version.id
        resume.mode = version.content.mode ?? 'structured'
        resume.updated_at = nowIso()
        return version
      })
    },

    async score(content) {
      await latency(60, 140)
      return scoreResume(content)
    },

    async ats(content, templateId) {
      await latency(60, 140)
      return checkAts(content, templateId)
    },

    async parseOnly(text) {
      await latency(400, 900)
      mutate((d) => {
        recordUsage(d, 'parse_resume')
        recordJob(d, 'parse_resume', 'Parsed an uploaded resume', null)
      })
      return parseResumeText(text)
    },

    async importText(text, title) {
      await latency(500, 1100)
      const parse = parseResumeText(text)
      const resume = await mockApi.resumes.create({ title, content: parse.content })
      mutate((d) => {
        recordUsage(d, 'parse_resume')
        recordJob(d, 'parse_resume', `Imported "${title}"`, resume.resume.id)
      })
      return { parse, resume }
    },
  },

  jds: {
    async list() {
      await latency()
      const d = db()
      const me = currentUser(d)
      return d.job_descriptions
        .filter((j) => j.user_id === me.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },

    async get(id) {
      await latency()
      return findJd(db(), id)
    },

    async createFromText({ raw_text, source_url = null, source = 'Other' }) {
      await latency(500, 1200)
      return mutate((d) => {
        const me = currentUser(d)
        const parsed = parseJobDescription(raw_text, source_url)

        // Cache hit: the same posting pasted twice should not cost a second parse (§10).
        const existing = d.job_descriptions.find(
          (j) => j.user_id === me.id && normalizeKey(j.raw_text) === normalizeKey(raw_text),
        )
        if (existing) {
          recordUsage(d, 'parse_jd', true)
          recordJob(d, 'parse_jd', `Cache hit for ${existing.company_name}`, existing.id)
          return existing
        }

        const jd: JobDescription = {
          id: uid('jd'),
          user_id: me.id,
          source_url,
          source: source as ApplicationSource,
          raw_text,
          parsed,
          company_name: parsed.company_name,
          role_title: parsed.role_title,
          created_at: nowIso(),
        }
        d.job_descriptions.push(jd)
        recordUsage(d, 'parse_jd')
        recordJob(d, 'parse_jd', `Parsed ${jd.role_title} at ${jd.company_name}`, jd.id)
        return jd
      })
    },

    async createFromUrl(_url) {
      await latency(300, 600)
      // The browser cannot fetch an arbitrary job board (CORS), and scraping an
      // authenticated board is out of scope by design (§6). The backend fetches
      // via its own allowlist; here we tell the user plainly.
      throw new ApiError(
        422,
        'URL fetching runs server-side (the browser is blocked by CORS, and authenticated job boards are deliberately out of scope). Paste the description text instead, or run the backend with VITE_API_MODE=http.',
      )
    },

    async remove(id) {
      await latency()
      mutate((d) => {
        d.job_descriptions = d.job_descriptions.filter((j) => j.id !== id)
        for (const app of d.applications) if (app.job_description_id === id) app.job_description_id = null
      })
    },

    async match(id, resumeId) {
      await latency(200, 500)
      const d = db()
      const jd = findJd(d, id)
      const content = contentOfResume(d, resumeId)
      const report = matchResumeToJD(content, jd.parsed, { resume_id: resumeId, job_description_id: id })
      mutate((next) => recordUsage(next, 'match', true))
      return report
    },
  },

  tailoring: {
    async generate({ resume_id, job_description_id, options = DEFAULT_TAILOR_OPTIONS }) {
      await latency(900, 1800)
      return mutate((d) => {
        const resume = d.resumes.find((r) => r.id === resume_id)
        if (!resume) throw new ApiError(404, 'Resume not found')
        const jd = findJd(d, job_description_id)
        const base = versionOf(d, resume)
        const draft = tailorResume(base.content, jd, { resume_id, base_version_id: base.id }, options)
        d.tailor_drafts.unshift(draft)
        d.tailor_drafts = d.tailor_drafts.slice(0, 30)
        recordUsage(d, 'tailor')
        recordJob(d, 'tailor', `Tailored for ${jd.company_name}`, draft.id)
        return draft
      })
    },

    async get(id) {
      await latency()
      const draft = db().tailor_drafts.find((t) => t.id === id)
      if (!draft) throw new ApiError(404, 'Draft not found')
      return draft
    },

    async setChanges(id, changes) {
      await latency(80, 180)
      return mutate((d) => {
        const draft = d.tailor_drafts.find((t) => t.id === id)
        if (!draft) throw new ApiError(404, 'Draft not found')
        const baseVersion = d.resume_versions.find((v) => v.id === draft.base_version_id)
        if (!baseVersion) throw new ApiError(404, 'Base version not found')
        const jd = findJd(d, draft.job_description_id)
        draft.changes = changes
        draft.content = applyChanges(baseVersion.content, changes)
        draft.density = keywordDensity(draft.content, jd.parsed)
        draft.match_after = matchResumeToJD(draft.content, jd.parsed, {
          resume_id: draft.resume_id,
          job_description_id: jd.id,
        }).score
        return draft
      })
    },

    async saveVariant(id, title) {
      await latency()
      return mutate((d) => {
        const draft = d.tailor_drafts.find((t) => t.id === id)
        if (!draft) throw new ApiError(404, 'Draft not found')
        const me = currentUser(d)
        const source = d.resumes.find((r) => r.id === draft.resume_id)
        const resumeId = uid('res')
        const versionId = uid('rv')
        const version: ResumeVersion = {
          id: versionId,
          resume_id: resumeId,
          version_number: 1,
          content: deepClone(draft.content),
          label: `Tailored (${draft.changes.filter((c) => c.accepted).length} changes accepted)`,
          created_at: nowIso(),
        }
        const resume: Resume = {
          id: resumeId,
          user_id: me.id,
          title,
          is_master: false,
          template_id: source?.template_id ?? 'ats-classic',
          tailored_from_resume_id: draft.resume_id,
          job_description_id: draft.job_description_id,
          current_version_id: versionId,
          created_at: nowIso(),
          updated_at: nowIso(),
        }
        d.resume_versions.push(version)
        d.resumes.push(resume)
        return { resume, version }
      })
    },
  },

  coverLetters: {
    async list() {
      await latency()
      const d = db()
      const me = currentUser(d)
      return d.cover_letters
        .filter((c) => c.user_id === me.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },

    async get(id) {
      await latency()
      const letter = db().cover_letters.find((c) => c.id === id)
      if (!letter) throw new ApiError(404, 'Cover letter not found')
      return letter
    },

    async generate({ job_description_id, resume_id, tone, why_company_notes }) {
      await latency(800, 1600)
      return mutate((d) => {
        const me = currentUser(d)
        const jd = findJd(d, job_description_id)
        const master = d.resumes.find((r) => r.is_master)
        const content = resume_id ? contentOfResume(d, resume_id) : master ? versionOf(d, master).content : emptyResumeContent()
        const letter = generateCoverLetter({
          user: me,
          content,
          jd,
          tone,
          whyCompany: why_company_notes,
          resumeId: resume_id,
        })
        d.cover_letters.unshift(letter)
        recordUsage(d, 'cover_letter')
        recordJob(d, 'cover_letter', `Cover letter for ${jd.company_name} (${tone})`, letter.id)
        return letter
      })
    },

    async update(id, patch) {
      await latency()
      return mutate((d) => {
        const letter = d.cover_letters.find((c) => c.id === id)
        if (!letter) throw new ApiError(404, 'Cover letter not found')
        Object.assign(letter, patch)
        return letter
      })
    },

    async remove(id) {
      await latency()
      mutate((d) => {
        d.cover_letters = d.cover_letters.filter((c) => c.id !== id)
      })
    },
  },

  applications: {
    async list(filters = {}) {
      await latency()
      const d = db()
      const me = currentUser(d)
      let rows = d.applications.filter((a) => a.user_id === me.id)
      if (filters.status?.length) rows = rows.filter((a) => filters.status!.includes(a.status))
      if (filters.source?.length) rows = rows.filter((a) => filters.source!.includes(a.source))
      if (filters.resume_id) rows = rows.filter((a) => a.resume_id === filters.resume_id)
      if (filters.from) rows = rows.filter((a) => !a.applied_at || a.applied_at >= filters.from!)
      if (filters.to) rows = rows.filter((a) => !a.applied_at || a.applied_at <= `${filters.to}T23:59:59Z`)
      if (filters.search) {
        const q = filters.search.toLowerCase()
        rows = rows.filter(
          (a) =>
            a.company_name.toLowerCase().includes(q) ||
            a.role_title.toLowerCase().includes(q) ||
            a.location.toLowerCase().includes(q),
        )
      }
      return rows.sort(
        (a, b) => (b.applied_at ?? b.created_at).localeCompare(a.applied_at ?? a.created_at),
      )
    },

    async get(id) {
      await latency()
      return findApp(db(), id)
    },

    async create(input) {
      await latency()
      return mutate((d) => {
        const me = currentUser(d)
        const status = (input.status ?? 'Saved') as ApplicationStatus
        const app: Application = {
          id: uid('app'),
          user_id: me.id,
          job_description_id: input.job_description_id ?? null,
          company_name: input.company_name,
          role_title: input.role_title,
          location: input.location ?? '',
          source: (input.source ?? 'Other') as ApplicationSource,
          status,
          resume_id: input.resume_id ?? null,
          resume_version_id: input.resume_version_id ?? null,
          cover_letter_id: input.cover_letter_id ?? null,
          match_score: input.match_score ?? null,
          salary_text: input.salary_text ?? '',
          applied_at: input.applied_at ?? (status === 'Saved' ? null : nowIso()),
          next_follow_up_at:
            status === 'Saved' ? null : daysFromNowIso(me.follow_up_days),
          board_index: d.applications.filter((a) => a.status === status).length,
          contacts: input.contacts ?? [],
          notes: input.notes ?? [],
          attachments: input.attachments ?? [],
          jd_snapshot:
            input.jd_snapshot ??
            (input.job_description_id
              ? d.job_descriptions.find((j) => j.id === input.job_description_id)?.raw_text ?? ''
              : ''),
          created_at: nowIso(),
          updated_at: nowIso(),
        }
        d.applications.push(app)
        d.status_history.push({
          id: uid('sh'),
          application_id: app.id,
          from_status: null,
          to_status: status,
          changed_at: nowIso(),
          note: 'Created',
        })
        return app
      })
    },

    async update(id, patch) {
      await latency()
      return mutate((d) => {
        const app = findApp(d, id)
        const { status: _ignored, ...rest } = patch
        Object.assign(app, rest, { updated_at: nowIso() })
        return app
      })
    },

    async setStatus(id, status, note = '') {
      await latency(100, 240)
      return mutate((d) => {
        const app = findApp(d, id)
        const me = currentUser(d)
        if (app.status === status) return app
        d.status_history.push({
          id: uid('sh'),
          application_id: app.id,
          from_status: app.status,
          to_status: status,
          changed_at: nowIso(),
          note,
        })
        app.status = status
        if (status !== 'Saved' && !app.applied_at) app.applied_at = nowIso()
        app.next_follow_up_at = OPEN_STATUSES.includes(status)
          ? daysFromNowIso(me.follow_up_days)
          : null
        app.board_index = d.applications.filter((a) => a.status === status && a.id !== app.id).length
        app.updated_at = nowIso()
        return app
      })
    },

    async remove(id) {
      await latency()
      mutate((d) => {
        d.applications = d.applications.filter((a) => a.id !== id)
        d.status_history = d.status_history.filter((h) => h.application_id !== id)
      })
    },

    async history(id) {
      await latency()
      return db()
        .status_history.filter((h) => h.application_id === id)
        .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    },

    async checkDuplicate({ company_name, role_title }) {
      await latency(60, 140)
      const d = db()
      const me = currentUser(d)
      const company = normalizeKey(company_name)
      const role = normalizeKey(role_title)
      const rows = d.applications.filter((a) => a.user_id === me.id)
      const exact = rows.find((a) => normalizeKey(a.company_name) === company && normalizeKey(a.role_title) === role)
      const sameCompany = rows.find((a) => normalizeKey(a.company_name) === company)
      const hit = exact ?? sameCompany
      if (!hit) return null
      return {
        application_id: hit.id,
        company_name: hit.company_name,
        role_title: hit.role_title,
        status: hit.status,
        applied_at: hit.applied_at,
        reason: exact ? 'exact' : 'same_company',
      } satisfies DuplicateWarning
    },

    async addNote(id, body) {
      await latency()
      return mutate((d) => {
        const app = findApp(d, id)
        const note: ApplicationNote = { id: uid('note'), body, created_at: nowIso() }
        app.notes.unshift(note)
        app.updated_at = nowIso()
        return note
      })
    },

    async addContact(id, contact) {
      await latency()
      return mutate((d) => {
        const app = findApp(d, id)
        const row: ApplicationContact = { ...contact, id: uid('con') }
        app.contacts.push(row)
        app.updated_at = nowIso()
        return row
      })
    },

    async removeContact(id, contactId) {
      await latency()
      mutate((d) => {
        const app = findApp(d, id)
        app.contacts = app.contacts.filter((c) => c.id !== contactId)
      })
    },

    async attachSnapshot(id, input) {
      await latency(200, 500)
      return mutate((d) => {
        const app = findApp(d, id)
        const attachment: ApplicationAttachment = {
          id: uid('att'),
          filename: input.filename,
          kind: input.kind,
          format: input.format,
          storage_key: `s3://jobpilot/attachments/${app.id}/${input.filename}`,
          snapshot: input.snapshot,
          size_bytes: new Blob([input.snapshot]).size,
          created_at: nowIso(),
        }
        app.attachments.push(attachment)
        app.updated_at = nowIso()
        return attachment
      })
    },

    async reorder(id, status, boardIndex) {
      await latency(40, 110)
      return mutate((d) => {
        const app = findApp(d, id)
        const me = currentUser(d)
        if (app.status !== status) {
          d.status_history.push({
            id: uid('sh'),
            application_id: app.id,
            from_status: app.status,
            to_status: status,
            changed_at: nowIso(),
            note: 'Moved on the board',
          })
          app.status = status
          if (status !== 'Saved' && !app.applied_at) app.applied_at = nowIso()
          app.next_follow_up_at = OPEN_STATUSES.includes(status) ? daysFromNowIso(me.follow_up_days) : null
        }
        const column = d.applications
          .filter((a) => a.status === status && a.id !== app.id)
          .sort((a, b) => a.board_index - b.board_index)
        column.splice(clamp(boardIndex, 0, column.length), 0, app)
        column.forEach((row, i) => {
          row.board_index = i
        })
        app.updated_at = nowIso()
        return app
      })
    },

    async bulkImport(rows) {
      await latency(600, 1200)
      return mutate((d) => {
        const me = currentUser(d)
        const duplicates: DuplicateWarning[] = []
        let created = 0
        let skipped = 0

        for (const row of rows) {
          const company = row.company_name || row.company || row.Company || ''
          const role = row.role_title || row.role || row.Role || row.position || ''
          if (!company || !role) {
            skipped += 1
            continue
          }
          const existing = d.applications.find(
            (a) =>
              a.user_id === me.id &&
              normalizeKey(a.company_name) === normalizeKey(company) &&
              normalizeKey(a.role_title) === normalizeKey(role),
          )
          if (existing) {
            duplicates.push({
              application_id: existing.id,
              company_name: existing.company_name,
              role_title: existing.role_title,
              status: existing.status,
              applied_at: existing.applied_at,
              reason: 'exact',
            })
            skipped += 1
            continue
          }

          const status = (PIPELINE.find((s) => s.toLowerCase() === (row.status ?? '').toLowerCase()) ??
            'Applied') as ApplicationStatus
          const appliedAt = row.applied_at ? new Date(row.applied_at).toISOString() : nowIso()
          const app: Application = {
            id: uid('app'),
            user_id: me.id,
            job_description_id: null,
            company_name: company,
            role_title: role,
            location: row.location ?? '',
            source: (PIPELINE_SOURCES.find((s) => s.toLowerCase() === (row.source ?? '').toLowerCase()) ??
              'Other') as ApplicationSource,
            status,
            resume_id: null,
            resume_version_id: null,
            cover_letter_id: null,
            match_score: row.match_score ? Number(row.match_score) : null,
            salary_text: row.salary_text ?? row.salary ?? '',
            applied_at: status === 'Saved' ? null : appliedAt,
            next_follow_up_at: OPEN_STATUSES.includes(status) ? daysFromNowIso(me.follow_up_days) : null,
            board_index: d.applications.filter((a) => a.status === status).length,
            contacts: [],
            notes: row.notes ? [{ id: uid('note'), body: row.notes, created_at: nowIso() }] : [],
            attachments: [],
            jd_snapshot: '',
            created_at: nowIso(),
            updated_at: nowIso(),
          }
          d.applications.push(app)
          d.status_history.push({
            id: uid('sh'),
            application_id: app.id,
            from_status: null,
            to_status: status,
            changed_at: appliedAt,
            note: 'Imported from CSV',
          })
          created += 1
        }
        return { created, skipped, duplicates }
      })
    },
  },

  analytics: {
    async dashboard(filters = {}) {
      await latency(200, 500)
      const d = db()
      const me = currentUser(d)
      let apps = d.applications.filter((a) => a.user_id === me.id)
      if (filters.source?.length) apps = apps.filter((a) => filters.source!.includes(a.source))
      if (filters.resume_id) apps = apps.filter((a) => a.resume_id === filters.resume_id)
      apps = apps.filter((a) => inRange(a.applied_at ?? a.created_at, filters))

      const followUps = apps
        .filter(
          (a) =>
            a.next_follow_up_at &&
            a.next_follow_up_at <= nowIso() &&
            OPEN_STATUSES.includes(a.status),
        )
        .sort((a, b) => (a.next_follow_up_at ?? '').localeCompare(b.next_follow_up_at ?? ''))

      return {
        funnel: buildFunnel(d, apps),
        volume: buildVolume(apps, me.weekly_application_goal),
        response: buildResponse(d, apps),
        sources: buildSources(d, apps),
        skill_gaps: buildSkillGaps(d, apps),
        follow_ups_due: followUps,
        generated_at: nowIso(),
      } satisfies DashboardSummary
    },
  },

  discovery: {
    async listSearches() {
      await latency()
      const d = db()
      const me = currentUser(d)
      return d.saved_searches.filter((s) => s.user_id === me.id)
    },

    async createSearch(input) {
      await latency()
      return mutate((d) => {
        const me = currentUser(d)
        const search: SavedSearch = {
          ...input,
          id: uid('ss'),
          user_id: me.id,
          last_run_at: null,
          created_at: nowIso(),
        }
        d.saved_searches.push(search)
        return search
      })
    },

    async updateSearch(id, patch) {
      await latency()
      return mutate((d) => {
        const search = d.saved_searches.find((s) => s.id === id)
        if (!search) throw new ApiError(404, 'Saved search not found')
        Object.assign(search, patch)
        return search
      })
    },

    async removeSearch(id) {
      await latency()
      mutate((d) => {
        d.saved_searches = d.saved_searches.filter((s) => s.id !== id)
        d.discovered_jobs = d.discovered_jobs.filter((j) => j.saved_search_id !== id)
      })
    },

    async runScan(id) {
      await latency(1200, 2200)
      return mutate((d) => {
        const me = currentUser(d)
        const search = d.saved_searches.find((s) => s.id === id)
        if (!search) throw new ApiError(404, 'Saved search not found')

        const known = new Set(d.discovered_jobs.map((j) => normalizeKey(`${j.company_name}${j.role_title}`)))
        const fresh = DISCOVERY_POOL.filter((row) => !known.has(normalizeKey(`${row.company}${row.role}`))).slice(0, 3)

        const found: DiscoveredJob[] = []
        for (const row of fresh) {
          const raw = syntheticJdText(row.company, row.role, row.location, row.salary)
          const parsed = parseJobDescription(raw, `https://example.com/${row.company.toLowerCase()}`)
          parsed.company_name = row.company
          parsed.role_title = row.role
          parsed.location = row.location
          parsed.remote = row.remote
          parsed.salary_text = row.salary
          const jd: JobDescription = {
            id: uid('jd'),
            user_id: me.id,
            source_url: `https://example.com/${normalizeKey(row.company)}/jobs/${uid('p')}`,
            source: search.channels[0] ?? 'Other',
            raw_text: raw,
            parsed,
            company_name: row.company,
            role_title: row.role,
            created_at: nowIso(),
          }
          d.job_descriptions.push(jd)

          const { score, reasons } = scoreDiscovered(d, parsed, jd.id)
          const job: DiscoveredJob = {
            id: uid('dj'),
            saved_search_id: search.id,
            job_description_id: jd.id,
            company_name: row.company,
            role_title: row.role,
            location: row.location,
            remote: row.remote,
            salary_text: row.salary,
            channel: jd.source,
            url: jd.source_url!,
            match_score: score,
            match_reasons: reasons,
            status: 'new',
            draft_resume_id: null,
            draft_cover_letter_id: null,
            application_id: null,
            discovered_at: nowIso(),
          }
          d.discovered_jobs.unshift(job)
          found.push(job)
        }

        // §6.2 — auto-draft above the fit threshold, queued for review. Never submitted.
        let drafted = 0
        if (search.auto_draft) {
          const master = d.resumes.find((r) => r.is_master)
          for (const job of found) {
            if (job.match_score < search.fit_threshold || !master) continue
            const jd = findJd(d, job.job_description_id)
            const base = versionOf(d, master)
            const draft = tailorResume(base.content, jd, {
              resume_id: master.id,
              base_version_id: base.id,
            })
            d.tailor_drafts.unshift(draft)
            job.draft_resume_id = draft.id
            job.status = 'drafted'
            recordUsage(d, 'tailor')
            drafted += 1
          }
        }

        search.last_run_at = nowIso()
        recordUsage(d, 'discovery_scan')
        recordJob(
          d,
          'discovery_scan',
          `Scanned ${search.channels.length} channels for "${search.name}": ${found.length} new, ${drafted} drafted`,
          search.id,
        )
        return { found, drafted }
      })
    },

    async listJobs(filters = {}) {
      await latency()
      const d = db()
      let rows = [...d.discovered_jobs]
      if (filters.status?.length) rows = rows.filter((j) => filters.status!.includes(j.status))
      if (filters.saved_search_id) rows = rows.filter((j) => j.saved_search_id === filters.saved_search_id)
      if (filters.min_score != null) rows = rows.filter((j) => j.match_score >= filters.min_score!)
      return rows.sort((a, b) => b.match_score - a.match_score || b.discovered_at.localeCompare(a.discovered_at))
    },

    async setJobStatus(id, status) {
      await latency(60, 150)
      return mutate((d) => {
        const job = d.discovered_jobs.find((j) => j.id === id)
        if (!job) throw new ApiError(404, 'Discovered job not found')
        job.status = status
        return job
      })
    },

    async prepare(id) {
      await latency(1200, 2400)
      return mutate((d) => {
        const me = currentUser(d)
        const job = d.discovered_jobs.find((j) => j.id === id)
        if (!job) throw new ApiError(404, 'Discovered job not found')
        const jd = findJd(d, job.job_description_id)
        const master = d.resumes.find((r) => r.is_master)
        if (!master) throw new ApiError(400, 'Create a master resume first')
        const base = versionOf(d, master)

        const draft =
          (job.draft_resume_id && d.tailor_drafts.find((t) => t.id === job.draft_resume_id)) ||
          tailorResume(base.content, jd, { resume_id: master.id, base_version_id: base.id })
        if (!d.tailor_drafts.some((t) => t.id === draft.id)) d.tailor_drafts.unshift(draft)

        const letter = generateCoverLetter({
          user: me,
          content: draft.content,
          jd,
          tone: 'conversational',
          whyCompany: '',
          resumeId: master.id,
        })
        d.cover_letters.unshift(letter)

        const app: Application = {
          id: uid('app'),
          user_id: me.id,
          job_description_id: jd.id,
          company_name: job.company_name,
          role_title: job.role_title,
          location: job.location,
          source: job.channel,
          // Prepared, not submitted — the human owns the submit (§6).
          status: 'Saved',
          resume_id: master.id,
          resume_version_id: base.id,
          cover_letter_id: letter.id,
          match_score: job.match_score,
          salary_text: job.salary_text ?? '',
          applied_at: null,
          next_follow_up_at: null,
          board_index: d.applications.filter((a) => a.status === 'Saved').length,
          contacts: [],
          notes: [
            {
              id: uid('note'),
              body: `Prepared from the discovery feed. Draft resume + cover letter ready for review. Apply at ${job.url}`,
              created_at: nowIso(),
            },
          ],
          attachments: [],
          jd_snapshot: jd.raw_text,
          created_at: nowIso(),
          updated_at: nowIso(),
        }
        d.applications.push(app)
        d.status_history.push({
          id: uid('sh'),
          application_id: app.id,
          from_status: null,
          to_status: 'Saved',
          changed_at: nowIso(),
          note: 'Prepared by the discovery agent',
        })

        job.status = 'prepared'
        job.draft_resume_id = draft.id
        job.draft_cover_letter_id = letter.id
        job.application_id = app.id

        recordUsage(d, 'tailor')
        recordUsage(d, 'cover_letter')
        recordJob(d, 'tailor', `Prepared application for ${job.company_name}`, app.id)

        return { discovered: job, draft, application: app, cover_letter: letter }
      })
    },
  },

  interview: {
    async listSessions() {
      await latency()
      const d = db()
      const me = currentUser(d)
      return d.prep_sessions
        .filter((s) => s.user_id === me.id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    },

    async getSession(id) {
      await latency()
      const session = db().prep_sessions.find((s) => s.id === id)
      if (!session) throw new ApiError(404, 'Session not found')
      return session
    },

    async generate({ job_description_id, application_id = null, resume_id = null }) {
      await latency(1000, 2000)
      return mutate((d) => {
        const me = currentUser(d)
        const jd = findJd(d, job_description_id)
        const master = d.resumes.find((r) => r.is_master)
        const resumeIdToUse = resume_id ?? master?.id ?? null
        const content = resumeIdToUse ? contentOfResume(d, resumeIdToUse) : null

        const session: InterviewPrepSession = {
          id: uid('prep'),
          user_id: me.id,
          application_id,
          job_description_id: jd.id,
          resume_id: resumeIdToUse,
          company_brief: buildCompanyBrief(jd),
          questions: generateQuestions(jd, content),
          transcript: [],
          created_at: nowIso(),
          updated_at: nowIso(),
        }
        d.prep_sessions.unshift(session)
        recordUsage(d, 'interview_questions')
        recordUsage(d, 'company_brief')
        recordJob(d, 'interview_questions', `${session.questions.length} questions for ${jd.company_name}`, session.id)
        return session
      })
    },

    async draftStar(sessionId, questionId) {
      await latency(700, 1400)
      return mutate((d) => {
        const session = d.prep_sessions.find((s) => s.id === sessionId)
        if (!session) throw new ApiError(404, 'Session not found')
        const question = session.questions.find((q) => q.id === questionId)
        if (!question) throw new ApiError(404, 'Question not found')
        const content = session.resume_id ? contentOfResume(d, session.resume_id) : null
        if (!content) throw new ApiError(400, 'No resume to ground the answer in')
        const draft = draftStarAnswer(question, content)
        if (!draft) {
          throw new ApiError(
            422,
            'No resume bullet is close enough to ground this answer. Add the relevant experience to your profile first — the draft will not invent one.',
          )
        }
        question.star_draft = draft
        session.updated_at = nowIso()
        recordUsage(d, 'interview_questions')
        return question
      })
    },

    async updateQuestion(sessionId, question) {
      await latency(60, 140)
      return mutate((d) => {
        const session = d.prep_sessions.find((s) => s.id === sessionId)
        if (!session) throw new ApiError(404, 'Session not found')
        const index = session.questions.findIndex((q) => q.id === question.id)
        if (index < 0) throw new ApiError(404, 'Question not found')
        session.questions[index] = question
        session.updated_at = nowIso()
        return question
      })
    },

    async askNext(sessionId) {
      await latency(300, 700)
      return mutate((d) => {
        const session = d.prep_sessions.find((s) => s.id === sessionId)
        if (!session) throw new ApiError(404, 'Session not found')
        const asked = new Set(
          session.transcript.filter((t) => t.role === 'interviewer').map((t) => t.question_id),
        )
        const next = session.questions.find((q) => !asked.has(q.id))
        if (!next) {
          session.transcript.push({
            id: uid('turn'),
            role: 'interviewer',
            question_id: null,
            body: 'That is everything from my side. Do you have questions for me?',
            feedback: null,
            created_at: nowIso(),
          })
        } else {
          session.transcript.push({
            id: uid('turn'),
            role: 'interviewer',
            question_id: next.id,
            body: next.question,
            feedback: null,
            created_at: nowIso(),
          })
        }
        session.updated_at = nowIso()
        return session
      })
    },

    async answerMock(sessionId, { question_id, answer }) {
      await latency(700, 1500)
      return mutate((d) => {
        const session = d.prep_sessions.find((s) => s.id === sessionId)
        if (!session) throw new ApiError(404, 'Session not found')
        const question =
          session.questions.find((q) => q.id === question_id) ??
          ({
            id: question_id,
            question: 'Follow-up',
            kind: 'behavioral',
            from_requirement: '',
            difficulty: 'medium',
            star_draft: null,
            saved_to_bank: false,
          } satisfies InterviewQuestion)

        const feedback = scoreMockAnswer(answer, question)
        const turns: MockTurn[] = [
          {
            id: uid('turn'),
            role: 'candidate',
            question_id,
            body: answer,
            feedback: null,
            created_at: nowIso(),
          },
          {
            id: uid('turn'),
            role: 'feedback',
            question_id,
            body: feedback.used_star
              ? 'Solid STAR shape. Notes below.'
               : 'The structure slipped — see the notes below.',
            feedback,
            created_at: nowIso(),
          },
        ]
        session.transcript.push(...turns)
        session.updated_at = nowIso()
        recordUsage(d, 'interview_questions')
        return { session, feedback }
      })
    },

    async resetMock(sessionId) {
      await latency(80, 200)
      return mutate((d) => {
        const session = d.prep_sessions.find((s) => s.id === sessionId)
        if (!session) throw new ApiError(404, 'Session not found')
        session.transcript = []
        session.updated_at = nowIso()
        return session
      })
    },

    async listBank() {
      await latency()
      const d = db()
      const me = currentUser(d)
      const mySessionIds = new Set(d.prep_sessions.filter((s) => s.user_id === me.id).map((s) => s.id))
      return d.question_bank
        .filter((row) => !row.session_id || mySessionIds.has(row.session_id))
        .sort((a, b) => b.saved_at.localeCompare(a.saved_at))
    },

    async saveToBank(sessionId, questionId) {
      await latency()
      return mutate((d) => {
        const session = d.prep_sessions.find((s) => s.id === sessionId)
        if (!session) throw new ApiError(404, 'Session not found')
        const question = session.questions.find((q) => q.id === questionId)
        if (!question) throw new ApiError(404, 'Question not found')
        const jd = findJd(d, session.job_description_id)
        question.saved_to_bank = true
        const row: BankQuestion = {
          ...question,
          bank_id: uid('bank'),
          session_id: session.id,
          role_title: jd.role_title,
          company_name: jd.company_name,
          saved_at: nowIso(),
        }
        d.question_bank.unshift(row)
        return row
      })
    },

    async removeFromBank(bankId) {
      await latency()
      mutate((d) => {
        d.question_bank = d.question_bank.filter((q) => q.bank_id !== bankId)
      })
    },
  },

  system: {
    async usage() {
      await latency(60, 140)
      const d = db()
      const start = new Date()
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      const rows = d.usage.generations.filter((g) => g.at >= start.toISOString())
      const byKind = new Map<string, number>()
      for (const row of rows) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1)
      const billable = rows.filter((r) => !r.cached).length
      return {
        period_start: start.toISOString(),
        generations_used: rows.length,
        generations_cap: GENERATION_CAP,
        cached_hits: rows.length - billable,
        // Rough blended figure; the real number comes from the provider's usage API.
        est_cost_usd: Math.round(billable * 0.021 * 100) / 100,
        by_kind: [...byKind.entries()].map(([kind, count]) => ({ kind: kind as JobKind, count })),
      } satisfies UsageStats
    },

    async jobs() {
      await latency(40, 100)
      return db().jobs
    },

    async reseed() {
      await latency(200, 400)
      saveDb(buildSeedDb())
    },

    async reset() {
      await latency(100, 200)
      resetDb()
    },

    async exportAll() {
      await latency(100, 200)
      return exportDb()
    },

    async importAll(json) {
      await latency(200, 400)
      importDb(json)
    },
  },
}

const PIPELINE_SOURCES: ApplicationSource[] = [
  'LinkedIn',
  'Indeed',
  'Referral',
  'Company site',
  'Greenhouse',
  'Lever',
  'Ashby',
  'RemoteOK',
  'Adzuna',
  'Other',
]

/** Used by the tracker UI when freezing an attachment from the current resume. */
export function snapshotTextFor(content: ResumeContent) {
  return renderResumeText(content)
}

export function bulletPlainText(html: string) {
  return stripHtml(html)
}
