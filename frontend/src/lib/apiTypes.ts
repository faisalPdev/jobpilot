import type {
  Application,
  ApplicationAttachment,
  ApplicationContact,
  ApplicationNote,
  ApplicationStatus,
  AsyncJob,
  AtsReport,
  AuthResponse,
  BankQuestion,
  CoverLetter,
  CoverLetterTone,
  DashboardSummary,
  DiscoveredJob,
  DiscoveredStatus,
  DuplicateWarning,
  ID,
  InterviewPrepSession,
  InterviewQuestion,
  JobDescription,
  MatchReport,
  MockFeedback,
  Resume,
  ResumeContent,
  ResumeScore,
  ResumeVersion,
  ResumeWithVersion,
  SavedSearch,
  StatusTransition,
  TailorChange,
  TailorDraft,
  TemplateId,
  UsageStats,
  User,
} from '@/types'
import type { ParseResult } from './ai/resumeParse'
import type { TailorOptions } from './ai/tailor'

export interface ApplicationFilters {
  status?: ApplicationStatus[]
  source?: string[]
  search?: string
  from?: string
  to?: string
  resume_id?: string
}

export interface AnalyticsFilters {
  from?: string
  to?: string
  source?: string[]
  resume_id?: string
}

/**
 * The single surface every page talks to. Implemented twice — against the mock
 * localStorage database, and against the FastAPI endpoints in spec §9.
 */
export interface Api {
  auth: {
    register(input: { email: string; password: string; full_name: string }): Promise<AuthResponse>
    login(input: { email: string; password: string }): Promise<AuthResponse>
    loginDemo(): Promise<AuthResponse>
    logout(): Promise<void>
    me(): Promise<User | null>
    updateProfile(patch: Partial<User>): Promise<User>
  }

  resumes: {
    list(): Promise<Resume[]>
    get(id: ID): Promise<ResumeWithVersion>
    create(input: { title: string; content?: ResumeContent; template_id?: TemplateId; is_master?: boolean }): Promise<ResumeWithVersion>
    update(id: ID, patch: Partial<Pick<Resume, 'title' | 'template_id' | 'is_master' | 'mode'>>): Promise<Resume>
    remove(id: ID): Promise<void>
    duplicate(id: ID, title: string): Promise<ResumeWithVersion>
    /** Every save creates a diffable version (§2 "version history / snapshots"). */
    saveVersion(id: ID, content: ResumeContent, label?: string): Promise<ResumeVersion>
    versions(id: ID): Promise<ResumeVersion[]>
    restoreVersion(id: ID, versionId: ID): Promise<ResumeVersion>
    score(content: ResumeContent): Promise<ResumeScore>
    ats(content: ResumeContent, templateId: TemplateId): Promise<AtsReport>
    importText(text: string, title: string): Promise<{ parse: ParseResult; resume: ResumeWithVersion }>
    parseOnly(text: string): Promise<ParseResult>
  }

  jds: {
    list(): Promise<JobDescription[]>
    get(id: ID): Promise<JobDescription>
    createFromText(input: { raw_text: string; source_url?: string | null; source?: string }): Promise<JobDescription>
    createFromUrl(url: string): Promise<JobDescription>
    remove(id: ID): Promise<void>
    match(id: ID, resumeId: ID): Promise<MatchReport>
  }

  tailoring: {
    generate(input: { resume_id: ID; job_description_id: ID; options?: TailorOptions }): Promise<TailorDraft>
    get(id: ID): Promise<TailorDraft>
    setChanges(id: ID, changes: TailorChange[]): Promise<TailorDraft>
    /** Persist the accepted draft as a real resume variant linked to the JD. */
    saveVariant(id: ID, title: string): Promise<ResumeWithVersion>
  }

  coverLetters: {
    list(): Promise<CoverLetter[]>
    get(id: ID): Promise<CoverLetter>
    generate(input: {
      job_description_id: ID
      resume_id: ID | null
      tone: CoverLetterTone
      why_company_notes: string
    }): Promise<CoverLetter>
    update(id: ID, patch: { content?: string }): Promise<CoverLetter>
    remove(id: ID): Promise<void>
  }

  applications: {
    list(filters?: ApplicationFilters): Promise<Application[]>
    get(id: ID): Promise<Application>
    create(input: Partial<Application> & { company_name: string; role_title: string }): Promise<Application>
    update(id: ID, patch: Partial<Application>): Promise<Application>
    setStatus(id: ID, status: ApplicationStatus, note?: string): Promise<Application>
    remove(id: ID): Promise<void>
    history(id: ID): Promise<StatusTransition[]>
    checkDuplicate(input: { company_name: string; role_title: string }): Promise<DuplicateWarning | null>
    addNote(id: ID, body: string): Promise<ApplicationNote>
    addContact(id: ID, contact: Omit<ApplicationContact, 'id'>): Promise<ApplicationContact>
    removeContact(id: ID, contactId: ID): Promise<void>
    /** Freezes exactly what was sent (§4 "attachments per application"). */
    attachSnapshot(id: ID, input: { kind: ApplicationAttachment['kind']; format: ApplicationAttachment['format']; filename: string; snapshot: string }): Promise<ApplicationAttachment>
    reorder(id: ID, status: ApplicationStatus, boardIndex: number): Promise<Application>
    bulkImport(rows: Record<string, string>[]): Promise<{ created: number; skipped: number; duplicates: DuplicateWarning[] }>
  }

  analytics: {
    dashboard(filters?: AnalyticsFilters): Promise<DashboardSummary>
  }

  discovery: {
    listSearches(): Promise<SavedSearch[]>
    createSearch(input: Omit<SavedSearch, 'id' | 'user_id' | 'created_at' | 'last_run_at'>): Promise<SavedSearch>
    updateSearch(id: ID, patch: Partial<SavedSearch>): Promise<SavedSearch>
    removeSearch(id: ID): Promise<void>
    runScan(id: ID): Promise<{ found: DiscoveredJob[]; drafted: number }>
    listJobs(filters?: { status?: DiscoveredStatus[]; saved_search_id?: ID; min_score?: number }): Promise<DiscoveredJob[]>
    setJobStatus(id: ID, status: DiscoveredStatus): Promise<DiscoveredJob>
    /** §6.1 one-click prepare: tailor + tracker draft, never a submission. */
    prepare(id: ID): Promise<{ discovered: DiscoveredJob; draft: TailorDraft; application: Application; cover_letter: CoverLetter | null }>
  }

  interview: {
    listSessions(): Promise<InterviewPrepSession[]>
    getSession(id: ID): Promise<InterviewPrepSession>
    generate(input: { job_description_id: ID; application_id?: ID | null; resume_id?: ID | null }): Promise<InterviewPrepSession>
    draftStar(sessionId: ID, questionId: ID): Promise<InterviewQuestion>
    updateQuestion(sessionId: ID, question: InterviewQuestion): Promise<InterviewQuestion>
    askNext(sessionId: ID): Promise<InterviewPrepSession>
    answerMock(sessionId: ID, input: { question_id: ID; answer: string }): Promise<{ session: InterviewPrepSession; feedback: MockFeedback }>
    resetMock(sessionId: ID): Promise<InterviewPrepSession>
    listBank(): Promise<BankQuestion[]>
    saveToBank(sessionId: ID, questionId: ID): Promise<BankQuestion>
    removeFromBank(bankId: ID): Promise<void>
  }

  system: {
    usage(): Promise<UsageStats>
    jobs(): Promise<AsyncJob[]>
    reseed(): Promise<void>
    reset(): Promise<void>
    exportAll(): Promise<string>
    importAll(json: string): Promise<void>
  }
}
