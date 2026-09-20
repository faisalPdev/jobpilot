/**
 * AI interview preparation (spec §7).
 *
 * Questions are derived from the specific JD's requirements rather than a generic
 * bank, and STAR drafts are assembled out of the user's own resume bullets so the
 * §3.1 grounding guarantee holds here too.
 */
import type {
  CompanyBrief,
  InterviewQuestion,
  JobDescription,
  MockFeedback,
  ResumeContent,
  StarAnswer,
} from '@/types'
import { stripHtml, uid, wordCount } from '../utils'
import { extractNumbers, findSkills, hasNumber, normalize, similarity } from './text'
import { ACTION_VERBS } from './vocab'

const BEHAVIOURAL_TEMPLATES = [
  (k: string) => `Tell me about a time you used ${k} to solve a problem that mattered to the business.`,
  (k: string) => `Describe a situation where your ${k} work did not go to plan. What did you change?`,
  (k: string) => `Walk me through the ${k} decision you are most proud of, and the trade-offs you rejected.`,
  () => 'Tell me about a time you disagreed with a senior stakeholder. How did it end?',
  () => 'Describe the most ambiguous project you have owned. How did you decide what to do first?',
  () => 'Tell me about feedback that changed how you work.',
]

const TECHNICAL_TEMPLATES = [
  (k: string) => `How would you design a system that relies heavily on ${k}? Where does it break first?`,
  (k: string) => `What are the failure modes you watch for when working with ${k}?`,
  (k: string) => `How do you test and monitor ${k} in production?`,
  (k: string) => `Compare ${k} with the alternative you would reach for if it were unavailable.`,
]

const DOMAIN_TEMPLATES = [
  (r: string) => `The role mentions "${clip(r)}". How have you done that before?`,
  (r: string) => `If you owned "${clip(r)}" from day one, what would your first 30 days look like?`,
]

const CULTURE_TEMPLATES = [
  (c: string) => `Why ${c}, and why now?`,
  () => 'How do you prefer to receive feedback from a manager?',
  () => 'What kind of team makes you do your best work?',
]

const CLOSING_TEMPLATES = [
  () => 'What questions do you have for us?',
  (c: string) => `What would make you turn down an offer from ${c}?`,
]

