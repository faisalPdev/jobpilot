/**
 * HTTP implementation of the Api surface, mapped onto the FastAPI routes in
 * spec §9. Selected with VITE_API_MODE=http.
 *
 * Anything the browser genuinely cannot do (PDF/DOCX parsing, fetching a JD by
 * URL) is a server call here, which is why those live behind the API at all.
 */
import type {
  Application,
  ApplicationAttachment,
  ApplicationContact,
  ApplicationNote,
  AsyncJob,
  AtsReport,
  AuthResponse,
  BankQuestion,
  CoverLetter,
  DashboardSummary,
  DiscoveredJob,
  DuplicateWarning,
  InterviewPrepSession,
  InterviewQuestion,
  JobDescription,
  MatchReport,
  MockFeedback,
  Resume,
  ResumeScore,
  ResumeVersion,
  ResumeWithVersion,
  SavedSearch,
  StatusTransition,
  TailorDraft,
  UsageStats,
  User,
} from '@/types'
import type { Api } from './apiTypes'
import type { ParseResult } from './ai/resumeParse'
import { request, setTokens } from './http'
import { checkAts, scoreResume } from './ai/score'
import { DEMO_EMAIL, DEMO_PASSWORD } from './mock/seed'
import { ApiError } from './mock/handlers'

function storeAuth(res: AuthResponse) {
  setTokens(res.access_token, res.refresh_token)
  return res
}

