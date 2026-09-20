/**
 * Domain types for JobPilot Phase 1.
 *
 * These mirror the tables in the Phase 1 spec (§8 Data model) so the mock backend and a
 * real FastAPI backend are wire-compatible: snake_case field names are kept deliberately,
 * even though it is not idiomatic TS, so responses can be consumed without a translation
 * layer.
 */

export type ID = string
export type ISODate = string

/* ------------------------------------------------------------------ auth */

export interface User {
  id: ID
  email: string
  full_name: string
  created_at: ISODate
  /** Per-user follow-up nudge threshold, §4 "Follow-up reminders". */
  follow_up_days: number
  /** §5 volume goal, e.g. 10 applications/week. */
  weekly_application_goal: number
  /** §10 - user must opt in before resume text is sent to an LLM provider. */
  llm_data_consent: boolean
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
}

export interface AuthResponse extends AuthTokens {
  user: User
}

/* --------------------------------------------------------------- resumes */

export interface ContactInfo {
  full_name: string
  headline: string
  email: string
  phone: string
  location: string
  links: { label: string; url: string }[]
}

export interface Bullet {
  id: ID
  /** Constrained rich text: only bold/italic tags are allowed, to keep exports ATS-clean. */
  html: string
  order_index: number
}

export interface ExperienceItem {
  id: ID
  company: string
  title: string
  location: string
  start_date: string
  end_date: string | null
  is_current: boolean
  bullets: Bullet[]
  order_index: number
}

export interface EducationItem {
  id: ID
  school: string
  degree: string
  field: string
  start_date: string
  end_date: string
  grade: string
  order_index: number
}

export interface SkillGroup {
  id: ID
  category: string
  skills: string[]
  order_index: number
}

export interface ProjectItem {
  id: ID
  name: string
  role: string
  url: string
  description: string
  bullets: Bullet[]
  order_index: number
}

export interface CertificationItem {
  id: ID
  name: string
  issuer: string
  issued_on: string
  order_index: number
}

export interface LanguageItem {
  id: ID
  language: string
  proficiency: 'Native' | 'Fluent' | 'Professional' | 'Conversational' | 'Basic'
  order_index: number
}

/* ------------------------------------------------ freeform document mode */

/**
 * A resume is authored one of two ways:
 *
 *  - `structured` — the profile-as-data model above. Everything else in the
 *    product (matching, tailoring, scoring, discovery) reads these fields, so
 *    this stays the default and the only mode a master resume may use.
 *  - `freeform` — one rich-text document the user lays out themselves, for the
 *    cases the structured model cannot express (an academic CV, a designed
 *    one-pager, a layout a specific employer asked for).
 *
 * The document lives *inside* the version content, so history, labels, diffing
 * and restore behave identically for both modes. The structured fields are kept
 * alongside it rather than cleared, so switching back is not a data loss.
 */
export type ResumeMode = 'structured' | 'freeform'

export type PageSize = 'a4' | 'letter'

export interface DocumentPage {
  size: PageSize
  /** Margin in millimetres, applied to all four sides. */
  margin_mm: number
  /** One of DOC_FONTS — restricted to faces a PDF/ATS pipeline can embed. */
  font_family: string
  /** Body size in points; headings scale off it. */
  font_size_pt: number
  line_height: number
}

export interface ResumeDocument {
  /** Sanitised block-level HTML — the document body, nothing above <body>. */
  html: string
  page: DocumentPage
}

export type SectionKey =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'

export interface ResumeContent {
  contact: ContactInfo
  summary: string
  experience: ExperienceItem[]
  education: EducationItem[]
  skills: SkillGroup[]
  projects: ProjectItem[]
  certifications: CertificationItem[]
  languages: LanguageItem[]
  /** Section render order + visibility, §2 "reorderable". */
  section_order: SectionKey[]
  hidden_sections: SectionKey[]
  /** Absent means `structured` — every resume written before document mode. */
  mode?: ResumeMode
  /** Present in `freeform` mode. Retained after a switch back, never cleared. */
  document?: ResumeDocument
}

export type TemplateId =
  | 'ats-classic'
  | 'ats-compact'
  | 'ats-modern'
  | 'ats-technical'
  | 'designed-sidebar'
  | 'designed-editorial'

