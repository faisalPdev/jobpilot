import type { AtsReport, ResumeContent, ResumeScore, ScoreSubscore, TemplateId } from '@/types'
import { stripHtml, wordCount } from '../utils'
import { hasNumber, normalize, resumeLines, resumeText } from './text'
import { ACTION_VERBS, FILLER_WORDS, PASSIVE_MARKERS, WEAK_OPENERS } from './vocab'

/**
 * Rubric-based resume score (spec §2). Deliberately returns an itemised checklist
 * rather than one opaque number, so the user can act on it.
 */
export function scoreResume(content: ResumeContent): ResumeScore {
  const bullets = [
    ...content.experience.flatMap((e) => e.bullets),
    ...content.projects.flatMap((p) => p.bullets),
  ].map((b) => stripHtml(b.html))
  const text = resumeText(content)
  const words = wordCount(text)

  const subscores: ScoreSubscore[] = []

  /* impact verbs */
  const strong = bullets.filter((b) => ACTION_VERBS.includes(normalize(b).split(/\s+/)[0] ?? ''))
  const weak = bullets.filter((b) => WEAK_OPENERS.some((w) => normalize(b).startsWith(w)))
  subscores.push({
    key: 'impact_verbs',
    label: 'Impact verbs',
    score: bullets.length ? round((strong.length / bullets.length) * 20) : 0,
    max: 20,
    findings: [
      {
        ok: bullets.length > 0 && strong.length / bullets.length >= 0.6,
        message: `${strong.length} of ${bullets.length} bullets start with a strong action verb`,
      },
      ...weak.slice(0, 4).map((b) => ({
        ok: false,
        message: `Weak opener: "${b.slice(0, 70)}…"`,
        where: 'Experience',
      })),
    ],
  })

  /* quantified achievements */
  const quantified = bullets.filter((b) => hasNumber(b))
  subscores.push({
    key: 'quantified',
    label: 'Quantified achievements',
    score: bullets.length ? round((quantified.length / bullets.length) * 25) : 0,
    max: 25,
    findings: [
      {
        ok: bullets.length > 0 && quantified.length / bullets.length >= 0.5,
        message: `${quantified.length} of ${bullets.length} bullets contain a number, %, or currency figure`,
      },
      ...bullets
        .filter((b) => !hasNumber(b))
        .slice(0, 4)
        .map((b) => ({ ok: false, message: `No metric: "${b.slice(0, 70)}…"` })),
    ],
  })

  /* length */
  const ideal = words >= 350 && words <= 750
  subscores.push({
    key: 'length',
    label: 'Length',
    score: ideal ? 15 : words < 200 || words > 1100 ? 4 : 10,
    max: 15,
    findings: [
      {
        ok: ideal,
        message: `${words} words across ${content.experience.length} roles${
          ideal ? ' — in the one-page-ish sweet spot' : words < 350 ? ' — thin, add detail to recent roles' : ' — long, trim the oldest roles'
        }`,
      },
      {
        ok: bullets.length >= 6 && bullets.length <= 24,
        message: `${bullets.length} bullets total (aim for 3–5 per recent role, fewer as roles get older)`,
      },
    ],
  })

  /* completeness */
  const missing: string[] = []
  if (!content.summary.trim()) missing.push('summary')
  if (!content.experience.length) missing.push('experience')
  if (!content.education.length) missing.push('education')
  if (!content.skills.length) missing.push('skills')
  if (!content.contact.email) missing.push('email')
  if (!content.contact.phone) missing.push('phone')
  if (!content.contact.location) missing.push('location')
  subscores.push({
    key: 'completeness',
    label: 'Completeness',
    score: round(Math.max(0, 20 - missing.length * 4)),
    max: 20,
    findings: missing.length
      ? missing.map((m) => ({ ok: false, message: `Missing ${m}` }))
      : [{ ok: true, message: 'All core sections and contact fields present' }],
  })

  /* passive voice + filler */
  const passive = bullets.filter((b) => PASSIVE_MARKERS.some((m) => ` ${normalize(b)} `.includes(m)))
  const filler = FILLER_WORDS.filter((f) => normalize(text).includes(f))
  subscores.push({
    key: 'voice',
    label: 'Voice and clichés',
    score: round(Math.max(0, 10 - passive.length * 1.5 - filler.length * 2)),
    max: 10,
    findings: [
      { ok: passive.length === 0, message: `${passive.length} bullets read as passive voice` },
      ...(filler.length
        ? [{ ok: false, message: `Clichés found: ${filler.join(', ')}` }]
        : [{ ok: true, message: 'No résumé clichés detected' }]),
      ...passive.slice(0, 3).map((b) => ({ ok: false, message: `Passive: "${b.slice(0, 70)}…"` })),
    ],
  })

  /* keyword breadth */
  const skillCount = content.skills.reduce((n, g) => n + g.skills.length, 0)
  subscores.push({
    key: 'keywords',
    label: 'Keyword breadth',
    score: round(Math.min(10, skillCount * 0.6)),
    max: 10,
    findings: [
      {
        ok: skillCount >= 12,
        message: `${skillCount} skills listed across ${content.skills.length} groups`,
      },
      {
        ok: content.skills.length >= 2,
        message: 'Group skills by category (languages, frameworks, tooling) so a human can scan them',
      },
    ],
  })

  const total = subscores.reduce((sum, s) => sum + s.score, 0)
  return { total: round(total), max: 100, subscores }
}