export const httpApi: Api = {
  auth: {
    register: (input) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: input, anonymous: true }).then(storeAuth),
    login: (input) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: input, anonymous: true }).then(storeAuth),
    loginDemo: () =>
      request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
        anonymous: true,
      }).then(storeAuth),
    logout: async () => {
      try {
        await request<void>('/auth/logout', { method: 'POST' })
      } finally {
        setTokens(null, null)
      }
    },
    me: async () => {
      try {
        return await request<User>('/auth/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    updateProfile: (patch) => request<User>('/auth/me', { method: 'PATCH', body: patch }),
  },

  resumes: {
    list: () => request<Resume[]>('/resumes'),
    get: (id) => request<ResumeWithVersion>(`/resumes/${id}`),
    create: (input) => request<ResumeWithVersion>('/resumes', { method: 'POST', body: input }),
    update: (id, patch) => request<Resume>(`/resumes/${id}`, { method: 'PUT', body: patch }),
    remove: (id) => request<void>(`/resumes/${id}`, { method: 'DELETE' }),
    duplicate: (id, title) =>
      request<ResumeWithVersion>(`/resumes/${id}/duplicate`, { method: 'POST', body: { title } }),
    saveVersion: (id, content, label = '') =>
      request<ResumeVersion>(`/resumes/${id}/versions`, { method: 'POST', body: { content, label } }),
    versions: (id) => request<ResumeVersion[]>(`/resumes/${id}/versions`),
    restoreVersion: (id, versionId) =>
      request<ResumeVersion>(`/resumes/${id}/versions/${versionId}/restore`, { method: 'POST' }),
    // Scoring and the ATS check are pure functions of the content, so they run
    // locally for instant feedback while typing; the backend exposes the same
    // rubric for server-side reports.
    score: async (content): Promise<ResumeScore> => scoreResume(content),
    ats: async (content, templateId): Promise<AtsReport> => checkAts(content, templateId),
    importText: (text, title) =>
      request<{ parse: ParseResult; resume: ResumeWithVersion }>('/resumes/import', {
        method: 'POST',
        body: { text, title },
      }),
    parseOnly: (text) => request<ParseResult>('/resumes/parse', { method: 'POST', body: { text } }),
  },

  jds: {
    list: () => request<JobDescription[]>('/job-descriptions'),
    get: (id) => request<JobDescription>(`/job-descriptions/${id}`),
    createFromText: (input) => request<JobDescription>('/job-descriptions', { method: 'POST', body: input }),
    createFromUrl: (url) => request<JobDescription>('/job-descriptions', { method: 'POST', body: { source_url: url } }),
    remove: (id) => request<void>(`/job-descriptions/${id}`, { method: 'DELETE' }),
    match: (id, resumeId) =>
      request<MatchReport>(`/job-descriptions/${id}/match`, { query: { resume_id: resumeId } }),
  },

  tailoring: {
    generate: (input) => request<TailorDraft>('/tailoring/generate', { method: 'POST', body: input }),
    get: (id) => request<TailorDraft>(`/tailoring/${id}`),
    setChanges: (id, changes) =>
      request<TailorDraft>(`/tailoring/${id}/changes`, { method: 'PATCH', body: { changes } }),
    saveVariant: (id, title) =>
      request<ResumeWithVersion>(`/tailoring/${id}/save`, { method: 'POST', body: { title } }),
  },

  coverLetters: {
    list: () => request<CoverLetter[]>('/cover-letters'),
    get: (id) => request<CoverLetter>(`/cover-letters/${id}`),
    generate: (input) => request<CoverLetter>('/cover-letters/generate', { method: 'POST', body: input }),
    update: (id, patch) => request<CoverLetter>(`/cover-letters/${id}`, { method: 'PATCH', body: patch }),
    remove: (id) => request<void>(`/cover-letters/${id}`, { method: 'DELETE' }),
  },

  applications: {
    list: (filters = {}) =>
      request<Application[]>('/applications', {
        query: {
          status: filters.status,
          source: filters.source,
          search: filters.search,
          from: filters.from,
          to: filters.to,
          resume_id: filters.resume_id,
        },
      }),
    get: (id) => request<Application>(`/applications/${id}`),
    create: (input) => request<Application>('/applications', { method: 'POST', body: input }),
    update: (id, patch) => request<Application>(`/applications/${id}`, { method: 'PATCH', body: patch }),
    setStatus: (id, status, note = '') =>
      request<Application>(`/applications/${id}/status`, { method: 'PATCH', body: { status, note } }),
    remove: (id) => request<void>(`/applications/${id}`, { method: 'DELETE' }),
    history: (id) => request<StatusTransition[]>(`/applications/${id}/history`),
    checkDuplicate: (input) =>
      request<DuplicateWarning | null>('/applications/check-duplicate', { method: 'POST', body: input }),
    addNote: (id, body) => request<ApplicationNote>(`/applications/${id}/notes`, { method: 'POST', body: { body } }),
    addContact: (id, contact) =>
      request<ApplicationContact>(`/applications/${id}/contacts`, { method: 'POST', body: contact }),
    removeContact: (id, contactId) =>
      request<void>(`/applications/${id}/contacts/${contactId}`, { method: 'DELETE' }),
    attachSnapshot: (id, input) =>
      request<ApplicationAttachment>(`/applications/${id}/attachments`, { method: 'POST', body: input }),
    reorder: (id, status, boardIndex) =>
      request<Application>(`/applications/${id}/reorder`, {
        method: 'PATCH',
        body: { status, board_index: boardIndex },
      }),
    bulkImport: (rows) =>
      request<{ created: number; skipped: number; duplicates: DuplicateWarning[] }>('/applications/bulk-import', {
        method: 'POST',
        body: { rows },
      }),
  },

  analytics: {
    // One round trip for the whole dashboard; the backend also exposes the
    // individual /analytics/funnel, /sources and /skill-gaps routes.
    dashboard: (filters = {}) =>
      request<DashboardSummary>('/analytics/dashboard', {
        query: { from: filters.from, to: filters.to, source: filters.source, resume_id: filters.resume_id },
      }),
  },

  discovery: {
    listSearches: () => request<SavedSearch[]>('/saved-searches'),
    createSearch: (input) => request<SavedSearch>('/saved-searches', { method: 'POST', body: input }),
    updateSearch: (id, patch) => request<SavedSearch>(`/saved-searches/${id}`, { method: 'PATCH', body: patch }),
    removeSearch: (id) => request<void>(`/saved-searches/${id}`, { method: 'DELETE' }),
    runScan: (id) =>
      request<{ found: DiscoveredJob[]; drafted: number }>(`/saved-searches/${id}/run`, { method: 'POST' }),
    listJobs: (filters = {}) =>
      request<DiscoveredJob[]>('/discovered-jobs', {
        query: {
          status: filters.status,
          saved_search_id: filters.saved_search_id,
          min_score: filters.min_score,
        },
      }),
    setJobStatus: (id, status) =>
      request<DiscoveredJob>(`/discovered-jobs/${id}`, { method: 'PATCH', body: { status } }),
    prepare: (id) =>
      request<{
        discovered: DiscoveredJob
        draft: TailorDraft
        application: Application
        cover_letter: CoverLetter | null
      }>(`/discovered-jobs/${id}/prepare`, { method: 'POST' }),
  },

  interview: {
    listSessions: () => request<InterviewPrepSession[]>('/interview-prep'),
    getSession: (id) => request<InterviewPrepSession>(`/interview-prep/${id}`),
    generate: (input) =>
      request<InterviewPrepSession>(`/interview-prep/generate`, { method: 'POST', body: input }),
    draftStar: (sessionId, questionId) =>
      request<InterviewQuestion>(`/interview-prep/${sessionId}/questions/${questionId}/star`, { method: 'POST' }),
    updateQuestion: (sessionId, question) =>
      request<InterviewQuestion>(`/interview-prep/${sessionId}/questions/${question.id}`, {
        method: 'PATCH',
        body: question,
      }),
    askNext: (sessionId) => request<InterviewPrepSession>(`/interview-prep/${sessionId}/next`, { method: 'POST' }),
    answerMock: (sessionId, input) =>
      request<{ session: InterviewPrepSession; feedback: MockFeedback }>(
        `/interview-prep/${sessionId}/mock-answer`,
        { method: 'POST', body: input },
      ),
    resetMock: (sessionId) =>
      request<InterviewPrepSession>(`/interview-prep/${sessionId}/mock-reset`, { method: 'POST' }),
    listBank: () => request<BankQuestion[]>('/interview-prep/bank'),
    saveToBank: (sessionId, questionId) =>
      request<BankQuestion>(`/interview-prep/${sessionId}/questions/${questionId}/bank`, { method: 'POST' }),
    removeFromBank: (bankId) => request<void>(`/interview-prep/bank/${bankId}`, { method: 'DELETE' }),
  },

  system: {
    usage: () => request<UsageStats>('/usage'),
    jobs: () => request<AsyncJob[]>('/jobs'),
    async reseed() {
      throw new ApiError(400, 'Seeding demo data is only available in mock mode.')
    },
    async reset() {
      throw new ApiError(400, 'Resetting the database is only available in mock mode.')
    },
    exportAll: () => request<string>('/export'),
    async importAll() {
      throw new ApiError(400, 'Importing a database dump is only available in mock mode.')
    },
  },
}