export interface Resume {
  id: ID
  user_id: ID
  title: string
  is_master: boolean
  /**
   * Denormalised copy of `content.mode` so a list response can be filtered and
   * badged without fetching every version body. The version content stays the
   * source of truth; the server rewrites this column on every save/restore.
   */
  mode?: ResumeMode
  template_id: TemplateId
  /** Set when this resume was produced by the tailoring engine (§3). */
  tailored_from_resume_id: ID | null
  job_description_id: ID | null
  current_version_id: ID
  created_at: ISODate
  updated_at: ISODate
}

export interface ResumeVersion {
  id: ID
  resume_id: ID
  version_number: number
  content: ResumeContent
  label: string
  created_at: ISODate
}

export interface ResumeWithVersion {
  resume: Resume
  version: ResumeVersion
}

/* ------------------------------------------------------- scoring / checks */

export interface ScoreSubscore {
  key: string
  label: string
  score: number
  max: number
  /** Actionable checklist rows - §2 "editable checklist, not a black-box number". */
  findings: { ok: boolean; message: string; where?: string }[]
}

export interface ResumeScore {
  total: number
  max: number
  subscores: ScoreSubscore[]
}

export type AtsSeverity = 'error' | 'warning' | 'info'

export interface AtsIssue {
  severity: AtsSeverity
  code: string
  message: string
  fix: string
}

export interface AtsReport {
  passed: boolean
  issues: AtsIssue[]
}

/* ---------------------------------------------------- job descriptions */

export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'lead' | 'director'

export interface JDRequirement {
  id: ID
  text: string
  kind: 'must_have' | 'nice_to_have' | 'responsibility'
  /** Normalised skill/keyword this requirement hinges on. */
  keyword: string
}

export interface ParsedJD {
  company_name: string
  role_title: string
  location: string
  remote: boolean
  seniority: Seniority | null
  years_experience_min: number | null
  must_have_skills: string[]
  nice_to_have_skills: string[]
  responsibilities: string[]
  requirements: JDRequirement[]
  salary_text: string | null
  /** Vocabulary the JD uses, for mirroring terminology in tailoring. */
  keywords: string[]
}

export interface JobDescription {
  id: ID
  user_id: ID
  source_url: string | null
  source: ApplicationSource
  raw_text: string
  parsed: ParsedJD
  company_name: string
  role_title: string
  created_at: ISODate
}

/* --------------------------------------------------------- match / gap */

export interface MatchedKeyword {
  keyword: string
  /** Where in the resume it was found - provenance, so the score is explainable. */
  evidence: string[]
  weight: number
}

export interface MissingKeyword {
  keyword: string
  weight: number
  kind: 'must_have' | 'nice_to_have'
  /** Nearest thing the user does have, if any. */
  closest_evidence: string | null
  suggestion: string
}

export interface MatchReport {
  resume_id: ID
  job_description_id: ID
  score: number
  subscores: { key: string; label: string; score: number; max: number }[]
  matched: MatchedKeyword[]
  missing: MissingKeyword[]
  generated_at: ISODate
}

/* ------------------------------------------------------------ tailoring */

export type ChangeKind =
  | 'summary_rewrite'
  | 'bullet_rewrite'
  | 'bullet_reorder'
  | 'experience_reorder'
  | 'skills_reorder'
  | 'headline_rewrite'

export interface TailorChange {
  id: ID
  kind: ChangeKind
  /** Human-readable location, e.g. "Experience > Acme > bullet 2". */
  path: string
  before: string
  after: string
  rationale: string
  /** Keywords from the JD this change pulls in. */
  keywords: string[]
  accepted: boolean
}

export interface TruthFlag {
  entity: string
  kind: 'company' | 'tool' | 'certification' | 'title' | 'number'
  message: string
  change_id: ID | null
}

export interface KeywordDensityReport {
  /** Repeats per 1000 words, flagged above the stuffing threshold. */
  overused: { keyword: string; count: number; per_1000: number }[]
  total_words: number
  ok: boolean
}

