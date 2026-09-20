/**
 * Conversions between the structured profile and freeform document mode.
 *
 * Both directions are lossy in one specific way, and the UI says so rather than
 * hiding it:
 *
 *  - structured → document is a faithful *render*, but once the user edits the
 *    page the structured fields stop describing what is on it.
 *  - document → structured runs the same heuristic parser used by resume import,
 *    so it is a good draft, not a guarantee.
 *
 * Nothing is deleted in either direction: `content.document` survives a switch
 * back to structured, and the structured fields survive a switch to document.
 */
import type { ResumeContent, ResumeDocument, SectionKey } from '@/types'
import { SECTION_LABELS } from '../resumeFactory'
import { sanitizeInlineHtml, sortByOrder, stripHtml } from '../utils'
import { SECTION_HEADERS } from '../ai/vocab'
import { parseResumeText } from '../ai/resumeParse'
import { defaultDocumentPage } from './render'
import { documentToText, sanitizeDocumentHtml } from './sanitize'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function dateRange(start: string, end: string | null, current: boolean) {
  const fmt = (v: string) => {
    if (!v) return ''
    const [y, m] = v.split('-')
    if (!m) return y
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en', { month: 'short' }) + ' ' + y
  }
  const from = fmt(start)
  const to = current ? 'Present' : fmt(end ?? '')
  if (!from && !to) return ''
  return to ? from + ' – ' + to : from
}

function bulletList(bullets: { html: string; order_index: number }[]) {
  const items = sortByOrder(bullets)
    .map((b) => sanitizeInlineHtml(b.html))
    .filter((html) => stripHtml(html).trim())
  if (!items.length) return ''
  return '<ul>' + items.map((html) => '<li>' + html + '</li>').join('') + '</ul>'
}

function sectionHtml(content: ResumeContent, key: SectionKey): string {
  const heading = '<h2>' + SECTION_LABELS[key] + '</h2>'
  switch (key) {
    case 'summary':
      return content.summary.trim() ? heading + '<p>' + esc(content.summary) + '</p>' : ''

    case 'experience': {
      const body = sortByOrder(content.experience)
        .map((exp) => {
          const line = [exp.title, exp.company].filter(Boolean).map(esc).join(' — ')
          const meta = [dateRange(exp.start_date, exp.end_date, exp.is_current), exp.location]
            .filter(Boolean)
            .map(esc)
            .join(' · ')
          return (
            '<h3>' + (line || 'Role') + '</h3>' +
            (meta ? '<p><i>' + meta + '</i></p>' : '') +
            bulletList(exp.bullets)
          )
        })
        .join('')
      return body ? heading + body : ''
    }

    case 'education': {
      const body = sortByOrder(content.education)
        .map((edu) => {
          const line = [[edu.degree, edu.field].filter(Boolean).join(', '), edu.school]
            .filter(Boolean)
            .map(esc)
            .join(' — ')
          const meta = [dateRange(edu.start_date, edu.end_date, false), edu.grade].filter(Boolean).map(esc).join(' · ')
          return '<h3>' + (line || 'Qualification') + '</h3>' + (meta ? '<p><i>' + meta + '</i></p>' : '')
        })
        .join('')
      return body ? heading + body : ''
    }

    case 'skills': {
      const body = sortByOrder(content.skills)
        .filter((g) => g.skills.length)
        .map((g) => '<p><b>' + esc(g.category) + ':</b> ' + esc(g.skills.join(', ')) + '</p>')
        .join('')
      return body ? heading + body : ''
    }

    case 'projects': {
      const body = sortByOrder(content.projects)
        .map((p) => {
          const line = [p.name, p.role].filter(Boolean).map(esc).join(' — ')
          const link = p.url ? '<p><a href="' + esc(p.url) + '">' + esc(p.url) + '</a></p>' : ''
          return (
            '<h3>' + (line || 'Project') + '</h3>' +
            (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
            link +
            bulletList(p.bullets)
          )
        })
        .join('')
      return body ? heading + body : ''
    }

    case 'certifications': {
      const items = sortByOrder(content.certifications)
        .map((c) => [c.name, c.issuer, c.issued_on].filter(Boolean).map(esc).join(' — '))
        .filter(Boolean)
      return items.length ? heading + '<ul>' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>' : ''
    }

    case 'languages': {
      const line = sortByOrder(content.languages)
        .map((l) => esc(l.language) + ' (' + esc(l.proficiency) + ')')
        .join(', ')
      return line ? heading + '<p>' + line + '</p>' : ''
    }
  }
}

/** Renders the structured profile as editable document HTML. */
export function structuredToDocumentHtml(content: ResumeContent): string {
  const { contact } = content
  const contactLine = [contact.email, contact.phone, contact.location, ...contact.links.map((l) => l.url)]
    .filter(Boolean)
    .map(esc)
    .join(' · ')

  const header =
    '<h1 style="text-align: center">' + esc(contact.full_name || 'Your name') + '</h1>' +
    (contact.headline ? '<p style="text-align: center">' + esc(contact.headline) + '</p>' : '') +
    (contactLine ? '<p style="text-align: center">' + contactLine + '</p>' : '')

  const body = content.section_order
    .filter((key) => !content.hidden_sections.includes(key))
    .map((key) => sectionHtml(content, key))
    .join('')

  return sanitizeDocumentHtml(header + (body || '<p><br></p>'))
}

/**
 * Turns extracted resume text (a PDF/DOCX import, or a paste) into document
 * HTML: headings for the section names an ATS looks for, list items for
 * anything already bulleted, paragraphs for the rest.
 */
export function textToDocumentHtml(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''))
  const out: string[] = []
  let inList = false
  let seenTitle = false

  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  const isHeader = (line: string) =>
    Object.values(SECTION_HEADERS).some((re) => re.test(line.trim())) ||
    (line.trim().length > 2 && line.trim().length < 32 && line.trim() === line.trim().toUpperCase() && /[A-Z]/.test(line))

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      closeList()
      continue
    }
    if (!seenTitle) {
      out.push('<h1 style="text-align: center">' + esc(line) + '</h1>')
      seenTitle = true
      continue
    }
    if (isHeader(line)) {
      closeList()
      out.push('<h2>' + esc(line.replace(/:$/, '')) + '</h2>')
      continue
    }
    const bulleted = /^([-*•●–—→o·]\s+|\d+[.)]\s+)/.test(line)
    if (bulleted) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push('<li>' + esc(line.replace(/^([-*•●–—→o·]\s+|\d+[.)]\s+)/, '')) + '</li>')
      continue
    }
    closeList()
    out.push('<p>' + esc(line) + '</p>')
  }
  closeList()
  return sanitizeDocumentHtml(out.join('') || '<p><br></p>')
}

