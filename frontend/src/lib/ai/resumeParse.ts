/**
 * Resume import (spec §2.1): heuristics first, LLM fallback for messy layouts.
 *
 * The browser can only read text out of a PDF/DOCX approximately, so the real
 * pipeline is server-side (pdfplumber/docx2txt then Claude). This module is the
 * heuristic pass, and is also what the mock backend uses end to end. Whatever it
 * produces lands in the manual-correction UI, because parsing is never 100%.
 */
import type { ResumeContent, SectionKey } from '@/types'
import { uid } from '../utils'
import { SECTION_HEADERS } from './vocab'
import { findSkills } from './text'
import { emptyResumeContent } from '../resumeFactory'

export interface ParseResult {
  content: ResumeContent
  confidence: number
  warnings: string[]
  /** Lines the parser could not place, shown so nothing is silently lost. */
  unparsed: string[]
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/
const URL_RE = /((?:https?:\/\/|www\.)[^\s,;]+)/gi
const DATE_RANGE_RE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4}-\d{2}|\d{2}\/\d{4}|\d{4})\s*(?:-|–|—|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4}-\d{2}|\d{2}\/\d{4}|\d{4}|present|current|now)/i

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function toYearMonth(raw: string): string {
  const s = raw.trim().toLowerCase()
  if (/^(present|current|now)$/.test(s)) return ''
  const iso = s.match(/^(\d{4})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}`
  const slash = s.match(/^(\d{2})\/(\d{4})$/)
  if (slash) return `${slash[2]}-${slash[1]}`
  const monthYear = s.match(/^([a-z]{3})[a-z]*\.?\s*(\d{4})$/)
  if (monthYear) return `${monthYear[2]}-${MONTHS[monthYear[1]] ?? '01'}`
  const year = s.match(/^(\d{4})$/)
  if (year) return `${year[1]}-01`
  return ''
}

function detectSection(line: string): SectionKey | 'contact' | null {
  const trimmed = line.trim().replace(/[:•]/g, '').trim()
  if (trimmed.length > 40) return null
  for (const [key, re] of Object.entries(SECTION_HEADERS)) {
    if (re.test(trimmed)) return key as SectionKey
  }
  if (/^(contact|contact info(rmation)?|details)$/i.test(trimmed)) return 'contact'
  return null
}

export function parseResumeText(raw: string): ParseResult {
  const content = emptyResumeContent()
  const warnings: string[] = []
  const unparsed: string[] = []
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return { content, confidence: 0, warnings: ['No text could be extracted.'], unparsed: [] }
  }

  /* ---------------------------------------------------------- contact block */
  const head = lines.slice(0, 8).join('\n')
  const email = head.match(EMAIL_RE) ?? raw.match(EMAIL_RE)
  const phone = head.match(PHONE_RE) ?? raw.match(PHONE_RE)
  content.contact.email = email?.[0] ?? ''
  content.contact.phone = phone?.[0]?.trim() ?? ''
  const nameLine = lines.find(
    (l) => !EMAIL_RE.test(l) && !PHONE_RE.test(l) && /^[A-Z][A-Za-z.'-]+(\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(l.trim()),
  )
  content.contact.full_name = nameLine?.trim() ?? ''
  const headlineLine = lines
    .slice(0, 6)
    .find((l) => l !== nameLine && l.length < 70 && /(engineer|developer|manager|designer|scientist|analyst|lead|architect|marketer|consultant)/i.test(l))
  content.contact.headline = headlineLine?.trim() ?? ''
  const locLine = lines.slice(0, 8).find((l) => /,\s*[A-Z]{2}\b|\b(remote|india|uk|usa|germany|canada)\b/i.test(l) && l.length < 60)
  content.contact.location = locLine?.replace(EMAIL_RE, '').replace(PHONE_RE, '').replace(/[|•,]\s*$/, '').trim() ?? ''
  const urls = [...head.matchAll(URL_RE)].map((m) => m[1])
  content.contact.links = urls.slice(0, 4).map((url) => ({
    label: /linkedin/i.test(url) ? 'LinkedIn' : /github/i.test(url) ? 'GitHub' : 'Website',
    url: url.startsWith('http') ? url : `https://${url}`,
  }))
  if (!content.contact.full_name) warnings.push('Could not confidently detect your name — please check the Contact section.')
  if (!content.contact.email) warnings.push('No email address found in the document.')

  /* ------------------------------------------------------------- sectioning */
  const blocks: { section: SectionKey | 'contact' | 'unknown'; lines: string[] }[] = []
  let current: (typeof blocks)[number] = { section: 'unknown', lines: [] }
  for (const line of lines) {
    const section = detectSection(line)
    if (section) {
      if (current.lines.length) blocks.push(current)
      current = { section, lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.lines.length) blocks.push(current)

  const sectionsFound = new Set(blocks.map((b) => b.section))
  if (!sectionsFound.has('experience')) {
    warnings.push('No "Experience" heading found — roles may have been missed or mis-assigned.')
  }

  for (const block of blocks) {
    switch (block.section) {
      case 'summary':
        content.summary = block.lines.join(' ').replace(/\s+/g, ' ').trim()
        break

      case 'experience': {
        let item: ResumeContent['experience'][number] | null = null
        for (const line of block.lines) {
          const dates = line.match(DATE_RANGE_RE)
          const isBullet = /^([-*•●–→o]\s+)/.test(line)
          if (!isBullet && (dates || / (at|@|\||–|—) /.test(line)) && line.length < 130) {
            const withoutDates = line.replace(DATE_RANGE_RE, '').replace(/[|,–—-]\s*$/, '').trim()
            const parts = withoutDates.split(/\s+(?:at|@)\s+|\s*[|•]\s*|\s+[–—]\s+/).map((p) => p.trim()).filter(Boolean)
            item = {
              id: uid('exp'),
              title: parts[0] ?? '',
              company: parts[1] ?? '',
              location: parts[2] ?? '',
              start_date: dates ? toYearMonth(dates[1]) : '',
              end_date: dates && !/present|current|now/i.test(dates[2]) ? toYearMonth(dates[2]) : null,
              is_current: dates ? /present|current|now/i.test(dates[2]) : false,
              bullets: [],
              order_index: content.experience.length,
            }
            content.experience.push(item)
          } else if (item) {
            const text = line.replace(/^([-*•●–→o]\s+)/, '').trim()
            if (text.length > 3) {
              item.bullets.push({ id: uid('b'), html: text, order_index: item.bullets.length })
            }
          } else {
            unparsed.push(line)
          }
        }
        break
      }

      case 'education': {
        for (const line of block.lines) {
          if (line.length < 6) continue
          const dates = line.match(DATE_RANGE_RE)
          const clean = line.replace(DATE_RANGE_RE, '').replace(/^([-*•●]\s+)/, '').trim()
          const parts = clean.split(/\s*[,|•]\s*|\s+[–—]\s+/).map((p) => p.trim()).filter(Boolean)
          const degreePart = parts.find((p) => /(b\.?s|b\.?a|b\.?tech|m\.?s|m\.?a|m\.?tech|mba|phd|bachelor|master|diploma)/i.test(p))
          content.education.push({
            id: uid('edu'),
            school: parts.find((p) => p !== degreePart && /(university|college|institute|school|iit|nit)/i.test(p)) ?? parts[0] ?? clean,
            degree: degreePart ?? '',
            field: parts.find((p) => p !== degreePart && !/(university|college|institute|school)/i.test(p)) ?? '',
            start_date: dates ? toYearMonth(dates[1]) : '',
            end_date: dates ? toYearMonth(dates[2]) : '',
            grade: line.match(/(\d\.\d{1,2}\s*\/\s*\d{1,2}|\d{2,3}%|first class|distinction)/i)?.[1] ?? '',
            order_index: content.education.length,
          })
        }
        break
      }

      case 'skills': {
        const text = block.lines.join('\n')
        const labelled = block.lines.filter((l) => /^[A-Za-z /&+]{3,30}:/.test(l))
        if (labelled.length >= 2) {
          labelled.forEach((line, i) => {
            const [category, rest] = line.split(/:/)
            content.skills.push({
              id: uid('sk'),
              category: category.trim(),
              skills: rest.split(/[,;•|]/).map((s) => s.trim()).filter(Boolean),
              order_index: i,
            })
          })
        } else {
          const flat = text.split(/[,;•|\n]/).map((s) => s.replace(/^([-*•●]\s+)/, '').trim()).filter((s) => s.length > 1 && s.length < 40)
          content.skills.push({ id: uid('sk'), category: 'Skills', skills: flat.slice(0, 40), order_index: 0 })
        }
        break
      }

      case 'projects': {
        let proj: ResumeContent['projects'][number] | null = null
        for (const line of block.lines) {
          const isBullet = /^([-*•●–→o]\s+)/.test(line)
          if (!isBullet && line.length < 90) {
            proj = {
              id: uid('proj'),
              name: line.replace(/[-–—|].*$/, '').trim(),
              role: '',
              url: line.match(URL_RE)?.[0] ?? '',
              description: '',
              bullets: [],
              order_index: content.projects.length,
            }
            content.projects.push(proj)
          } else if (proj) {
            proj.bullets.push({
              id: uid('b'),
              html: line.replace(/^([-*•●–→o]\s+)/, '').trim(),
              order_index: proj.bullets.length,
            })
          } else {
            unparsed.push(line)
          }
        }
        break
      }

      case 'certifications': {
        block.lines.forEach((line, i) => {
          const clean = line.replace(/^([-*•●]\s+)/, '').trim()
          const parts = clean.split(/\s*[,|–—]\s*/)
          content.certifications.push({
            id: uid('cert'),
            name: parts[0] ?? clean,
            issuer: parts[1] ?? '',
            issued_on: clean.match(/\b(20\d{2})\b/)?.[1] ?? '',
            order_index: i,
          })
        })
        break
      }

      case 'languages': {
        block.lines
          .flatMap((l) => l.split(/[,;•|]/))
          .map((s) => s.replace(/^([-*•●]\s+)/, '').trim())
          .filter(Boolean)
          .forEach((entry, i) => {
            const m = entry.match(/^(.+?)\s*[-–(]?\s*(native|fluent|professional|conversational|basic)/i)
            content.languages.push({
              id: uid('lang'),
              language: (m?.[1] ?? entry).trim(),
              proficiency: (m
                ? ((m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) as never)
                : 'Professional') as ResumeContent['languages'][number]['proficiency'],
              order_index: i,
            })
          })
        break
      }

      default:
        if (block.section === 'unknown') {
          // The pre-heading block is usually the contact header; keep any prose as a summary.
          const prose = block.lines.filter((l) => l.length > 90)
          if (prose.length && !content.summary) content.summary = prose.join(' ')
          unparsed.push(...block.lines.filter((l) => l.length <= 90).slice(0, 12))
        }
    }
  }

  if (!content.skills.length) {
    const detected = findSkills(raw)
    if (detected.length) {
      content.skills.push({ id: uid('sk'), category: 'Detected skills', skills: detected, order_index: 0 })
      warnings.push('No skills section found — skills were inferred from the body text. Please review.')
    }
  }

  const signals = [
    content.contact.full_name ? 1 : 0,
    content.contact.email ? 1 : 0,
    content.experience.length ? 1 : 0,
    content.experience.some((e) => e.bullets.length) ? 1 : 0,
    content.education.length ? 1 : 0,
    content.skills.length ? 1 : 0,
    content.summary ? 1 : 0,
  ]
  const confidence = Math.round((signals.reduce((a, b) => a + b, 0) / signals.length) * 100)
  if (confidence < 70) {
    warnings.push('Low parse confidence — this layout is likely multi-column. Check every field before saving.')
  }

  return { content, confidence, warnings, unparsed: unparsed.slice(0, 30) }
}

/**
 * Best-effort text extraction in the browser. DOCX and PDF are binary formats;
 * we pull whatever readable runs we can so the user is not blocked, and flag it.
 * The real implementation is the server-side pipeline described above.
 */
export async function extractTextFromFile(file: File): Promise<{ text: string; note: string | null }> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: await file.text(), note: null }
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer)

  if (name.endsWith('.pdf')) {
    const runs = [...decoded.matchAll(/\((?:\\.|[^()\\])*\)/g)]
      .map((m) => m[0].slice(1, -1).replace(/\\([()\\])/g, '$1'))
      .filter((s) => /[A-Za-z]{2}/.test(s))
    const text = runs.join(' ').replace(/\s{2,}/g, '\n')
    return {
      text,
      note: runs.length
        ? 'PDF text was extracted in the browser and may be imperfect (compressed PDFs extract poorly). Review every field.'
        : 'This PDF stores its text compressed, so nothing could be read client-side. Paste the text instead, or connect the backend parser.',
    }
  }

  if (name.endsWith('.docx')) {
    const paragraphs = [...decoded.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1])
    return {
      text: paragraphs.join(' ').replace(/\s{2,}/g, '\n'),
      note: paragraphs.length
        ? 'DOCX text was extracted in the browser; paragraph boundaries may be approximate.'
        : 'This DOCX is zip-compressed, so it cannot be read client-side. Paste the text instead, or connect the backend parser.',
    }
  }

  return { text: decoded, note: 'Unrecognised file type — treated as plain text.' }
}
