/**
 * Checks for freeform document mode.
 *
 * The structured scorer (`scoreResume`) reads fields that a document does not
 * have, so it would report a flat zero and teach the user to ignore it. This is
 * the equivalent rubric run over the document itself: an outline, the counts
 * that matter, and the ATS risks that only exist because the user is now free to
 * lay the page out however they like.
 */
import type { AtsIssue, ResumeDocument } from '@/types'
import { hasNumber, findSkills } from '../ai/text'
import { ACTION_VERBS, SECTION_HEADERS, WEAK_OPENERS } from '../ai/vocab'
import { documentToText } from './sanitize'
import { pageGeometry } from './render'

export interface OutlineItem {
  /** Index of the heading within the document, used to scroll to it. */
  index: number
  level: 1 | 2 | 3
  text: string
}

export interface DocumentStats {
  words: number
  characters: number
  bullets: number
  quantified: number
  strongVerbs: number
  pages: number
}

export interface DocumentReport {
  outline: OutlineItem[]
  stats: DocumentStats
  issues: AtsIssue[]
  skills: string[]
  /** Sections an ATS expects to find by name. */
  sections: { key: string; found: boolean }[]
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/

function parse(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html')
}

/**
 * `measuredPages` comes from the editor, which knows the real rendered height of
 * the sheet. Without it we fall back to a words-per-page estimate, which is
 * close enough for an export path but never as good as measuring.
 */
export function analyzeDocument(doc: ResumeDocument, measuredPages?: number): DocumentReport {
  const dom = parse(doc.html)
  const text = documentToText(doc.html)
  const words = text.split(/\s+/).filter(Boolean).length

  const outline: OutlineItem[] = []
  const bullets: string[] = []
  let tables = 0
  let images = 0
  let smallestPt = doc.page.font_size_pt

  if (dom) {
    dom.body.querySelectorAll('h1, h2, h3').forEach((el, index) => {
      const text = (el.textContent ?? '').trim()
      if (text) {
        outline.push({ index, level: Number(el.tagName[1]) as 1 | 2 | 3, text })
      }
    })
    dom.body.querySelectorAll('li').forEach((el) => {
      const value = (el.textContent ?? '').trim()
      if (value) bullets.push(value)
    })
    tables = dom.body.querySelectorAll('table').length
    images = dom.body.querySelectorAll('img').length
    dom.body.querySelectorAll('[style*="font-size"]').forEach((el) => {
      const match = /font-size:\s*([\d.]+)pt/i.exec(el.getAttribute('style') ?? '')
      if (match) smallestPt = Math.min(smallestPt, Number(match[1]))
    })
  }

  const geo = pageGeometry(doc.page)
  const usableRatio = 1 - (doc.page.margin_mm * 2) / geo.height_mm
  const wordsPerPage = Math.round((520 / doc.page.font_size_pt) * 10 * usableRatio * (1.45 / doc.page.line_height))
  const pages = measuredPages ?? Math.max(1, Math.ceil(words / Math.max(120, wordsPerPage)))

  const quantified = bullets.filter((b) => hasNumber(b))
  const strong = bullets.filter((b) => ACTION_VERBS.includes(b.toLowerCase().split(/\s+/)[0] ?? ''))
  const weak = bullets.filter((b) => WEAK_OPENERS.some((w) => b.toLowerCase().startsWith(w)))

  const lower = text.toLowerCase()
  const sections = Object.entries(SECTION_HEADERS).map(([key, re]) => ({
    key,
    found: text.split(/\n/).some((line) => re.test(line.trim())) || lower.includes('\n' + key),
  }))

  const issues: AtsIssue[] = []
  const add = (severity: AtsIssue['severity'], code: string, message: string, fix: string) =>
    issues.push({ severity, code, message, fix })

  if (!EMAIL.test(text)) {
    add('error', 'doc_no_email', 'No email address found anywhere on the page.', 'Add it to the header line under your name.')
  }
  if (!PHONE.test(text)) {
    add('warning', 'doc_no_phone', 'No phone number found.', 'Most portals treat a missing phone as an incomplete profile.')
  }
  if (!outline.some((o) => o.level === 1)) {
    add('warning', 'doc_no_title', 'The page does not start with a heading.', 'Put your name in a Title (H1) block — parsers read it as the candidate name.')
  }
  for (const key of ['experience', 'education', 'skills']) {
    if (!sections.find((s) => s.key === key)?.found) {
      add('warning', 'doc_missing_' + key, 'No section heading matching "' + key + '".', 'Name the section with the ordinary word — an ATS matches on the literal heading, not on layout.')
    }
  }
  if (tables > 0) {
    add('error', 'doc_tables', tables + ' table' + (tables > 1 ? 's' : '') + ' on the page.', 'Most parsers read tables cell-by-cell and scramble the order. Use paragraphs and lists instead.')
  }
  if (images > 0) {
    add('warning', 'doc_images', images + ' image' + (images > 1 ? 's' : '') + ' on the page.', 'Text inside an image is invisible to a parser, and photos are a screening liability in the US/UK.')
  }
  if (smallestPt < 9) {
    add('warning', 'doc_small_type', 'Type as small as ' + smallestPt + 'pt.', 'Below 9pt is unreadable on paper and often a sign the page is over length.')
  }
  if (pages > 2) {
    add('warning', 'doc_long', 'About ' + pages + ' pages.', 'Two is the ceiling outside academia and government.')
  }
  if (words < 200) {
    add('warning', 'doc_thin', 'Only ' + words + ' words.', 'A resume this short reads as an outline. Aim for 350–800.')
  }
  if (bullets.length === 0) {
    add('info', 'doc_no_bullets', 'No bullet lists on the page.', 'Bulleted achievements are scanned; paragraphs of duties are not.')
  } else if (quantified.length / bullets.length < 0.4) {
    add('info', 'doc_unquantified', quantified.length + ' of ' + bullets.length + ' bullets contain a number.', 'Add scale, money or time to the rest — "reduced" means nothing without a figure.')
  }
  if (weak.length) {
    add('info', 'doc_weak_openers', weak.length + ' bullet' + (weak.length > 1 ? 's' : '') + ' open with filler ("responsible for", "worked on").', 'Open with what you did: ' + ACTION_VERBS.slice(0, 6).join(', ') + '…')
  }

  return {
    outline,
    stats: {
      words,
      characters: text.replace(/\s/g, '').length,
      bullets: bullets.length,
      quantified: quantified.length,
      strongVerbs: strong.length,
      pages,
    },
    issues,
    skills: findSkills(text),
    sections,
  }
}