function round(n: number) {
  return Math.round(n * 10) / 10
}

const DESIGNED_TEMPLATES: TemplateId[] = ['designed-sidebar', 'designed-editorial']

/**
 * ATS compatibility checker (spec §2). Flags the structural things that actually
 * break parsers, plus content-level issues an ATS keyword screen cares about.
 */
export function checkAts(content: ResumeContent, templateId: TemplateId): AtsReport {
  const issues: AtsReport['issues'] = []

  if (DESIGNED_TEMPLATES.includes(templateId)) {
    issues.push({
      severity: 'error',
      code: 'multi_column_template',
      message:
        'This is a designed (multi-column) template. Most ATS parsers read it in the wrong order or drop the sidebar entirely.',
      fix: 'Use it for referrals and direct-to-hiring-manager sends. Switch to an ATS template for portal submissions.',
    })
  }

  const html = [
    ...content.experience.flatMap((e) => e.bullets.map((b) => b.html)),
    ...content.projects.flatMap((p) => p.bullets.map((b) => b.html)),
  ].join(' ')
  const disallowed = html.match(/<(?!\/?(b|strong|i|em)\b)[a-z][^>]*>/gi)
  if (disallowed?.length) {
    issues.push({
      severity: 'error',
      code: 'rich_markup',
      message: `Non-plain markup found in bullets (${[...new Set(disallowed)].slice(0, 4).join(', ')}). Tables, images and nested markup are the most common parse failures.`,
      fix: 'Paste as plain text; the editor keeps bold and italic only.',
    })
  }

  if (!content.contact.email || !content.contact.phone) {
    issues.push({
      severity: 'error',
      code: 'contact_incomplete',
      message: 'Email or phone is missing. Parsers key the whole candidate record off these.',
      fix: 'Fill in both in the Contact section, in the body of the document (never in a header/footer).',
    })
  }

  const standardOrder = ['experience', 'education', 'skills']
  const present = content.section_order.filter((s) => !content.hidden_sections.includes(s))
  for (const key of standardOrder) {
    if (!present.includes(key as never)) {
      issues.push({
        severity: 'warning',
        code: `missing_section_${key}`,
        message: `No "${key}" section is visible. ATS parsers look for standard section headers by name.`,
        fix: `Add or unhide the ${key} section.`,
      })
    }
  }

  for (const exp of content.experience) {
    if (!exp.start_date) {
      issues.push({
        severity: 'warning',
        code: 'missing_dates',
        message: `"${exp.title || 'Untitled role'}" at ${exp.company || 'unknown company'} has no start date.`,
        fix: 'Use YYYY-MM for every role — parsers use dates to compute your years of experience.',
      })
    }
  }

  const longBullets = resumeLines(content).filter((l) => l.bullet_id && wordCount(l.text) > 45)
  if (longBullets.length) {
    issues.push({
      severity: 'info',
      code: 'long_bullets',
      message: `${longBullets.length} bullet(s) run past ~45 words and will wrap awkwardly in a parsed preview.`,
      fix: 'Split them, or cut to one claim plus one number per bullet.',
    })
  }

  if (content.contact.links.some((l) => !/^https?:\/\//i.test(l.url))) {
    issues.push({
      severity: 'info',
      code: 'link_scheme',
      message: 'Some links are missing an https:// prefix, so they may not survive a text extraction.',
      fix: 'Write links in full, e.g. https://github.com/you.',
    })
  }

  return { passed: !issues.some((i) => i.severity === 'error'), issues }
}
