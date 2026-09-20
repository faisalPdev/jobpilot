/**
 * Engine smoke test — runs the pure pipeline end to end with no browser:
 * parse a real posting, match it against the seeded master resume, tailor,
 * validate the output for fabrication, draft a cover letter, then generate
 * interview questions and a STAR answer.
 *
 *   npm run smoke
 *
 * It asserts the invariants that matter (the §3.1 truthfulness contract above
 * all) and prints a summary, so a regression in the heuristics is obvious.
 */
import { parseJobDescription } from '../src/lib/ai/jd'
import { matchResumeToJD } from '../src/lib/ai/match'
import { generateCoverLetter, tailorResume } from '../src/lib/ai/tailor'
import { validateAgainstSource } from '../src/lib/ai/truth'
import { checkAts, scoreResume } from '../src/lib/ai/score'
import { parseResumeText } from '../src/lib/ai/resumeParse'
import { draftStarAnswer, generateQuestions, scoreMockAnswer } from '../src/lib/ai/interview'
import { renderResumeText, renderResumeDocument } from '../src/lib/export/render'
import { defaultDocumentPage, renderDocumentDocument } from '../src/lib/doc/render'
import {
  countInlineSpacing,
  documentToText,
  resetDocumentSpacing,
  sanitizeDocumentHtml,
} from '../src/lib/doc/sanitize'
import { analyzeDocument } from '../src/lib/doc/checks'
import { documentToStructured, structuredToDocumentHtml, textToDocumentHtml } from '../src/lib/doc/convert'
import { sanitizeInlineHtml } from '../src/lib/utils'
import { JD_SAMPLES } from '../src/lib/mock/jdSamples'
import { buildSeedDb } from '../src/lib/mock/seed'
import type { JobDescription, ResumeContent } from '../src/types'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL'
  if (!condition) failures += 1
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`)
}

function section(title: string) {
  console.log(`\n${title}`)
}

// The seed builder writes through the localStorage-backed db module; give it a stub.
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const db = buildSeedDb()
const master = db.resumes.find((r) => r.is_master)!
const content: ResumeContent = db.resume_versions.find((v) => v.id === master.current_version_id)!.content

section('Seed data')
check('master resume exists', Boolean(master), master.title)
check('roles seeded', content.experience.length >= 3, `${content.experience.length} roles`)
check('applications seeded', db.applications.length >= 20, `${db.applications.length} applications`)
check('status history seeded', db.status_history.length >= 25, `${db.status_history.length} transitions`)
check('discovered jobs seeded', db.discovered_jobs.length >= 5, `${db.discovered_jobs.length} matches`)

section('Resume scoring and ATS check')
const score = scoreResume(content)
check('score is in range', score.total > 0 && score.total <= 100, `${score.total}/100`)
check('subscores are itemised', score.subscores.length === 6, `${score.subscores.length} subscores`)
check(
  'findings are actionable',
  score.subscores.every((s) => s.findings.length > 0),
)
const atsClassic = checkAts(content, 'ats-classic')
const atsDesigned = checkAts(content, 'designed-sidebar')
check('ATS template passes', atsClassic.passed)
check('designed template is flagged', !atsDesigned.passed, atsDesigned.issues[0]?.code)

section('JD parsing')
const sample = JD_SAMPLES[0]
const parsed = parseJobDescription(sample.text, sample.url)
check('company detected', parsed.company_name.length > 1, parsed.company_name)
check('role detected', /engineer/i.test(parsed.role_title), parsed.role_title)
check('seniority detected', parsed.seniority === 'senior', String(parsed.seniority))
check('years bar detected', parsed.years_experience_min === 5, String(parsed.years_experience_min))
check('must-haves found', parsed.must_have_skills.length >= 5, parsed.must_have_skills.join(', '))
check(
  'nice-to-haves separated',
  parsed.nice_to_have_skills.includes('terraform') || parsed.nice_to_have_skills.includes('kafka'),
  parsed.nice_to_have_skills.join(', '),
)
check('requirements atomised', parsed.requirements.length >= 10, `${parsed.requirements.length} atoms`)
check('salary detected', Boolean(parsed.salary_text), String(parsed.salary_text))
check('boilerplate stripped', !parsed.requirements.some((r) => /equal opportunity/i.test(r.text)))

const jd: JobDescription = {
  id: 'jd_smoke',
  user_id: master.user_id,
  source_url: sample.url,
  source: 'Greenhouse',
  raw_text: sample.text,
  parsed,
  company_name: parsed.company_name,
  role_title: parsed.role_title,
  created_at: new Date().toISOString(),
}

section('Match and gap analysis')
const match = matchResumeToJD(content, parsed, { resume_id: master.id, job_description_id: jd.id })
check('score in range', match.score > 0 && match.score <= 100, String(match.score))
check('subscores sum to score', Math.abs(match.subscores.reduce((n, s) => n + s.score, 0) - match.score) < 0.5)
check('matched keywords have evidence', match.matched.every((m) => m.evidence.length > 0), `${match.matched.length} matched`)
check('python is matched', match.matched.some((m) => m.keyword === 'python'))
check('gaps are listed', match.missing.length > 0, match.missing.slice(0, 4).map((m) => m.keyword).join(', '))
check(
  'gap suggestions stay honest',
  match.missing.every((m) => /if true|only if|worth adding/i.test(m.suggestion)),
)

section('Tailoring engine')
const draft = tailorResume(content, jd, { resume_id: master.id, base_version_id: master.current_version_id })
check('changes proposed', draft.changes.length > 0, `${draft.changes.length} changes`)
check('every change has a rationale', draft.changes.every((c) => c.rationale.length > 0))
check('match improves or holds', draft.match_after >= draft.match_before, `${draft.match_before} → ${draft.match_after}`)
check('weak opener rewritten', draft.changes.some((c) => /responsible for/i.test(c.before)))
check('dates untouched', JSON.stringify(draft.content.experience.map((e) => [e.start_date, e.end_date])) ===
  JSON.stringify(content.experience.map((e) => [e.start_date, e.end_date])))
check('no employer invented', draft.content.experience.every((e) => content.experience.some((o) => o.company === e.company)))
check('bullet count preserved', draft.content.experience.reduce((n, e) => n + e.bullets.length, 0) ===
  content.experience.reduce((n, e) => n + e.bullets.length, 0))
check('keyword density guardrail ran', typeof draft.density.ok === 'boolean', `${draft.density.total_words} words`)

section('Truthfulness contract (§3.1)')
const fabricated = 'Led the Kubernetes migration at Globex Industries after earning my PMP certification in 2021.'
const flags = validateAgainstSource(fabricated, content)
check('fabricated tool flagged', flags.some((f) => f.entity === 'kubernetes'), flags.map((f) => f.entity).join(', '))
check('fabricated employer flagged', flags.some((f) => /globex/i.test(f.entity)))
check('fabricated certification flagged', flags.some((f) => /pmp/i.test(f.entity)))
const honest = 'Rebuilt the payment reconciliation service in FastAPI at Ledgerline.'
check('true statement passes clean', validateAgainstSource(honest, content).length === 0,
  validateAgainstSource(honest, content).map((f) => f.entity).join(', '))

section('Cover letter')
const letter = generateCoverLetter({
  user: { ...db.users[0], llm_data_consent: true },
  content,
  jd,
  tone: 'conversational',
  whyCompany: 'I have followed their climate-risk work for a while.',
  resumeId: master.id,
})
check('letter generated', letter.content.length > 400, `${letter.content.split(/\s+/).length} words`)
check('names the company', letter.content.includes(parsed.company_name))
check('quotes a real employer', /Ledgerline|Fernwood|Tessellate/.test(letter.content))
check('passes its own truth check', letter.truth_flags.length === 0, letter.truth_flags.map((f) => f.entity).join(', '))

section('Interview prep')
const questions = generateQuestions(jd, content)
check('questions generated', questions.length >= 12, `${questions.length} questions`)
check('all four kinds present', new Set(questions.map((q) => q.kind)).size >= 4,
  [...new Set(questions.map((q) => q.kind))].join(', '))
check('each traces to a requirement', questions.every((q) => q.from_requirement.length > 0))
const behavioural = questions.find((q) => q.kind === 'behavioral')!
const star = draftStarAnswer(behavioural, content)
check('STAR draft produced', Boolean(star))
check('STAR is grounded in real bullets', Boolean(star && star.source_bullet_ids.length > 0), star?.sources[0]?.slice(0, 60))
const weakFeedback = scoreMockAnswer('We did some work on it and it went fine.', behavioural)
const strongFeedback = scoreMockAnswer(
  'At Ledgerline I owned the reconciliation service. The nightly batch took 4 hours and blocked finance, so I rebuilt it in FastAPI with Celery workers and partitioned the Postgres schema. I ran it in shadow mode for two weeks, then cut over. Batch time dropped to 38 minutes and finance closed the day before 9am, and incidents fell from 9 to 2 per quarter.',
  behavioural,
)
check('weak answer scores low', weakFeedback.overall < 5, String(weakFeedback.overall))
check('strong answer scores high', strongFeedback.overall >= 7, String(strongFeedback.overall))
check('STAR detected on the strong answer', strongFeedback.used_star)
check('feedback is specific', weakFeedback.improvements.length > 0, weakFeedback.improvements[0])

section('Resume import (round trip)')
const text = renderResumeText(content)
const reparsed = parseResumeText(text)
check('name recovered', reparsed.content.contact.full_name === content.contact.full_name, reparsed.content.contact.full_name)
check('email recovered', reparsed.content.contact.email === content.contact.email)
check('roles recovered', reparsed.content.experience.length === content.experience.length,
  `${reparsed.content.experience.length}/${content.experience.length}`)
check('bullets recovered', reparsed.content.experience.reduce((n, e) => n + e.bullets.length, 0) >= 8)
check('confidence reported', reparsed.confidence >= 70, `${reparsed.confidence}%`)

section('Export renderers')
const doc = renderResumeDocument(content, 'ats-classic', 'Smoke test')
check('document renders', doc.startsWith('<!doctype html>') && doc.includes('Ayesha Raman'))
check('plain text export has sections', text.includes('EXPERIENCE') && text.includes('SKILLS'))
check('every template renders', (['ats-classic', 'ats-compact', 'ats-modern', 'ats-technical', 'designed-sidebar', 'designed-editorial'] as const)
  .every((id) => renderResumeDocument(content, id, 't').length > 500))

section('Bullet sanitiser')
check('keeps bold and italic', sanitizeInlineHtml('<b>Cut</b> cost by <i>31%</i>') === '<b>Cut</b> cost by <i>31%</i>',
  sanitizeInlineHtml('<b>Cut</b> cost by <i>31%</i>'))
check('drops pasted markup', sanitizeInlineHtml('<div style="font-size:40pt"><span class="x">Shipped</span></div>').trim() === 'Shipped')
check('numbers survive', sanitizeInlineHtml('Reduced spend by <b>31</b>% across 11 services').includes('31'),
  sanitizeInlineHtml('Reduced spend by <b>31</b>% across 11 services'))
check('normalises strong/em', sanitizeInlineHtml('<strong>A</strong> and <em>B</em>') === '<b>A</b> and <i>B</i>')

await (async function analytics() {
  section('Analytics (through the mock API)')
  const { mockApi } = await import('../src/lib/mock/handlers')
  await mockApi.auth.loginDemo()
  // loginDemo seeds its own database, so ids differ from the local `buildSeedDb`.
  const apiMaster = (await mockApi.resumes.list()).find((r) => r.is_master)!
  const apiMasterContent = (await mockApi.resumes.get(apiMaster.id)).version.content
  const dash = await mockApi.analytics.dashboard()

  const stage = (name: string) => dash.funnel.stages.find((s) => s.status === name)?.count ?? 0
  check('funnel is monotonic', stage('Saved') >= stage('Applied') && stage('Applied') >= stage('Screening') &&
    stage('Screening') >= stage('Interview') && stage('Interview') >= stage('Offer'),
    dash.funnel.stages.map((s) => `${s.status}:${s.count}`).join(' '))
  check('interviews survive a later rejection', stage('Interview') > 0, `${stage('Interview')} reached interview`)
  check('rates are fractions', [dash.funnel.response_rate, dash.funnel.interview_rate, dash.funnel.offer_rate]
    .every((r) => r >= 0 && r <= 1), `response ${(dash.funnel.response_rate * 100).toFixed(0)}%`)
  check('conversion by resume computed', dash.funnel.by_resume.length >= 2, `${dash.funnel.by_resume.length} resumes`)
  check('tailored variant shows a lift vs master',
    dash.funnel.by_resume.some((r) => r.lift_vs_master != null && r.lift_vs_master > 1),
    dash.funnel.by_resume.map((r) => `${r.title}:${(r.interview_rate * 100).toFixed(0)}%`).join(' · '))
  check('12 weeks of volume', dash.volume.weekly.length === 12, `goal ${dash.volume.goal}/week`)
  check('response time measured', dash.response.avg_days_to_first_response != null,
    `${dash.response.avg_days_to_first_response} days to first reply`)
  check('time in stage measured', dash.response.time_in_stage.length > 0,
    dash.response.time_in_stage.map((r) => `${r.status}:${r.avg_days}d`).join(' '))
  check('sources ranked', dash.sources.rows.length >= 4, dash.sources.rows.map((r) => r.source).join(', '))
  const byInterviewRate = dash.sources.rows.slice().sort((a, b) => b.interview_rate - a.interview_rate)
  check('referrals rank near the top', byInterviewRate.slice(0, 2).some((r) => r.source === 'Referral'),
    byInterviewRate.slice(0, 3).map((r) => `${r.source}:${(r.interview_rate * 100).toFixed(0)}%`).join(' '))
  check('skill gaps aggregated', dash.skill_gaps.rows.length > 0,
    dash.skill_gaps.rows.slice(0, 5).map((r) => `${r.keyword}×${r.occurrences}`).join(', '))
  check('follow-ups surfaced', dash.follow_ups_due.length > 0, `${dash.follow_ups_due.length} due`)

  section('Mock API write paths')
  const apps = await mockApi.applications.list()
  const target = apps.find((a) => a.status === 'Applied')!
  await mockApi.applications.setStatus(target.id, 'Screening', 'smoke test')
  const hist = await mockApi.applications.history(target.id)
  check('status transition recorded', hist.some((h) => h.to_status === 'Screening' && h.note === 'smoke test'))

  const dup = await mockApi.applications.checkDuplicate({
    company_name: target.company_name,
    role_title: target.role_title,
  })
  check('duplicate detection fires', dup?.reason === 'exact', String(dup?.reason))

  const imported = await mockApi.applications.bulkImport([
    { company_name: 'Smoke Test Ltd', role_title: 'Backend Engineer', source: 'Referral', status: 'Applied' },
    { company_name: target.company_name, role_title: target.role_title },
    { company_name: '', role_title: 'No company' },
  ])
  check('CSV import creates, skips and reports', imported.created === 1 && imported.skipped === 2 && imported.duplicates.length === 1,
    JSON.stringify(imported))

  const jds = await mockApi.jds.list()
  const cached = await mockApi.jds.createFromText({ raw_text: jds[0].raw_text })
  check('identical JD text hits the cache', cached.id === jds[0].id)

  const draftViaApi = await mockApi.tailoring.generate({
    resume_id: apiMaster.id,
    job_description_id: jds[0].id,
  })
  const rejectedAll = await mockApi.tailoring.setChanges(
    draftViaApi.id,
    draftViaApi.changes.map((c) => ({ ...c, accepted: false })),
  )
  check('rejecting every change restores the base text',
    renderResumeText(rejectedAll.content) === renderResumeText(apiMasterContent))
  const variant = await mockApi.tailoring.saveVariant(draftViaApi.id, 'Smoke variant')
  check('variant is linked to the posting', variant.resume.job_description_id === jds[0].id)
  check('variant does not become the master', variant.resume.is_master === false)

  const usage = await mockApi.system.usage()
  check('usage is metered', usage.generations_used > 0, `${usage.generations_used} generations, ${usage.cached_hits} cached`)
})()

await (async function documentMode() {
  // No DOM in node, so the sanitiser and the analyser take their regex fallback
  // paths here. What this pins down is the data flow: a document survives a
  // create/save round trip through the API, stays flagged as one, and can be
  // read back as text and re-parsed into structured fields.
  section('Freeform document mode')

  // Paste fidelity: when DOMParser is available (browser / jsdom), borders and
  // Word class styles must survive. Under plain Node the regex fallback still
  // keeps the tags that carry those styles.
  const bordered = sanitizeDocumentHtml(
    '<p style="border-bottom: 1pt solid #14161a; font-size: 12pt">Experience</p>' +
      '<table style="width: 320pt; margin-left: 40px" border="1">' +
      '<tr><td style="border: 1px solid #000; width: 160pt; padding: 4px">A</td>' +
      '<td style="border: 1px solid #000; width: 160pt; padding: 4px">B</td></tr></table>',
  )
  check('paste keeps bordered paragraphs', /border-bottom/i.test(bordered) || bordered.includes('Experience'),
    bordered.slice(0, 120))
  check('paste keeps tables', bordered.includes('<table') && bordered.includes('<td'))
  // With DOMParser (browser) tables stretch to the content box; the Node smoke
  // path is a regex fallback that still keeps the markup.
  check('paste stretches fixed-width tables when DOM is available',
    typeof DOMParser === 'undefined' || /width:\s*100%/.test(bordered),
    bordered.match(/<table[^>]*>/)?.[0] ?? 'no table')

  // Google Docs puts the whole copied range inside
  // <b style="font-weight:normal" id="docs-internal-guid-…"> and stamps every
  // run with white-space:pre plus a pile of no-op declarations. Left alone, the
  // inline wrapper swallows the block structure and the paste lands centred.
  const gdocs = sanitizeDocumentHtml(
    '<b style="font-weight:normal;" id="docs-internal-guid-1">' +
      '<p dir="ltr" style="line-height:1.2;text-align: center;">' +
      '<span style="font-size:16pt;font-weight:700;font-style:normal;text-decoration:none;' +
      'vertical-align:baseline;white-space:pre;white-space:pre-wrap;">FAISAL P</span></p>' +
      '<p dir="ltr" style="line-height:1.2;"><span style="white-space:pre-wrap;">Kerala, India</span></p>' +
      '</b>',
    { paste: true },
  )
  const domLess = typeof DOMParser === 'undefined'
  check('google docs wrapper is unwrapped', domLess || !/^<b[\s>]/.test(gdocs), gdocs.slice(0, 90))
  check('google docs paste keeps its own centring', domLess || /text-align: center/.test(gdocs))
  check('google docs paste cannot inherit the caret block alignment',
    domLess || /text-align: left/.test(gdocs))
  check('google docs paste keeps real bold', domLess || /font-weight: 700/.test(gdocs))
  check('white-space: pre is dropped so pasted text reflows',
    domLess || !/white-space:\s*pre/.test(gdocs), gdocs.slice(0, 90))
  check('no-op declarations are dropped',
    domLess || !/(font-style:\s*normal|text-decoration:\s*none|vertical-align:\s*baseline)/.test(gdocs))
  // Spacing. A blank line in Docs is an empty span, which generates no line box
  // and so collapsed to zero height — every gap in the pasted resume closed up.
  const blankLine = sanitizeDocumentHtml(
    '<p style="line-height:1.2;margin-top:0pt;"><span style="font-size:11pt;"></span></p>',
    { paste: true },
  )
  check('a blank line keeps its height', domLess || blankLine.includes('<br>'), blankLine)
  // A non-breaking space already makes a line box; a <br> would double the gap.
  const nbspLine = sanitizeDocumentHtml('<p><span>&nbsp;</span></p>', { paste: true })
  check('an nbsp line is not doubled', domLess || !nbspLine.includes('<br>'), nbspLine)
  // Paragraph space-before/after must survive, or section gaps go missing.
  const spaced = sanitizeDocumentHtml('<p style="margin-top:12pt;">X</p>', { paste: true })
  check('paragraph space-before survives', domLess || spaced.includes('margin-top: 12pt'), spaced)
  // Docs indents lists with a logical property that was being dropped, leaving
  // every level flattened onto the stylesheet default.
  const indented = sanitizeDocumentHtml(
    '<ul style="padding-inline-start:48px;"><li>A' +
      '<ul style="padding-inline-start:48px;"><li>B</li></ul></li></ul>',
    { paste: true },
  )
  check('list indent survives as a physical property',
    domLess || indented.split('padding-left: 48px').length - 1 === 2, indented.slice(0, 110))

  // Word stamps its own line-height on every paragraph. Inline beats the page
  // stylesheet by origin, so keeping it means the Line spacing control silently
  // stops applying to pasted content.
  const wordPaste = sanitizeDocumentHtml(
    '<style>p.MsoNormal { margin: 0cm; margin-bottom: 8.0pt; line-height: 107%; }</style>' +
      '<p class=MsoNormal>Pasted</p>',
    { paste: true },
  )
  check('word line-height is dropped so the page setting governs',
    domLess || !/line-height/.test(wordPaste), wordPaste)
  check('word paragraph gap survives the paste',
    domLess || /margin-bottom: 8\.0pt/.test(wordPaste), wordPaste)
  // A user who set line spacing with the ribbon keeps it; only pastes are cleaned.
  const storedSpacing = sanitizeDocumentHtml('<p style="line-height: 2">Mine</p>')
  check('a stored line-height is left alone',
    domLess || /line-height: 2/.test(storedSpacing), storedSpacing)
  // The explicit reset goes further and flattens paragraph gaps too, but indent
  // is structure and has to survive.
  const reset = resetDocumentSpacing(
    '<p style="margin: 0cm 0cm 8.0pt 36.0pt; line-height: 107%">Pasted</p>',
  )
  check('reset clears line spacing', domLess || !/line-height/.test(reset), reset)
  check('reset clears the paragraph gap', domLess || !/margin-bottom/.test(reset), reset)
  check('reset keeps the left indent', domLess || /margin-left: 36\.0pt/.test(reset), reset)
  const counted = countInlineSpacing(
    '<p style="line-height: 107%">a</p><p style="margin-bottom: 8pt">b</p><p style="margin-left: 4pt">c</p>',
  )
  check('inline spacing is counted for the warning',
    counted.line_height === 1 && counted.margins === 1, JSON.stringify(counted))

  // Google Docs stamps `margin-top: 0pt; margin-bottom: 0pt` on every paragraph
  // it copies. Inline beats the stylesheet, so those zeros cancelled
  // `.doc p { margin: … }` and welded the paste into one block no page control
  // could open. Zero means the source set no space — which is exactly when the
  // document's own spacing should apply.
  const gdocsGaps = sanitizeDocumentHtml(
    '<p style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">One</p>' +
      '<p style="line-height:1.38;margin-top:12pt;margin-bottom:0pt;">Two</p>',
    { paste: true },
  )
  check('zero paragraph margins are dropped so the page spacing governs',
    domLess || !/margin-(top|bottom):\s*0/.test(gdocsGaps), gdocsGaps)
  check('a real paragraph gap is still kept',
    domLess || /margin-top: 12pt/.test(gdocsGaps), gdocsGaps)
  // The margin shorthand has to be expanded, not dropped, or a zero top/bottom
  // takes the left indent with it.
  const zeroShorthand = sanitizeDocumentHtml('<p style="margin:0pt 0pt 0pt 36pt">X</p>', { paste: true })
  check('a zero-vertical shorthand keeps its indent',
    domLess || (/margin-left: 36pt/.test(zeroShorthand) && !/margin-top/.test(zeroShorthand)),
    zeroShorthand)

  // A <style> rule already ends in `;`, so appending the inline style used to
  // produce `;;`. Our reader tolerates it; a real CSS parser stops there and
  // drops whatever followed — which was Word's alignment.
  const joined = sanitizeDocumentHtml(
    '<style>p.MsoNormal { margin-bottom: 8.0pt; }</style>' +
      '<p class=MsoNormal style="text-align:center">X</p>',
    { paste: true },
  )
  check('style declarations are joined without an empty one',
    domLess || !/;\s*;/.test(joined), joined)
  check('a declaration after the join still applies',
    domLess || /text-align: center/.test(joined), joined)

  // Alignment anchoring is paste-only: it must not rewrite a stored document.
  const stored = sanitizeDocumentHtml('<p>Plain</p>')
  check('stored documents are not given a forced alignment', !/text-align/.test(stored), stored)

  const page = defaultDocumentPage()
  const html = structuredToDocumentHtml(content)
  check('structured profile renders as a page', html.includes(content.contact.full_name), `${html.length} chars`)
  check('sections become headings', html.includes('<h2>Experience</h2>'))

  const fromText = textToDocumentHtml(renderResumeText(content))
  check('extracted text becomes blocks', fromText.includes('<h1') && fromText.includes('<li>'))

  const asText = documentToText(html)
  check('document reads back as text', asText.includes(content.contact.full_name), `${asText.split('\n').length} lines`)
  check('email survives the round trip', asText.includes(content.contact.email))

  const report = analyzeDocument({ html, page })
  check('analyser counts words', report.stats.words > 100, `${report.stats.words} words`)
  check('analyser estimates pages', report.stats.pages >= 1, `${report.stats.pages} pages`)
  check('analyser finds the email', !report.issues.some((i) => i.code === 'doc_no_email'))

  const exported = renderDocumentDocument({ html, page }, 'Smoke document')
  check('export declares a real page box', exported.includes('@page') && exported.includes(`${page.margin_mm}mm`))
  check('export carries the document stylesheet', exported.includes('.doc h2'))

  const { mockApi } = await import('../src/lib/mock/handlers')
  const created = await mockApi.resumes.create({
    title: 'Smoke document',
    content: { ...content, mode: 'freeform', document: { html, page } },
  })
  check('create flags the resume as a document', created.resume.mode === 'freeform')
  const listed = (await mockApi.resumes.list()).find((r) => r.id === created.resume.id)
  check('listing keeps the flag', listed?.mode === 'freeform')

  const edited = { ...created.version.content, document: { html: html + '<p>Added later.</p>', page } }
  await mockApi.resumes.saveVersion(created.resume.id, edited, 'edit')
  const reloaded = await mockApi.resumes.get(created.resume.id)
  check('saved version keeps the page', reloaded.version.content.document?.html.includes('Added later.') === true)
  check('resume stays flagged after a save', reloaded.resume.mode === 'freeform')

  const back = documentToStructured(reloaded.version.content)
  check('converting back recovers the name', back.content.contact.full_name === content.contact.full_name,
    back.content.contact.full_name)
  check('converting back returns to structured mode', back.content.mode === 'structured')
  check('converting back keeps the page', Boolean(back.content.document))
})()

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
