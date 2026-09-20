/**
 * The truthfulness contract (spec §3.1, non-negotiable).
 *
 * Generation is constrained by prompt, but prompts are not a guarantee — so every
 * generated artefact also goes through this post-generation validator. Any named
 * entity (company, tool, certification, title) or hard number in the output that
 * does not appear in the source resume is flagged for the user, never silently kept.
 */
import type { ResumeContent, TruthFlag } from '@/types'
import { ALL_SKILLS, SKILL_SYNONYMS } from './vocab'
import { extractNumbers, normalize, resumeText } from './text'

/**
 * Ordinary English words that appear capitalised mid-text (sentence starters,
 * connectors, salutations). Without this list the validator cries wolf on
 * "Earlier, I …", and a guard that always fires is a guard nobody reads.
 */
const KNOWN_NON_ENTITIES = new Set(
  `i i'd i've i'm i'll we we'd we've the a an and or but if then so my our your role team teams
  company companies
  hiring manager candidate dear sincerely regards thank thanks best kind yours hello hi
  earlier later alongside additionally moreover however therefore meanwhile outcome result
  results focused focusing this that these those there here it its when while after before
  during since because most more much many few first second third finally overall together
  across beyond within without through between under over about above below again
  january february march april may june july august september october november december
  monday tuesday wednesday thursday friday saturday sunday`
    .split(/\s+/)
    .filter(Boolean),
)

function capitalisedPhrases(text: string) {
  const out = new Set<string>()
  const re = /\b([A-Z][A-Za-z0-9&.+#'-]{1,}(?:\s+[A-Z][A-Za-z0-9&.+#'-]{1,}){0,2})\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const phrase = m[1].trim()
    if (phrase.length < 3) continue
    if (KNOWN_NON_ENTITIES.has(normalize(phrase))) continue
    // Skip sentence-initial single words, which are usually not entities.
    const before = text.slice(0, m.index).replace(/\s+$/, '')
    if (!phrase.includes(' ') && (before === '' || /[.!?:;\n]$/.test(before))) continue
    out.add(phrase)
  }
  return [...out]
}

function toolMentions(text: string) {
  const hay = normalize(text)
  return ALL_SKILLS.filter((skill) =>
    SKILL_SYNONYMS[skill].some((form) => {
      const re = new RegExp(`(^|[^a-z0-9])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
      return re.test(hay)
    }),
  )
}

export interface TruthGuardOptions {
  /** Entities that are legitimately new because the user typed them (JD company, notes). */
  allowlist?: string[]
  changeId?: string | null
}

/**
 * Validate generated text against the source resume.
 *
 * @param generated the model output
 * @param source the resume the output must be grounded in
 */
export function validateAgainstSource(
  generated: string,
  source: ResumeContent,
  options: TruthGuardOptions = {},
): TruthFlag[] {
  const sourceBlob = normalize(
    `${resumeText(source)} ${source.contact.full_name} ${source.contact.headline} ${source.summary}`,
  )
  const allow = new Set((options.allowlist ?? []).map(normalize))
  const flags: TruthFlag[] = []
  const changeId = options.changeId ?? null

  const sourceTools = new Set(toolMentions(sourceBlob))
  for (const tool of toolMentions(generated)) {
    if (sourceTools.has(tool) || allow.has(normalize(tool))) continue
    flags.push({
      entity: tool,
      kind: 'tool',
      message: `"${tool}" appears in the generated text but not in your resume. Remove it, or add it to your profile if you have genuinely used it.`,
      change_id: changeId,
    })
  }

  for (const phrase of capitalisedPhrases(generated)) {
    const key = normalize(phrase)
    if (sourceBlob.includes(key) || allow.has(key)) continue
    if (sourceTools.has(key)) continue
    const kind: TruthFlag['kind'] = /certif|certified|aws|azure|pmp|cfa|scrum master/i.test(phrase)
      ? 'certification'
      : /\b(inc|ltd|llc|gmbh|labs|technologies|systems|group|corp)\b/i.test(phrase)
        ? 'company'
        : 'title'
    flags.push({
      entity: phrase,
      kind,
      message: `Unverified ${kind}: "${phrase}" is not present in your source resume.`,
      change_id: changeId,
    })
  }

  const sourceNumbers = new Set(extractNumbers(sourceBlob).map((n) => n.replace(/\s+/g, '')))
  for (const num of extractNumbers(generated)) {
    const key = num.replace(/\s+/g, '')
    if (key.length < 2) continue
    if (sourceNumbers.has(key) || allow.has(normalize(num))) continue
    flags.push({
      entity: num.trim(),
      kind: 'number',
      message: `Metric "${num.trim()}" is not in your source resume. Confirm it is accurate before sending.`,
      change_id: changeId,
    })
  }

  return dedupeFlags(flags)
}

export function dedupeFlags(flags: TruthFlag[]) {
  const seen = new Set<string>()
  return flags.filter((f) => {
    const key = `${f.kind}:${normalize(f.entity)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
