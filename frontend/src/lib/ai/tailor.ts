/**
 * JD-tailoring engine (spec §3) — the product's differentiator.
 *
 * Rules encoded here, in priority order:
 *  1. Never fabricate (§3.1). Every rewrite is a re-phrasing of text the user wrote;
 *     the output additionally goes through the truth guard.
 *  2. Every change is reviewable — the engine emits a change list with before/after,
 *     rationale and provenance, so the diff view can accept/reject per item.
 *  3. Keyword mirroring stops short of stuffing (§3 "keyword density guardrails").
 */
import type {
  Bullet,
  CoverLetter,
  CoverLetterTone,
  ExperienceItem,
  JobDescription,
  KeywordDensityReport,
  ParsedJD,
  ResumeContent,
  TailorChange,
  TailorDraft,
  TruthFlag,
  User,
} from '@/types'
import { deepClone, nowIso, sortByOrder, stripHtml, uid, wordCount } from '../utils'
import { findSkills, normalize, resumeText, similarity, surfaceForms } from './text'
import { matchResumeToJD } from './match'
import { validateAgainstSource } from './truth'
import { ACTION_VERBS, WEAK_OPENERS } from './vocab'

const STUFFING_PER_1000 = 12

/** Relevance of one bullet to the JD, used for reordering and emphasis. */
function bulletRelevance(text: string, jd: ParsedJD) {
  const skills = findSkills(text)
  let score = 0
  for (const s of skills) {
    if (jd.must_have_skills.includes(s)) score += 3
    else if (jd.nice_to_have_skills.includes(s)) score += 1.5
  }
  score += similarity(jd.responsibilities.join(' '), text) * 4
  score += similarity(jd.role_title, text) * 2
  return score
}

function experienceRelevance(exp: ExperienceItem, jd: ParsedJD) {
  const own = similarity(`${exp.title} ${exp.company}`, `${jd.role_title} ${jd.keywords.join(' ')}`)
  const bullets = exp.bullets.reduce((sum, b) => sum + bulletRelevance(stripHtml(b.html), jd), 0)
  return own * 3 + bullets
}

/**
 * Strengthen a weak bullet without inventing content: drop the weak opener, lead
 * with an action verb, and mirror JD vocabulary only where the bullet already
 * refers to the same thing.
 */
export function rewriteBullet(original: string, jd: ParsedJD | null): { text: string; rationale: string; keywords: string[] } | null {
  const text = stripHtml(original).trim()
  if (!text) return null
  const lower = normalize(text)
  const notes: string[] = []
  const keywords: string[] = []
  let out = text

  const opener = WEAK_OPENERS.find((w) => lower.startsWith(w) || lower.includes(` ${w} `))
  if (opener) {
    const stripped = out.replace(new RegExp(`^${opener}\\s*`, 'i'), '').replace(new RegExp(`\\s*${opener}\\s*`, 'i'), ' ')
    const verb = pickVerb(stripped)
    out = `${capitalise(verb)} ${lowerFirst(stripped.trim())}`
    notes.push(`Replaced the weak opener "${opener}" with the action verb "${verb}"`)
  } else if (!startsWithActionVerb(out)) {
    const verb = pickVerb(out)
    out = `${capitalise(verb)} ${lowerFirst(out)}`
    notes.push(`Led with the action verb "${verb}"`)
  }

  if (jd) {
    // Mirror the JD's own term for something the bullet already mentions.
    for (const skill of findSkills(out)) {
      const jdUsesIt = jd.must_have_skills.includes(skill) || jd.nice_to_have_skills.includes(skill)
      if (!jdUsesIt) continue
      const jdForm = surfaceForms(skill).find((f) => normalize(jd.keywords.join(' ')).includes(normalize(f)))
      const mineForm = surfaceForms(skill).find((f) => normalize(out).includes(normalize(f)))
      if (jdForm && mineForm && jdForm !== mineForm && jdForm.length > 2) {
        out = out.replace(new RegExp(mineForm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), jdForm)
        notes.push(`Mirrored the JD's term "${jdForm}" (you wrote "${mineForm}")`)
      }
      keywords.push(skill)
    }
  }

  if (!/\d/.test(out)) {
    notes.push('No metric in this bullet — consider adding a real number you can defend')
  }

  out = out.replace(/\s+/g, ' ').trim()
  if (out === text) return null
  return { text: out, rationale: notes.join('. '), keywords: [...new Set(keywords)] }
}