export interface TailorDraft {
  id: ID
  resume_id: ID
  job_description_id: ID
  base_version_id: ID
  content: ResumeContent
  changes: TailorChange[]
  truth_flags: TruthFlag[]
  density: KeywordDensityReport
  match_before: number
  match_after: number
  created_at: ISODate
}

export type CoverLetterTone = 'formal' | 'conversational' | 'concise'

export interface CoverLetter {
  id: ID
  user_id: ID
  job_description_id: ID
  resume_id: ID | null
  content: string
  tone: CoverLetterTone
  why_company_notes: string
  truth_flags: TruthFlag[]
  created_at: ISODate
}

/* -------------------------------------------------------------- tracker */

export type ApplicationStatus =
  | 'Saved'
  | 'Applied'
  | 'Screening'
  | 'Interview'
  | 'Offer'
  | 'Rejected'
  | 'Withdrawn'

export type ApplicationSource =
  | 'LinkedIn'
  | 'Indeed'
  | 'Referral'
  | 'Company site'
  | 'Greenhouse'
  | 'Lever'
  | 'Ashby'
  | 'RemoteOK'
  | 'Adzuna'
  | 'Other'

export interface ApplicationContact {
  id: ID
  name: string
  role: string
  email: string
  linkedin: string
  kind: 'recruiter' | 'hiring_manager' | 'interviewer' | 'referral' | 'other'
}

export interface ApplicationNote {
  id: ID
  body: string
  created_at: ISODate
}

export interface ApplicationAttachment {
  id: ID
  /** §4 - the exact file that was submitted, not "the current version". */
  filename: string
  kind: 'resume' | 'cover_letter' | 'other'
  format: 'pdf' | 'docx' | 'txt'
  /** Frozen snapshot of what was sent. Object-storage key in the real backend. */
  storage_key: string
  snapshot: string
  size_bytes: number
  created_at: ISODate
}

export interface StatusTransition {
  id: ID
  application_id: ID
  from_status: ApplicationStatus | null
  to_status: ApplicationStatus
  changed_at: ISODate
  note: string
}

export interface Application {
  id: ID
  user_id: ID
  job_description_id: ID | null
  company_name: string
  role_title: string
  location: string
  source: ApplicationSource
  status: ApplicationStatus
  resume_id: ID | null
  resume_version_id: ID | null
  cover_letter_id: ID | null
  match_score: number | null
  salary_text: string
  applied_at: ISODate | null
  next_follow_up_at: ISODate | null
  board_index: number
  contacts: ApplicationContact[]
  notes: ApplicationNote[]
  attachments: ApplicationAttachment[]
  /** Immutable copy of the JD, since job URLs go dead (§4). */
  jd_snapshot: string
  created_at: ISODate
  updated_at: ISODate
}

export interface DuplicateWarning {
  application_id: ID
  company_name: string
  role_title: string
  status: ApplicationStatus
  applied_at: ISODate | null
  reason: 'exact' | 'same_company'
}

/* ------------------------------------------------------------ analytics */

export interface FunnelStage {
  status: ApplicationStatus
  count: number
  /** Conversion from the previous stage, 0..1. */
  conversion: number
}

export interface FunnelReport {
  stages: FunnelStage[]
  total: number
  offer_rate: number
  interview_rate: number
  response_rate: number
  /** §5 - the differentiated cut: conversion by resume used. */
  by_resume: {
    resume_id: ID
    title: string
    is_master: boolean
    applications: number
    interviews: number
    offers: number
    interview_rate: number
    lift_vs_master: number | null
  }[]
}

export interface VolumePoint {
  period: string
  applications: number
  goal: number
}

export interface VolumeReport {
  weekly: VolumePoint[]
  monthly: VolumePoint[]
  current_week: number
  goal: number
  current_streak_weeks: number
  best_streak_weeks: number
}

export interface ResponseTimeReport {
  avg_days_to_first_response: number | null
  no_response_rate: number
  time_in_stage: { status: ApplicationStatus; avg_days: number; samples: number }[]
}

export interface SourceReport {
  rows: {
    source: ApplicationSource
    applications: number
    responses: number
    interviews: number
    offers: number
    response_rate: number
    interview_rate: number
  }[]
}

export interface SkillGapReport {
  rows: {
    keyword: string
    occurrences: number
    must_have_occurrences: number
    example_roles: string[]
  }[]
}

