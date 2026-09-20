import type { JDRequirement, ParsedJD, Seniority } from '@/types'
import { uid } from '../utils'
import { bulletLines, findSkills, keyPhrases, normalize, sentences } from './text'
import { SENIORITY_PATTERNS } from './vocab'

const MUST_MARKERS = [
  'required', 'requirement', 'must have', 'must-have', 'you have', 'you will need',
  'we require', 'essential', 'minimum', 'at least', 'proven', 'demonstrated',
  'strong experience', 'expert', 'proficient', 'solid',
]

const NICE_MARKERS = [
  'nice to have', 'nice-to-have', 'bonus', 'plus', 'preferred', 'ideally', 'desirable',
  'a plus', 'advantage', 'familiarity', 'exposure', 'would be great',
]

const RESP_MARKERS = [
  'you will', "you'll", 'responsibilities', 'the role', 'day to day', 'day-to-day',
  'own', 'partner with', 'collaborate', 'build', 'design', 'lead', 'drive', 'ship',
]

/** Boilerplate lines stripped from URL-fetched pages (§3 "strip nav/footer noise"). */
const BOILERPLATE = [
  /^(home|jobs|careers|apply now|share this job|sign in|log in|cookie|privacy policy|terms)/i,
  /^(back to|all jobs|view all|follow us|©|copyright)/i,
  /^(equal opportunity|we are an equal|eeo)/i,
  /^\s*(menu|search|skip to content)\s*$/i,
]

export function stripBoilerplate(raw: string) {
  return raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !BOILERPLATE.some((re) => re.test(l)))
    .join('\n')
}

function detectSeniority(text: string): Seniority | null {
  const head = text.slice(0, 400)
  for (const { level, patterns } of [...SENIORITY_PATTERNS].reverse()) {
    if (patterns.some((re) => re.test(head))) return level as Seniority
  }
  for (const { level, patterns } of [...SENIORITY_PATTERNS].reverse()) {
    if (patterns.some((re) => re.test(text))) return level as Seniority
  }
  return null
}

function detectYears(text: string): number | null {
  const m =
    text.match(/(\d+)\s*\+?\s*(?:-|to)?\s*(\d+)?\s*years?/i) ??
    text.match(/(?:at least|minimum(?: of)?)\s*(\d+)\s*years?/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n < 30 ? n : null
}

function detectRoleTitle(text: string): string {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const labelled = text.match(/(?:job title|position|role)\s*[:\-]\s*(.+)/i)
  if (labelled) return labelled[1].trim().slice(0, 90)
  const candidate = lines.find(
    (l) =>
      l.length < 80 &&
      /(engineer|developer|manager|designer|scientist|analyst|architect|lead|director|specialist|consultant|marketer|writer|researcher)/i.test(
        l,
      ),
  )
  return candidate?.replace(/[|•].*$/, '').trim() ?? lines[0]?.slice(0, 80) ?? 'Untitled role'
}

/**
 * Applicant-tracking hosts. Their domain must never become the employer name —
 * "boards.greenhouse.io/nimbuslabs" is Nimbus Labs, not Greenhouse.
 */
const ATS_HOSTS =
  /greenhouse|lever|ashbyhq|ashby|workable|workday|myworkdayjobs|smartrecruiters|jobvite|breezy|recruitee|teamtailor|bamboohr|remoteok|weworkremotely|adzuna|indeed|linkedin|glassdoor|monster|ziprecruiter|example/i

const CAPS_PHRASE = "[A-Z][A-Za-z0-9&.'-]+(?:\\s+[A-Z][A-Za-z0-9&.'-]+){0,2}"

function detectCompany(text: string, url: string | null): string {
  const labelled = text.match(/(?:company|organisation|organization|employer)\s*[:\-]\s*(.+)/i)
  if (labelled) return labelled[1].trim().slice(0, 60)
  // Most postings put "Company · Location · Team" on the line under the title.
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines.slice(0, 4)) {
    if (!/[·|•]/.test(line)) continue
    const first = line.split(/\s*[·|•]\s*/)[0]?.trim() ?? ''
    if (first && first.length < 45 && new RegExp(`^${CAPS_PHRASE}$`).test(first)) return first
  }

  const about = text.match(new RegExp(`\\babout\\s+(${CAPS_PHRASE})`))
  if (about) return about[1].trim()
  const at = text.match(new RegExp(`\\bat\\s+(${CAPS_PHRASE})`))
  if (at) return at[1].trim()

  if (url) {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.replace(/^(www|jobs|boards|careers|apply)\./, '')
      // On an ATS domain the employer is the first path segment, not the host.
      const source = ATS_HOSTS.test(host)
        ? parsed.pathname.split('/').filter(Boolean)[0] ?? ''
        : host.split('.')[0]
      if (source) return source.charAt(0).toUpperCase() + source.slice(1)
    } catch {
      /* fall through */
    }
  }
  return 'Unknown company'
}