/** A starter page for "write it from scratch", pre-filled with what we know. */
export function blankDocumentHtml(name: string, email: string): string {
  const contactLine = [email, 'Phone', 'City, Country', 'linkedin.com/in/you']
    .filter(Boolean)
    .map(esc)
    .join(' · ')
  return sanitizeDocumentHtml(
    [
      '<h1 style="text-align: center">' + esc(name || 'Your name') + '</h1>',
      '<p style="text-align: center">Role you are targeting</p>',
      '<p style="text-align: center">' + contactLine + '</p>',
      '<h2>Summary</h2>',
      '<p>Two or three lines on what you do, the scale you do it at, and what you are looking for next.</p>',
      '<h2>Experience</h2>',
      '<h3>Job title — Company</h3>',
      '<p><i>Mon 20XX – Present · City</i></p>',
      '<ul><li>Start with a verb, end with a number.</li><li><br></li></ul>',
      '<h2>Education</h2>',
      '<h3>Degree, Field — Institution</h3>',
      '<p><i>20XX – 20XX</i></p>',
      '<h2>Skills</h2>',
      '<p><b>Core:</b> </p>',
    ].join(''),
  )
}

/** Wraps document HTML into a version body, keeping the structured fields intact. */
export function withDocument(content: ResumeContent, html: string, page = defaultDocumentPage()): ResumeContent {
  return {
    ...content,
    mode: 'freeform',
    document: { html: sanitizeDocumentHtml(html), page: content.document?.page ?? page },
  }
}

/**
 * Re-derives structured fields from the document so matching, tailoring and
 * scoring work again. Heuristic — the caller shows the parse report first.
 */
export function documentToStructured(content: ResumeContent) {
  const doc: ResumeDocument | undefined = content.document
  const parse = parseResumeText(documentToText(doc?.html ?? ''))
  const next: ResumeContent = {
    ...parse.content,
    mode: 'structured',
    // Kept, not cleared: switching back to the document must not lose the page.
    document: doc,
  }
  return { content: next, parse }
}

export function isFreeform(content: Pick<ResumeContent, 'mode'> | null | undefined) {
  return content?.mode === 'freeform'
}