export interface DashboardSummary {
  funnel: FunnelReport
  volume: VolumeReport
  response: ResponseTimeReport
  sources: SourceReport
  skill_gaps: SkillGapReport
  follow_ups_due: Application[]
  generated_at: ISODate
}

/* ------------------------------------------------------------ discovery */

export type CompanySize = 'startup' | 'scaleup' | 'midmarket' | 'enterprise'

export interface SavedSearch {
  id: ID
  user_id: ID
  name: string
  keywords: string[]
  seniority: Seniority[]
  locations: string[]
  remote_only: boolean
  salary_floor: number | null
  industries_include: string[]
  industries_exclude: string[]
  company_size: CompanySize[]
  /** Only sources that expose an official/public API or feed - §6.1. */
  channels: ApplicationSource[]
  fit_threshold: number
  auto_draft: boolean
  digest: 'off' | 'daily' | 'weekly'
  is_active: boolean
  last_run_at: ISODate | null
  created_at: ISODate
}

export type DiscoveredStatus = 'new' | 'reviewed' | 'dismissed' | 'drafted' | 'prepared'

export interface DiscoveredJob {
  id: ID
  saved_search_id: ID
  job_description_id: ID
  company_name: string
  role_title: string
  location: string
  remote: boolean
  salary_text: string | null
  channel: ApplicationSource
  url: string
  match_score: number
  match_reasons: string[]
  status: DiscoveredStatus
  draft_resume_id: ID | null
  draft_cover_letter_id: ID | null
  application_id: ID | null
  discovered_at: ISODate
}

/* ------------------------------------------------------- interview prep */

export type QuestionKind = 'behavioral' | 'technical' | 'domain' | 'culture' | 'closing'

export interface StarAnswer {
  situation: string
  task: string
  action: string
  result: string
  /** Resume bullet ids the draft is grounded in - same guardrail spirit as §3.1. */
  source_bullet_ids: ID[]
  sources: string[]
}

export interface InterviewQuestion {
  id: ID
  question: string
  kind: QuestionKind
  /** Which JD requirement prompted this question. */
  from_requirement: string
  difficulty: 'easy' | 'medium' | 'hard'
  star_draft: StarAnswer | null
  saved_to_bank: boolean
}

export interface CompanyBrief {
  company_name: string
  one_liner: string
  what_they_do: string
  recent_news: { title: string; date: string; source: string }[]
  mission_values: string[]
  interview_themes: string[]
  questions_to_ask: string[]
  disclaimer: string
}

export interface MockFeedback {
  overall: number
  structure: number
  specificity: number
  length: number
  strengths: string[]
  improvements: string[]
  used_star: boolean
}

export interface MockTurn {
  id: ID
  role: 'interviewer' | 'candidate' | 'feedback'
  question_id: ID | null
  body: string
  feedback: MockFeedback | null
  created_at: ISODate
}

export interface InterviewPrepSession {
  id: ID
  user_id: ID
  application_id: ID | null
  job_description_id: ID
  resume_id: ID | null
  company_brief: CompanyBrief | null
  questions: InterviewQuestion[]
  transcript: MockTurn[]
  created_at: ISODate
  updated_at: ISODate
}

export interface BankQuestion extends InterviewQuestion {
  bank_id: ID
  /** The session it was saved from, so the bank can be scoped per user. */
  session_id: ID
  role_title: string
  company_name: string
  saved_at: ISODate
}

/* ----------------------------------------------------------- job queue */

export type JobKind =
  | 'parse_resume'
  | 'parse_jd'
  | 'match'
  | 'tailor'
  | 'cover_letter'
  | 'discovery_scan'
  | 'interview_questions'
  | 'company_brief'

export interface AsyncJob {
  id: ID
  kind: JobKind
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  progress: number
  message: string
  result_id: ID | null
  error: string | null
  created_at: ISODate
  finished_at: ISODate | null
}

/** §10 - LLM cost is a first-class concern, so the UI surfaces usage. */
export interface UsageStats {
  period_start: ISODate
  generations_used: number
  generations_cap: number
  cached_hits: number
  est_cost_usd: number
  by_kind: { kind: JobKind; count: number }[]
}