function detectLocation(text: string): { location: string; remote: boolean } {
  const remote = /\b(remote|work from home|distributed team|anywhere)\b/i.test(text)
  const labelled = text.match(/(?:location|based in|office)\s*[:\-]\s*(.+)/i)
  if (labelled) return { location: labelled[1].trim().slice(0, 60), remote }
  const city = text.match(
    /\b(London|Berlin|Bangalore|Bengaluru|Mumbai|Delhi|Remote|New York|San Francisco|Austin|Seattle|Toronto|Amsterdam|Dublin|Singapore|Sydney|Paris|Madrid|Lisbon|Warsaw|Hyderabad|Pune|Chennai|Boston|Chicago|Denver|Los Angeles)\b/i,
  )
  return { location: city ? city[1] : remote ? 'Remote' : 'Not specified', remote }
}

function detectSalary(text: string): string | null {
  const m = text.match(
    /([$£€₹]\s?\d[\d,]*(?:\s?[kK])?(?:\s?(?:-|to|–)\s?[$£€₹]?\s?\d[\d,]*(?:\s?[kK])?)?(?:\s?(?:per|\/)\s?(?:year|annum|month))?)/,
  )
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

function classify(line: string): JDRequirement['kind'] {
  const l = normalize(line)
  if (NICE_MARKERS.some((m) => l.includes(m))) return 'nice_to_have'
  if (MUST_MARKERS.some((m) => l.includes(m))) return 'must_have'
  if (RESP_MARKERS.some((m) => l.startsWith(m) || l.includes(` ${m} `))) return 'responsibility'
  return 'must_have'
}

/**
 * Section-aware pass: a line under a "Nice to have" heading inherits that heading,
 * which is far more reliable than per-line keyword matching alone.
 */
function sectionKindMap(text: string) {
  const map = new Map<string, JDRequirement['kind']>()
  let current: JDRequirement['kind'] | null = null
  for (const raw of text.split(/\n/)) {
    const line = raw.trim()
    if (!line) continue
    const isHeading = line.length < 70 && !/[.!?]$/.test(line)
    if (isHeading) {
      const l = normalize(line)
      if (NICE_MARKERS.some((m) => l.includes(m))) current = 'nice_to_have'
      else if (/responsibilit|what you.ll do|the role|about the job|day to day/i.test(line))
        current = 'responsibility'
      else if (/requirement|qualification|must have|what you.ll need|about you|who you are/i.test(line))
        current = 'must_have'
      else if (/benefit|perk|compensation|about us|why join|equal opportunity|how to apply/i.test(line))
        current = null
      continue
    }
    if (current) map.set(line.replace(/^([-*•●–→o]\s+|\d+[.)]\s+)/, '').trim(), current)
  }
  return map
}

export function parseJobDescription(rawText: string, sourceUrl: string | null = null): ParsedJD {
  const text = stripBoilerplate(rawText)
  const sectionKinds = sectionKindMap(text)
  const lines = bulletLines(text)

  const requirements: JDRequirement[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (line.length < 12 || line.length > 400) continue
    const key = normalize(line).slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    const kind = sectionKinds.get(line) ?? classify(line)
    const skills = findSkills(line)
    requirements.push({
      id: uid('req'),
      text: line,
      kind,
      keyword: skills[0] ?? keyPhrases(line, 1)[0] ?? '',
    })
  }

  const mustSkills = new Set<string>()
  const niceSkills = new Set<string>()
  for (const req of requirements) {
    for (const skill of findSkills(req.text)) {
      if (req.kind === 'nice_to_have') niceSkills.add(skill)
      else mustSkills.add(skill)
    }
  }
  // Skills mentioned anywhere else in the posting still count, at lower confidence.
  for (const skill of findSkills(text)) {
    if (!mustSkills.has(skill) && !niceSkills.has(skill)) niceSkills.add(skill)
  }
  for (const skill of niceSkills) if (mustSkills.has(skill)) niceSkills.delete(skill)

  const { location, remote } = detectLocation(text)
  const responsibilities = requirements
    .filter((r) => r.kind === 'responsibility')
    .map((r) => r.text)
    .slice(0, 12)

  return {
    company_name: detectCompany(text, sourceUrl),
    role_title: detectRoleTitle(text),
    location,
    remote,
    seniority: detectSeniority(text),
    years_experience_min: detectYears(text),
    must_have_skills: [...mustSkills],
    nice_to_have_skills: [...niceSkills],
    responsibilities:
      responsibilities.length > 0
        ? responsibilities
        : sentences(text).filter((s) => /\byou(?:'ll| will)\b/i.test(s)).slice(0, 8),
    requirements,
    salary_text: detectSalary(text),
    keywords: [...new Set([...mustSkills, ...niceSkills, ...keyPhrases(text, 18)])].slice(0, 40),
  }
}
