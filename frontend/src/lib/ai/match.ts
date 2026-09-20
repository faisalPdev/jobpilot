import type { MatchReport, MatchedKeyword, MissingKeyword, ParsedJD, ResumeContent } from '@/types'
import { clamp, nowIso } from '../utils'
import { findSkills, normalize, resumeLines, similarity, surfaceForms } from './text'

const MUST_WEIGHT = 3
const NICE_WEIGHT = 1

function evidenceFor(keyword: string, content: ResumeContent) {
  const forms = surfaceForms(keyword)
  const hits: string[] = []
  for (const line of resumeLines(content)) {
    const hay = normalize(line.text)
    if (forms.some((f) => hay.includes(normalize(f)))) {
      hits.push(`${line.where}: ${line.text.slice(0, 140)}`)
    }
  }
  return hits.slice(0, 4)
}

function closestEvidence(keyword: string, content: ResumeContent) {
  let best: { text: string; score: number } | null = null
  for (const line of resumeLines(content)) {
    const score = similarity(keyword, line.text)
    if (score > 0.12 && (!best || score > best.score)) {
      best = { text: `${line.where}: ${line.text.slice(0, 120)}`, score }
    }
  }
  return best?.text ?? null
}

function seniorityDistance(jd: ParsedJD, content: ResumeContent) {
  const order = ['intern', 'junior', 'mid', 'senior', 'staff', 'lead', 'director']
  if (!jd.seniority) return 0
  const target = order.indexOf(jd.seniority)
  const titles = content.experience.map((e) => normalize(e.title)).join(' ')
  let mine = -1
  order.forEach((level, i) => {
    if (titles.includes(level)) mine = Math.max(mine, i)
  })
  if (mine === -1) mine = 2
  return Math.abs(target - mine)
}

function estimateYears(content: ResumeContent) {
  let months = 0
  for (const exp of content.experience) {
    const start = new Date(`${exp.start_date || '2020-01'}-01`)
    const end = exp.is_current || !exp.end_date ? new Date() : new Date(`${exp.end_date}-01`)
    const diff =
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    if (Number.isFinite(diff) && diff > 0) months += diff
  }
  return Math.round((months / 12) * 10) / 10
}

/**
 * Explainable match score (spec §3 "match/gap analysis" and design principle 3:
 * every score has visible subscores).
 */
export function matchResumeToJD(
  content: ResumeContent,
  jd: ParsedJD,
  ids: { resume_id: string; job_description_id: string },
): MatchReport {
  const matched: MatchedKeyword[] = []
  const missing: MissingKeyword[] = []

  const evaluate = (keyword: string, kind: 'must_have' | 'nice_to_have') => {
    const weight = kind === 'must_have' ? MUST_WEIGHT : NICE_WEIGHT
    const evidence = evidenceFor(keyword, content)
    if (evidence.length > 0) {
      matched.push({ keyword, evidence, weight })
    } else {
      missing.push({
        keyword,
        weight,
        kind,
        closest_evidence: closestEvidence(keyword, content),
        suggestion:
          kind === 'must_have'
            ? `The JD treats "${keyword}" as a requirement. Add it only if you have genuinely used it.`
            : `"${keyword}" is a nice-to-have. Worth adding if true, otherwise safe to skip.`,
      })
    }
  }

  jd.must_have_skills.forEach((k) => evaluate(k, 'must_have'))
  jd.nice_to_have_skills.forEach((k) => evaluate(k, 'nice_to_have'))

  const mustTotal = jd.must_have_skills.length * MUST_WEIGHT
  const niceTotal = jd.nice_to_have_skills.length * NICE_WEIGHT
  const mustGot = matched
    .filter((m) => m.weight === MUST_WEIGHT)
    .reduce((sum, m) => sum + m.weight, 0)
  const niceGot = matched
    .filter((m) => m.weight === NICE_WEIGHT)
    .reduce((sum, m) => sum + m.weight, 0)

  const mustScore = mustTotal ? (mustGot / mustTotal) * 55 : 44
  const niceScore = niceTotal ? (niceGot / niceTotal) * 15 : 12

  // Responsibility coverage: does the resume speak to what the role actually does?
  const respSkills = new Set(jd.responsibilities.flatMap((r) => findSkills(r)))
  const respMatched = [...respSkills].filter((s) => evidenceFor(s, content).length > 0)
  const respScore = respSkills.size ? (respMatched.length / respSkills.size) * 15 : 12

  const dist = seniorityDistance(jd, content)
  const seniorityScore = clamp(10 - dist * 3.5, 0, 10)

  const years = estimateYears(content)
  const needed = jd.years_experience_min
  const yearsScore =
    needed == null ? 4 : clamp(5 - Math.max(0, needed - years) * 1.6, 0, 5)

  const subscores = [
    { key: 'must_have', label: 'Must-have skills', score: round(mustScore), max: 55 },
    { key: 'nice_to_have', label: 'Nice-to-have skills', score: round(niceScore), max: 15 },
    { key: 'responsibilities', label: 'Responsibility coverage', score: round(respScore), max: 15 },
    { key: 'seniority', label: 'Seniority fit', score: round(seniorityScore), max: 10 },
    { key: 'years', label: 'Years of experience', score: round(yearsScore), max: 5 },
  ]

  return {
    resume_id: ids.resume_id,
    job_description_id: ids.job_description_id,
    score: round(subscores.reduce((sum, s) => sum + s.score, 0)),
    subscores,
    matched: matched.sort((a, b) => b.weight - a.weight),
    missing: missing.sort((a, b) => b.weight - a.weight),
    generated_at: nowIso(),
  }
}

function round(n: number) {
  return Math.round(n * 10) / 10
}

/** Short human reasons used by the discovery feed. */
export function matchReasons(report: MatchReport, jd: ParsedJD) {
  const reasons: string[] = []
  const top = report.matched.slice(0, 3).map((m) => m.keyword)
  if (top.length) reasons.push(`Matches ${top.join(', ')}`)
  const gaps = report.missing.filter((m) => m.kind === 'must_have').slice(0, 2)
  if (gaps.length) reasons.push(`Missing ${gaps.map((g) => g.keyword).join(', ')}`)
  if (jd.remote) reasons.push('Remote-friendly')
  if (jd.seniority) reasons.push(`Seniority: ${jd.seniority}`)
  return reasons
}