function startsWithActionVerb(text: string) {
  const first = normalize(text).split(/\s+/)[0] ?? ''
  return ACTION_VERBS.includes(first) || /ed$/.test(first)
}

function pickVerb(text: string) {
  const l = normalize(text)
  if (/\b(built|build|develop|created|implement)/.test(l)) return 'built'
  if (/\b(reduc|cut|decreas|lower)/.test(l)) return 'reduced'
  if (/\b(increas|grew|growth|improv)/.test(l)) return 'improved'
  if (/\b(migrat|port)/.test(l)) return 'migrated'
  if (/\b(design|architect)/.test(l)) return 'designed'
  if (/\b(lead|led|manag|mentor)/.test(l)) return 'led'
  if (/\b(launch|ship|releas)/.test(l)) return 'shipped'
  if (/\b(test|qa|coverage)/.test(l)) return 'hardened'
  if (/\b(analys|analyz|report|dashboard)/.test(l)) return 'analysed'
  return 'delivered'
}

/** Lower-cases the lead word and guarantees a terminating full stop. */
function sentence(text: string) {
  const body = lowerFirst(text.trim())
  return /[.!?]$/.test(body) ? body : `${body}.`
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function lowerFirst(s: string) {
  if (/^[A-Z]{2,}/.test(s)) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** Rewrite the summary to point at the target role, using only existing claims. */
function rewriteSummary(content: ResumeContent, jd: ParsedJD) {
  const owned = jd.must_have_skills.filter((s) => normalize(resumeText(content)).includes(normalize(s)))
  const top = owned.slice(0, 4)
  const years = content.experience.length > 0 ? estimateYearsLabel(content) : ''
  const base = stripHtml(content.summary).replace(/\s+/g, ' ').trim()
  const focus = top.length ? ` Focused on ${top.join(', ')}.` : ''
  const lead = `${jd.seniority ? capitalise(jd.seniority) + ' ' : ''}${jd.role_title.replace(/\s*[-|(].*$/, '')}`.trim()
  const opener = `${lead} candidate${years ? ` with ${years}` : ''} targeting ${jd.company_name}.`
  const kept = base ? ` ${trimToSentences(base, 2)}` : ''
  return `${opener}${kept}${focus}`.replace(/\s+/g, ' ').trim()
}

function estimateYearsLabel(content: ResumeContent) {
  let months = 0
  for (const exp of content.experience) {
    const start = new Date(`${exp.start_date || '2020-01'}-01`)
    const end = exp.is_current || !exp.end_date ? new Date() : new Date(`${exp.end_date}-01`)
    const diff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    if (Number.isFinite(diff) && diff > 0) months += diff
  }
  const years = Math.floor(months / 12)
  return years >= 1 ? `${years}+ years of experience` : ''
}

function trimToSentences(text: string, n: number) {
  return text.split(/(?<=[.!?])\s+/).slice(0, n).join(' ')
}

export function keywordDensity(content: ResumeContent, jd: ParsedJD): KeywordDensityReport {
  const text = resumeText(content)
  const total = Math.max(1, wordCount(text))
  const hay = normalize(text)
  const overused: KeywordDensityReport['overused'] = []
  for (const keyword of [...jd.must_have_skills, ...jd.nice_to_have_skills]) {
    let count = 0
    for (const form of surfaceForms(keyword)) {
      const re = new RegExp(`(^|[^a-z0-9])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'g')
      count += (hay.match(re) ?? []).length
    }
    const per1000 = (count / total) * 1000
    if (count >= 4 && per1000 > STUFFING_PER_1000) {
      overused.push({ keyword, count, per_1000: Math.round(per1000 * 10) / 10 })
    }
  }
  return {
    overused: overused.sort((a, b) => b.per_1000 - a.per_1000),
    total_words: total,
    ok: overused.length === 0,
  }
}

export interface TailorOptions {
  rewrite_bullets: boolean
  reorder: boolean
  rewrite_summary: boolean
  max_bullet_rewrites: number
}

export const DEFAULT_TAILOR_OPTIONS: TailorOptions = {
  rewrite_bullets: true,
  reorder: true,
  rewrite_summary: true,
  max_bullet_rewrites: 8,
}

/** Produce a reviewable tailored draft. Nothing is applied without user acceptance. */
export function tailorResume(
  base: ResumeContent,
  jd: JobDescription,
  ids: { resume_id: string; base_version_id: string },
  options: TailorOptions = DEFAULT_TAILOR_OPTIONS,
): TailorDraft {
  const parsed = jd.parsed
  const content = deepClone(base)
  const changes: TailorChange[] = []

  if (options.rewrite_summary) {
    const before = content.summary
    const after = rewriteSummary(base, parsed)
    if (after && normalize(after) !== normalize(before)) {
      changes.push({
        id: uid('chg'),
        kind: 'summary_rewrite',
        path: 'Summary',
        before,
        after,
        rationale: `Points the summary at ${parsed.role_title} at ${parsed.company_name} and surfaces the must-have skills you already have.`,
        keywords: parsed.must_have_skills.filter((s) => normalize(after).includes(normalize(s))),
        accepted: true,
      })
      content.summary = after
    }

    const headlineBefore = content.contact.headline
    const headlineAfter = parsed.role_title.replace(/\s*[-|(].*$/, '').trim()
    if (headlineAfter && normalize(headlineBefore) !== normalize(headlineAfter)) {
      changes.push({
        id: uid('chg'),
        kind: 'headline_rewrite',
        path: 'Headline',
        before: headlineBefore,
        after: headlineAfter,
        rationale: 'Matches the exact role title, which some ATS keyword screens look for.',
        keywords: [headlineAfter.toLowerCase()],
        accepted: true,
      })
      content.contact.headline = headlineAfter
    }
  }

  if (options.rewrite_bullets) {
    let budget = options.max_bullet_rewrites
    const ranked = content.experience
      .flatMap((exp) =>
        exp.bullets.map((b) => ({ exp, bullet: b, rel: bulletRelevance(stripHtml(b.html), parsed) })),
      )
      .sort((a, b) => b.rel - a.rel)

    for (const { exp, bullet } of ranked) {
      if (budget <= 0) break
      const original = stripHtml(bullet.html)
      const rewrite = rewriteBullet(original, parsed)
      if (!rewrite) continue
      const index = exp.bullets.findIndex((b) => b.id === bullet.id) + 1
      changes.push({
        id: uid('chg'),
        kind: 'bullet_rewrite',
        path: `Experience > ${exp.company} > bullet ${index}`,
        before: original,
        after: rewrite.text,
        rationale: rewrite.rationale || 'Tightened phrasing to lead with impact.',
        keywords: rewrite.keywords,
        accepted: true,
      })
      bullet.html = rewrite.text
      budget -= 1
    }
  }

  if (options.reorder) {
    for (const exp of content.experience) {
      const before = sortByOrder(exp.bullets)
      const after = [...before].sort(
        (a, b) => bulletRelevance(stripHtml(b.html), parsed) - bulletRelevance(stripHtml(a.html), parsed),
      )
      if (before.map((b) => b.id).join() !== after.map((b) => b.id).join()) {
        changes.push({
          id: uid('chg'),
          kind: 'bullet_reorder',
          path: `Experience > ${exp.company} > bullet order`,
          before: before.map((b, i) => `${i + 1}. ${stripHtml(b.html).slice(0, 60)}`).join('\n'),
          after: after.map((b, i) => `${i + 1}. ${stripHtml(b.html).slice(0, 60)}`).join('\n'),
          rationale: 'Most JD-relevant bullets moved to the top, where recruiters actually read.',
          keywords: [],
          accepted: true,
        })
        exp.bullets = after.map((b, i) => ({ ...b, order_index: i }))
      }
    }

    const expBefore = sortByOrder(content.experience)
    const expAfter = [...expBefore].sort(
      (a, b) => experienceRelevance(b, parsed) - experienceRelevance(a, parsed),
    )
    if (expBefore.map((e) => e.id).join() !== expAfter.map((e) => e.id).join()) {
      changes.push({
        id: uid('chg'),
        kind: 'experience_reorder',
        path: 'Experience order',
        before: expBefore.map((e, i) => `${i + 1}. ${e.title} — ${e.company}`).join('\n'),
        after: expAfter.map((e, i) => `${i + 1}. ${e.title} — ${e.company}`).join('\n'),
        rationale: 'Most relevant role first. Dates are unchanged, so the history still reads honestly.',
        keywords: [],
        accepted: false,
      })
    }

    for (const group of content.skills) {
      const before = [...group.skills]
      const after = [...before].sort((a, b) => jdSkillRank(b, parsed) - jdSkillRank(a, parsed))
      if (before.join() !== after.join()) {
        changes.push({
          id: uid('chg'),
          kind: 'skills_reorder',
          path: `Skills > ${group.category}`,
          before: before.join(', '),
          after: after.join(', '),
          rationale: 'JD-relevant skills listed first; nothing added or removed.',
          keywords: after.filter((s) => jdSkillRank(s, parsed) > 0).slice(0, 5),
          accepted: true,
        })
        group.skills = after
      }
    }
  }

  const applied = applyChanges(base, changes)
  const before = matchResumeToJD(base, parsed, { resume_id: ids.resume_id, job_description_id: jd.id })
  const after = matchResumeToJD(applied, parsed, { resume_id: ids.resume_id, job_description_id: jd.id })

  const truthFlags: TruthFlag[] = changes
    .filter((c) => c.kind === 'summary_rewrite' || c.kind === 'bullet_rewrite' || c.kind === 'headline_rewrite')
    .flatMap((c) =>
      validateAgainstSource(c.after, base, {
        allowlist: [parsed.company_name, parsed.role_title],
        changeId: c.id,
      }),
    )

  return {
    id: uid('draft'),
    resume_id: ids.resume_id,
    job_description_id: jd.id,
    base_version_id: ids.base_version_id,
    content: applied,
    changes,
    truth_flags: truthFlags,
    density: keywordDensity(applied, parsed),
    match_before: before.score,
    match_after: after.score,
    created_at: nowIso(),
  }
}

function jdSkillRank(skill: string, jd: ParsedJD) {
  const s = normalize(skill)
  if (jd.must_have_skills.some((k) => normalize(k) === s || s.includes(normalize(k)))) return 3
  if (jd.nice_to_have_skills.some((k) => normalize(k) === s || s.includes(normalize(k)))) return 1
  return 0
}

/** Re-derive tailored content from the base + the currently accepted changes. */
export function applyChanges(base: ResumeContent, changes: TailorChange[]): ResumeContent {
  const content = deepClone(base)
  for (const change of changes) {
    if (!change.accepted) continue
    switch (change.kind) {
      case 'summary_rewrite':
        content.summary = change.after
        break
      case 'headline_rewrite':
        content.contact.headline = change.after
        break
      case 'bullet_rewrite': {
        const company = change.path.split(' > ')[1]
        const index = Number(change.path.match(/bullet (\d+)$/)?.[1] ?? 0) - 1
        const exp = content.experience.find((e) => e.company === company)
        const bullet = exp?.bullets[index]
        if (bullet && stripHtml(bullet.html) === change.before) bullet.html = change.after
        else if (exp) {
          const byText = exp.bullets.find((b) => stripHtml(b.html) === change.before)
          if (byText) byText.html = change.after
        }
        break
      }
      case 'bullet_reorder': {
        const company = change.path.split(' > ')[1]
        const exp = content.experience.find((e) => e.company === company)
        if (exp) exp.bullets = reorderByPreview(exp.bullets, change.after, (b) => stripHtml(b.html))
        break
      }
      case 'experience_reorder':
        content.experience = reorderByPreview(
          content.experience,
          change.after,
          (e) => `${e.title} — ${e.company}`,
        )
        break
      case 'skills_reorder': {
        const category = change.path.split(' > ')[1]
        const group = content.skills.find((g) => g.category === category)
        if (group) group.skills = change.after.split(',').map((s) => s.trim()).filter(Boolean)
        break
      }
    }
  }
  return content
}

function reorderByPreview<T extends { order_index: number }>(
  items: T[],
  preview: string,
  label: (item: T) => string,
) {
  const order = preview
    .split(/\n/)
    .map((l) => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
  const remaining = [...items]
  const out: T[] = []
  for (const target of order) {
    const idx = remaining.findIndex((item) => label(item).startsWith(target.slice(0, 40)))
    if (idx >= 0) out.push(...remaining.splice(idx, 1))
  }
  return [...out, ...remaining].map((item, i) => ({ ...item, order_index: i }))
}

/* ------------------------------------------------------------ cover letter */

const TONE_CONFIG: Record<CoverLetterTone, { greeting: string; closing: string; paragraphs: number }> = {
  formal: { greeting: 'Dear Hiring Manager,', closing: 'Yours sincerely,', paragraphs: 4 },
  conversational: { greeting: 'Hi there,', closing: 'Thanks for reading,', paragraphs: 3 },
  concise: { greeting: 'Hello,', closing: 'Best,', paragraphs: 2 },
}

export function generateCoverLetter(args: {
  user: User
  content: ResumeContent
  jd: JobDescription
  tone: CoverLetterTone
  whyCompany: string
  resumeId: string | null
}): CoverLetter {
  const { content, jd, tone, whyCompany } = args
  const parsed = jd.parsed
  const cfg = TONE_CONFIG[tone]
  const owned = parsed.must_have_skills.filter((s) =>
    normalize(resumeText(content)).includes(normalize(s)),
  )

  // Proof points are lifted from bullets the user actually wrote — no invention.
  const proof = content.experience
    .flatMap((exp) => exp.bullets.map((b) => ({ exp, text: stripHtml(b.html) })))
    .map((row) => ({ ...row, rel: bulletRelevance(row.text, parsed) }))
    .sort((a, b) => b.rel - a.rel)
    .slice(0, tone === 'concise' ? 2 : 3)

  const role = parsed.role_title.replace(/\s*[-|(].*$/, '').trim()
  const paragraphs: string[] = []

  paragraphs.push(
    tone === 'conversational'
      ? `I'd like to put myself forward for the ${role} role at ${parsed.company_name}. ${
          owned.length ? `I have worked hands-on with ${owned.slice(0, 3).join(', ')}` : 'My background lines up closely with the role'
        }, and the scope of this one is exactly where I do my best work.`
      : `I am writing to apply for the ${role} position at ${parsed.company_name}. ${
          owned.length
            ? `My experience covers ${owned.slice(0, 4).join(', ')}, which map directly to the requirements listed.`
            : 'My background maps closely to the requirements listed.'
        }`,
  )

  if (proof.length) {
    paragraphs.push(
      `In my role as ${proof[0].exp.title} at ${proof[0].exp.company}, ${sentence(proof[0].text)}${
        proof[1] ? ` Earlier, ${sentence(proof[1].text)}` : ''
      }${proof[2] && cfg.paragraphs > 3 ? ` I also ${sentence(proof[2].text)}` : ''}`,
    )
  }

  if (cfg.paragraphs > 2) {
    const respFocus = parsed.responsibilities[0]
    paragraphs.push(
      `${whyCompany.trim() ? `${whyCompany.trim()} ` : ''}${
        respFocus
          ? `The part of the role I am most drawn to is "${trimToSentences(respFocus, 1).replace(/^[-•]\s*/, '')}" — that is the kind of problem I have spent most of my time on.`
          : `${parsed.company_name} is the kind of team where I would expect to contribute quickly.`
      }`,
    )
  }

  paragraphs.push(
    tone === 'concise'
      ? `My resume has the detail. I would welcome a short conversation.`
      : `I would welcome the chance to talk through how I can help ${parsed.company_name}${
          parsed.location && parsed.location !== 'Not specified' ? ` in ${parsed.location}` : ''
        }. Thank you for your time and consideration.`,
  )

  const body = [
    cfg.greeting,
    '',
    ...paragraphs.slice(0, cfg.paragraphs).flatMap((p) => [p, '']),
    cfg.closing,
    content.contact.full_name,
  ].join('\n')

  return {
    id: uid('cl'),
    user_id: args.user.id,
    job_description_id: jd.id,
    resume_id: args.resumeId,
    content: body,
    tone,
    why_company_notes: whyCompany,
    truth_flags: validateAgainstSource(body, content, {
      allowlist: [
        parsed.company_name,
        parsed.role_title,
        parsed.location,
        ...whyCompany.split(/\s+/),
        content.contact.full_name,
      ],
    }),
    created_at: nowIso(),
  }
}

/** Bullet-level suggestions for the editor's rewriter panel (§2). */
export function suggestBulletRewrites(bullets: Bullet[], jd: ParsedJD | null) {
  return bullets
    .map((b) => {
      const rewrite = rewriteBullet(b.html, jd)
      return rewrite ? { bullet_id: b.id, before: stripHtml(b.html), ...rewrite } : null
    })
    .filter((x): x is { bullet_id: string; before: string; text: string; rationale: string; keywords: string[] } => x !== null)
}
