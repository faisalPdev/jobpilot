import { ALL_SKILLS, SKILL_SYNONYMS, STOPWORDS } from './vocab'
import { stripHtml } from '../utils'
import type { ResumeContent } from '@/types'

export function normalize(text: string) {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
}

export function tokens(text: string) {
  return normalize(text)
    .split(/[^a-z0-9+#./-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
}

export function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Lines that look like list items in a pasted JD or resume. */
export function bulletLines(text: string) {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => /^([-*•●–→o]\s+|\d+[.)]\s+)/.test(l) || l.length > 40)
    .map((l) => l.replace(/^([-*•●–→o]\s+|\d+[.)]\s+)/, '').trim())
}

/**
 * Find canonical skills present in a blob of text. Matching is done on surface
 * forms so "k8s" and "kubernetes" collapse to one keyword.
 */
export function findSkills(text: string): string[] {
  const hay = ` ${normalize(text).replace(/[^a-z0-9+#./ -]/g, ' ').replace(/\s+/g, ' ')} `
  const found: string[] = []
  for (const skill of ALL_SKILLS) {
    for (const form of SKILL_SYNONYMS[skill]) {
      const needle = form.includes(' ') ? form : `${form}`
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(needle)}([^a-z0-9]|$)`, 'i')
      if (re.test(hay)) {
        found.push(skill)
        break
      }
    }
  }
  return found
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Surface forms for a canonical skill, longest first (for highlighting). */
export function surfaceForms(skill: string) {
  return [...(SKILL_SYNONYMS[skill] ?? [skill])].sort((a, b) => b.length - a.length)
}

/** Frequency-ranked non-skill keywords, used to enrich JD parsing. */
export function keyPhrases(text: string, limit = 24): string[] {
  const counts = new Map<string, number>()
  const toks = tokens(text)
  for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1)
  for (let i = 0; i < toks.length - 1; i += 1) {
    const bigram = `${toks[i]} ${toks[i + 1]}`
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1.4)
  }
  return [...counts.entries()]
    .filter(([phrase, count]) => count > 1 && phrase.length > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase]) => phrase)
}

/** Flatten a resume to searchable text, keeping provenance per line. */
export interface ResumeLine {
  text: string
  where: string
  bullet_id?: string
}

export function resumeLines(content: ResumeContent): ResumeLine[] {
  const lines: ResumeLine[] = []
  if (content.contact.headline) {
    lines.push({ text: content.contact.headline, where: 'Headline' })
  }
  if (content.summary) lines.push({ text: content.summary, where: 'Summary' })
  for (const exp of content.experience) {
    lines.push({ text: `${exp.title} at ${exp.company}`, where: `Experience > ${exp.company}` })
    for (const b of exp.bullets) {
      lines.push({
        text: stripHtml(b.html),
        where: `Experience > ${exp.company}`,
        bullet_id: b.id,
      })
    }
  }
  for (const proj of content.projects) {
    lines.push({ text: `${proj.name} ${proj.description}`, where: `Projects > ${proj.name}` })
    for (const b of proj.bullets) {
      lines.push({ text: stripHtml(b.html), where: `Projects > ${proj.name}`, bullet_id: b.id })
    }
  }
  for (const group of content.skills) {
    lines.push({ text: group.skills.join(', '), where: `Skills > ${group.category}` })
  }
  for (const edu of content.education) {
    lines.push({
      text: `${edu.degree} ${edu.field} ${edu.school}`,
      where: `Education > ${edu.school}`,
    })
  }
  for (const cert of content.certifications) {
    lines.push({ text: `${cert.name} ${cert.issuer}`, where: 'Certifications' })
  }
  return lines.filter((l) => l.text.trim().length > 0)
}

export function resumeText(content: ResumeContent) {
  return resumeLines(content)
    .map((l) => l.text)
    .join('\n')
}

/** Naive-but-useful token overlap, used for "closest evidence" hints. */
export function similarity(a: string, b: string) {
  const A = new Set(tokens(a))
  const B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared += 1
  return shared / Math.sqrt(A.size * B.size)
}

export function hasNumber(text: string) {
  return /\d+\s*(%|percent|x\b|k\b|m\b|bn\b)|\b\d{2,}\b|[$£€]\s?\d/.test(text)
}

export function extractNumbers(text: string) {
  return text.match(/[$£€]?\d[\d,.]*\s*(%|percent|x\b|k\b|m\b|bn\b|hours?|days?|weeks?)?/gi) ?? []
}

/** First sentence, trimmed to a headline length. */
export function firstClause(text: string, max = 120) {
  const s = sentences(text)[0] ?? text
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s
}