function clip(s: string, max = 90) {
  const clean = s.replace(/^[-•*]\s*/, '').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

export function generateQuestions(jd: JobDescription, content: ResumeContent | null): InterviewQuestion[] {
  const parsed = jd.parsed
  const questions: InterviewQuestion[] = []
  const push = (
    question: string,
    kind: InterviewQuestion['kind'],
    from: string,
    difficulty: InterviewQuestion['difficulty'],
  ) => {
    if (questions.some((q) => normalize(q.question) === normalize(question))) return
    questions.push({
      id: uid('q'),
      question,
      kind,
      from_requirement: from,
      difficulty,
      star_draft: null,
      saved_to_bank: false,
    })
  }

  const musts = parsed.must_have_skills.slice(0, 6)
  musts.forEach((skill, i) => {
    const covered = content ? findSkills(JSON.stringify(content)).includes(skill) : false
    push(
      TECHNICAL_TEMPLATES[i % TECHNICAL_TEMPLATES.length](skill),
      'technical',
      `Must-have: ${skill}`,
      covered ? 'medium' : 'hard',
    )
    push(
      BEHAVIOURAL_TEMPLATES[i % 3](skill),
      'behavioral',
      `Must-have: ${skill}`,
      'medium',
    )
  })

  parsed.responsibilities.slice(0, 4).forEach((resp, i) => {
    push(DOMAIN_TEMPLATES[i % DOMAIN_TEMPLATES.length](resp), 'domain', `Responsibility: ${clip(resp, 60)}`, 'medium')
  })

  parsed.nice_to_have_skills.slice(0, 3).forEach((skill) => {
    push(
      `We list ${skill} as a nice-to-have. What is your exposure to it?`,
      'technical',
      `Nice-to-have: ${skill}`,
      'easy',
    )
  })

  BEHAVIOURAL_TEMPLATES.slice(3).forEach((t) => push(t(''), 'behavioral', 'General behavioural', 'medium'))
  CULTURE_TEMPLATES.forEach((t) => push(t(parsed.company_name), 'culture', 'Company fit', 'easy'))
  CLOSING_TEMPLATES.forEach((t) => push(t(parsed.company_name), 'closing', 'Close of interview', 'easy'))

  if (parsed.seniority === 'lead' || parsed.seniority === 'director' || parsed.seniority === 'staff') {
    push(
      'Tell me about someone you grew. What did you do that they could not have done alone?',
      'behavioral',
      `Seniority: ${parsed.seniority}`,
      'hard',
    )
    push(
      'How do you decide what your team should not work on?',
      'domain',
      `Seniority: ${parsed.seniority}`,
      'hard',
    )
  }

  if (parsed.years_experience_min && parsed.years_experience_min >= 5) {
    push(
      `This role asks for ${parsed.years_experience_min}+ years. Which of those years taught you the most, and why?`,
      'behavioral',
      `Experience bar: ${parsed.years_experience_min} years`,
      'medium',
    )
  }

  return questions
}

/** Build a STAR draft strictly out of the user's own bullets. */
export function draftStarAnswer(
  question: InterviewQuestion,
  content: ResumeContent,
): StarAnswer | null {
  const candidates = content.experience.flatMap((exp) =>
    exp.bullets.map((b) => ({
      exp,
      bullet: b,
      text: stripHtml(b.html),
    })),
  )
  if (!candidates.length) return null

  const scored = candidates
    .map((c) => ({
      ...c,
      score:
        similarity(question.question, c.text) * 3 +
        similarity(question.from_requirement, c.text) * 2 +
        (hasNumber(c.text) ? 0.4 : 0),
    }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best || best.score <= 0) return null
  const support = scored[1]
  const numbers = extractNumbers(best.text)

  const verb = ACTION_VERBS.find((v) => normalize(best.text).startsWith(v)) ?? 'delivered'
  const action = best.text.replace(new RegExp(`^${verb}\\s*`, 'i'), '').trim()

  return {
    situation: `At ${best.exp.company}, as ${best.exp.title}${
      best.exp.start_date ? ` (from ${best.exp.start_date})` : ''
    }.`,
    task: question.from_requirement
      ? `I needed to ${action.split(/,| by | using | through /)[0]}, which is what this question is really about (${question.from_requirement.toLowerCase()}).`
      : `I owned ${action.split(/,| by /)[0]}.`,
    action: `I ${verb} ${action}.${support ? ` Alongside that, I ${lowerFirst(support.text)}` : ''}`,
    result: numbers.length
      ? `Outcome: ${numbers.slice(0, 2).join(' and ')} as stated on my resume.`
      : 'Outcome: add the specific number here — the bullet this is drawn from has no metric yet, and interviewers push on exactly that.',
    source_bullet_ids: [best.bullet.id, ...(support ? [support.bullet.id] : [])],
    sources: [
      `Experience > ${best.exp.company}: ${best.text.slice(0, 120)}`,
      ...(support ? [`Experience > ${support.exp.company}: ${support.text.slice(0, 120)}`] : []),
    ],
  }
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** Feedback on a typed mock answer: structure, specificity, length. */
export function scoreMockAnswer(answer: string, question: InterviewQuestion): MockFeedback {
  const words = wordCount(answer)
  const lower = normalize(answer)
  const strengths: string[] = []
  const improvements: string[] = []

  const hasSituation = /(at |when |while |during |in my role|we were|the team)/.test(lower)
  const hasAction = ACTION_VERBS.some((v) => lower.includes(v)) || /\bi (built|led|ran|wrote|owned|shipped)\b/.test(lower)
  const hasResult = /(result|outcome|which (led|meant|reduced|increased)|so that|ended up|impact)/.test(lower) || hasNumber(answer)
  const usedStar = hasSituation && hasAction && hasResult

  let structure = 0
  if (hasSituation) { structure += 3; strengths.push('Sets the scene before diving in') } else improvements.push('Open with one sentence of context: where, when, your role')
  if (hasAction) { structure += 4; strengths.push('Clear ownership — the actions are yours, not the team\'s') } else improvements.push('Say what *you* did, in first person, not what "we" did')
  if (hasResult) { structure += 3; strengths.push('Closes with an outcome') } else improvements.push('End with the result, ideally a number you can defend')

  const numbers = extractNumbers(answer)
  const specificity = Math.min(10, (numbers.length ? 5 : 0) + (findSkills(answer).length ? 3 : 0) + (/\b(19|20)\d{2}\b|\b\d+ (weeks?|months?|people|engineers)\b/.test(lower) ? 2 : 0))
  if (numbers.length) strengths.push(`Concrete figures used (${numbers.slice(0, 2).join(', ')})`)
  else improvements.push('No numbers at all — add scale, duration, or delta')
  if (!findSkills(answer).length && question.kind === 'technical') {
    improvements.push('Name the actual tools and techniques you used')
  }

  let length = 10
  if (words < 60) { length = 4; improvements.push(`Too short at ${words} words — aim for 150–250 for a behavioural answer`) }
  else if (words > 400) { length = 5; improvements.push(`Too long at ${words} words — an interviewer stops listening past ~2 minutes`) }
  else strengths.push(`Good length (${words} words, roughly ${Math.round(words / 130)} min spoken)`)

  if (/\b(um|uh|kind of|sort of|basically|literally|i guess)\b/.test(lower)) {
    improvements.push('Trim the hedging language ("kind of", "basically", "I guess")')
  }

  const overall = Math.round(((structure + specificity + length) / 30) * 100) / 10
  return {
    overall,
    structure,
    specificity,
    length,
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
    used_star: usedStar,
  }
}

/**
 * Company brief (spec §7). Built from what the product legitimately knows: the JD
 * itself. Anything beyond that needs a real source, so the brief says so rather
 * than inventing news.
 */
export function buildCompanyBrief(jd: JobDescription): CompanyBrief {
  const parsed = jd.parsed
  const themes = [
    ...parsed.must_have_skills.slice(0, 4).map((s) => `Depth in ${s} — expect at least one drill-down`),
    ...(parsed.seniority && ['senior', 'staff', 'lead', 'director'].includes(parsed.seniority)
      ? ['Scope and influence beyond your own output']
      : ['Fundamentals and how you learn']),
    ...(parsed.responsibilities.length ? [`Ownership of: ${clip(parsed.responsibilities[0], 70)}`] : []),
  ]

  return {
    company_name: parsed.company_name,
    one_liner: `${parsed.company_name} is hiring a ${parsed.role_title}${
      parsed.location && parsed.location !== 'Not specified' ? ` in ${parsed.location}` : ''
    }${parsed.remote ? ' (remote-friendly)' : ''}.`,
    what_they_do: parsed.responsibilities.length
      ? `Based on the posting, this team ${lowerFirst(clip(parsed.responsibilities[0], 160))}`
      : 'The posting does not describe the team in detail — worth asking directly in the screen.',
    recent_news: [],
    mission_values: parsed.keywords
      .filter((k) => /(customer|impact|ownership|craft|quality|scale|growth|mission|team|remote|autonomy)/.test(k))
      .slice(0, 5)
      .map((k) => `Posting emphasises "${k}"`),
    interview_themes: themes.slice(0, 6),
    questions_to_ask: [
      `What does success in this ${parsed.role_title} role look like at six months?`,
      parsed.must_have_skills[0]
        ? `How is ${parsed.must_have_skills[0]} used day to day here, and what is the biggest pain point with it?`
        : 'What is the biggest technical pain point the team is living with right now?',
      'How are priorities decided, and who gets to say no?',
      'What happened to the last person in this role?',
      parsed.remote ? 'How does the team stay coordinated across time zones?' : 'How much of the week is in-office, in practice?',
    ],
    disclaimer:
      'Built from the job posting only. Recent news, funding and Glassdoor-style themes require a connected source — the backend fills these in from permitted APIs; nothing here is invented.',
  }
}
