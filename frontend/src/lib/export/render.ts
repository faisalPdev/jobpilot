/**
 * Resume renderers. One structured model (§ design principle 1: documents are
 * renders of the profile, never the source of truth) rendered three ways:
 * HTML for on-screen preview and PDF/DOCX export, and plain text for
 * paste-into-form scenarios.
 */
import type { ResumeContent, SectionKey, TemplateId } from '@/types'
import { sanitizeInlineHtml, sortByOrder, stripHtml } from '../utils'
import { SECTION_LABELS } from '../resumeFactory'
import { templateMeta } from './templates'

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dateRange(start: string, end: string | null, current: boolean) {
  const fmt = (v: string) => {
    if (!v) return ''
    const [y, m] = v.split('-')
    if (!m) return y
    const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en', { month: 'short' })
    return `${month} ${y}`
  }
  const from = fmt(start)
  const to = current ? 'Present' : fmt(end ?? '')
  if (!from && !to) return ''
  return `${from}${to ? ` – ${to}` : ''}`
}

function visibleSections(content: ResumeContent): SectionKey[] {
  return content.section_order.filter((s) => !content.hidden_sections.includes(s))
}

function sectionHasContent(content: ResumeContent, key: SectionKey) {
  switch (key) {
    case 'summary':
      return Boolean(content.summary.trim())
    case 'experience':
      return content.experience.length > 0
    case 'education':
      return content.education.length > 0
    case 'skills':
      return content.skills.length > 0
    case 'projects':
      return content.projects.length > 0
    case 'certifications':
      return content.certifications.length > 0
    case 'languages':
      return content.languages.length > 0
  }
}

function renderSectionBody(content: ResumeContent, key: SectionKey): string {
  switch (key) {
    case 'summary':
      return `<p class="summary">${esc(content.summary)}</p>`

    case 'experience':
      return sortByOrder(content.experience)
        .map(
          (exp) => `
          <div class="entry">
            <div class="entry-head">
              <div>
                <span class="entry-title">${esc(exp.title)}</span>
                ${exp.company ? `<span class="entry-org">, ${esc(exp.company)}</span>` : ''}
              </div>
              <div class="entry-meta">${esc(dateRange(exp.start_date, exp.end_date, exp.is_current))}</div>
            </div>
            ${exp.location ? `<div class="entry-sub">${esc(exp.location)}</div>` : ''}
            ${
              exp.bullets.length
                ? `<ul>${sortByOrder(exp.bullets)
                    .filter((b) => stripHtml(b.html).trim())
                    .map((b) => `<li>${sanitizeInlineHtml(b.html)}</li>`)
                    .join('')}</ul>`
                : ''
            }
          </div>`,
        )
        .join('')

    case 'education':
      return sortByOrder(content.education)
        .map(
          (edu) => `
          <div class="entry">
            <div class="entry-head">
              <div>
                <span class="entry-title">${esc(edu.degree)}${edu.field ? `, ${esc(edu.field)}` : ''}</span>
                ${edu.school ? `<span class="entry-org">, ${esc(edu.school)}</span>` : ''}
              </div>
              <div class="entry-meta">${esc(dateRange(edu.start_date, edu.end_date, false))}</div>
            </div>
            ${edu.grade ? `<div class="entry-sub">${esc(edu.grade)}</div>` : ''}
          </div>`,
        )
        .join('')

    case 'skills':
      return `<div class="skills">${sortByOrder(content.skills)
        .map(
          (g) =>
            `<div class="skill-row"><span class="skill-cat">${esc(g.category)}:</span> ${esc(
              g.skills.join(', '),
            )}</div>`,
        )
        .join('')}</div>`

    case 'projects':
      return sortByOrder(content.projects)
        .map(
          (p) => `
          <div class="entry">
            <div class="entry-head">
              <div>
                <span class="entry-title">${esc(p.name)}</span>
                ${p.role ? `<span class="entry-org">, ${esc(p.role)}</span>` : ''}
              </div>
              ${p.url ? `<div class="entry-meta">${esc(p.url)}</div>` : ''}
            </div>
            ${p.description ? `<div class="entry-sub">${esc(p.description)}</div>` : ''}
            ${
              p.bullets.length
                ? `<ul>${sortByOrder(p.bullets)
                    .filter((b) => stripHtml(b.html).trim())
                    .map((b) => `<li>${sanitizeInlineHtml(b.html)}</li>`)
                    .join('')}</ul>`
                : ''
            }
          </div>`,
        )
        .join('')

    case 'certifications':
      return `<ul class="tight">${sortByOrder(content.certifications)
        .map(
          (c) =>
            `<li>${esc(c.name)}${c.issuer ? ` — ${esc(c.issuer)}` : ''}${
              c.issued_on ? ` (${esc(c.issued_on)})` : ''
            }</li>`,
        )
        .join('')}</ul>`

    case 'languages':
      return `<div class="skills"><div class="skill-row">${sortByOrder(content.languages)
        .map((l) => `${esc(l.language)} (${esc(l.proficiency)})`)
        .join(' · ')}</div></div>`
  }
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  .resume { color: #14161a; background: #fff; }
  .resume a { color: inherit; text-decoration: none; }
  .name { font-weight: 700; letter-spacing: -0.01em; }
  .headline { color: #444b57; }
  .contact-line { color: #444b57; }
  .section { break-inside: avoid; }
  .section-title { text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
  .entry { margin-bottom: 10px; break-inside: avoid; }
  .entry-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  .entry-title { font-weight: 600; }
  .entry-org { font-weight: 400; }
  .entry-meta { color: #5a6270; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .entry-sub { color: #5a6270; font-style: italic; }
  ul { margin: 4px 0 0; padding-left: 18px; }
  ul.tight { margin: 0; }
  li { margin-bottom: 3px; }
  .skill-cat { font-weight: 600; }
  .skill-row { margin-bottom: 3px; }
  .summary { margin: 0; }
`

const TEMPLATE_CSS: Record<TemplateId, string> = {
  'ats-classic': `
    .resume { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.42; padding: 46px 52px; }
    .name { font-size: 21pt; }
    .headline { font-size: 11pt; margin-top: 2px; }
    .contact-line { font-size: 9.5pt; margin-top: 6px; }
    .section { margin-top: 16px; }
    .section-title { font-size: 10pt; border-bottom: 1px solid #14161a; padding-bottom: 3px; margin-bottom: 8px; }
  `,
  'ats-compact': `
    .resume { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.7pt; line-height: 1.3; padding: 34px 40px; }
    .name { font-size: 17pt; }
    .headline { font-size: 10pt; }
    .contact-line { font-size: 8.8pt; margin-top: 4px; }
    .section { margin-top: 11px; }
    .section-title { font-size: 9pt; border-bottom: 1px solid #b9bfc9; padding-bottom: 2px; margin-bottom: 5px; }
    .entry { margin-bottom: 7px; }
    li { margin-bottom: 1px; }
  `,
  'ats-modern': `
    .resume { font-family: Inter, 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; line-height: 1.45; padding: 44px 48px; }
    .name { font-size: 22pt; color: #1a32d6; }
    .headline { font-size: 10.5pt; font-weight: 500; }
    .contact-line { font-size: 9pt; margin-top: 6px; }
    .section { margin-top: 15px; }
    .section-title { font-size: 9.5pt; color: #1a32d6; border-bottom: 2px solid #d9e5ff; padding-bottom: 3px; margin-bottom: 8px; }
  `,
  'ats-technical': `
    .resume { font-family: Inter, Arial, sans-serif; font-size: 10pt; line-height: 1.4; padding: 40px 46px; }
    .name { font-size: 19pt; }
    .headline { font-size: 10pt; font-family: ui-monospace, 'SF Mono', Menlo, monospace; color: #1f40e9; }
    .contact-line { font-size: 9pt; font-family: ui-monospace, Menlo, monospace; margin-top: 5px; }
    .section { margin-top: 14px; }
    .section-title { font-size: 9pt; background: #f1f3f7; padding: 3px 6px; margin-bottom: 7px; }
    .skills { font-family: ui-monospace, Menlo, monospace; font-size: 9pt; }
  `,
  'designed-sidebar': `
    .resume { font-family: Inter, Arial, sans-serif; font-size: 10pt; line-height: 1.45; padding: 0; display: grid; grid-template-columns: 200px 1fr; min-height: 100%; }
    .resume .sidebar { background: #181b22; color: #eceef2; padding: 36px 22px; }
    .resume .sidebar .section-title { color: #8eb2ff; border: 0; }
    .resume .sidebar .skill-cat { color: #fff; }
    .resume .main { padding: 36px 34px; }
    .name { font-size: 20pt; }
    .headline { font-size: 10pt; color: #b1b9c9; }
    .contact-line { font-size: 8.6pt; color: #d5d9e2; margin-top: 10px; line-height: 1.6; }
    .section { margin-top: 16px; }
    .section-title { font-size: 9pt; border-bottom: 1px solid #d5d9e2; padding-bottom: 3px; margin-bottom: 8px; }
  `,
  'designed-editorial': `
    .resume { font-family: Georgia, serif; font-size: 10.5pt; line-height: 1.55; padding: 52px 56px; }
    .name { font-size: 34pt; line-height: 1; letter-spacing: -0.02em; }
    .headline { font-size: 13pt; font-style: italic; color: #535e76; margin-top: 8px; }
    .contact-line { font-size: 9pt; margin-top: 12px; letter-spacing: 0.02em; }
    .summary { font-size: 12pt; line-height: 1.6; column-count: 2; column-gap: 28px; }
    .section { margin-top: 22px; }
    .section-title { font-size: 9pt; letter-spacing: 0.16em; color: #697691; margin-bottom: 10px; }
    .body-grid { column-count: 2; column-gap: 28px; }
  `,
}

export function resumeCss(templateId: TemplateId) {
  return `${BASE_CSS}\n${TEMPLATE_CSS[templateId] ?? TEMPLATE_CSS['ats-classic']}`
}

function contactLine(content: ResumeContent) {
  const parts = [
    content.contact.email,
    content.contact.phone,
    content.contact.location,
    ...content.contact.links.map((l) => l.url.replace(/^https?:\/\//, '')),
  ].filter(Boolean)
  return parts.map(esc).join('  ·  ')
}

/** Inner HTML of the resume body (no <html> wrapper) — used by the live preview. */
export function renderResumeHtml(content: ResumeContent, templateId: TemplateId) {
  const meta = templateMeta(templateId)
  const sections = visibleSections(content).filter((key) => sectionHasContent(content, key))

  const header = `
    <div class="header">
      <div class="name">${esc(content.contact.full_name || 'Your name')}</div>
      ${content.contact.headline ? `<div class="headline">${esc(content.contact.headline)}</div>` : ''}
      <div class="contact-line">${contactLine(content)}</div>
    </div>`

  const renderKeys = (keys: SectionKey[]) =>
    keys
      .map(
        (key) => `
      <div class="section">
        <div class="section-title">${SECTION_LABELS[key]}</div>
        ${renderSectionBody(content, key)}
      </div>`,
      )
      .join('')

  if (meta.id === 'designed-sidebar') {
    const sidebarKeys: SectionKey[] = sections.filter(
      (k) => k === 'skills' || k === 'languages' || k === 'certifications',
    )
    const mainKeys = sections.filter((k) => !sidebarKeys.includes(k))
    return `
      <div class="resume">
        <div class="sidebar">
          ${header}
          ${renderKeys(sidebarKeys)}
        </div>
        <div class="main">${renderKeys(mainKeys)}</div>
      </div>`
  }

  if (meta.id === 'designed-editorial') {
    const lead = sections.filter((k) => k === 'summary')
    const rest = sections.filter((k) => k !== 'summary')
    return `
      <div class="resume">
        ${header}
        ${renderKeys(lead)}
        <div class="body-grid">${renderKeys(rest)}</div>
      </div>`
  }

  return `<div class="resume">${header}${renderKeys(sections)}</div>`
}

/** Standalone document, used for PDF (via print) and DOCX export. */
export function renderResumeDocument(content: ResumeContent, templateId: TemplateId, title: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  ${resumeCss(templateId)}
  @media print { .resume { padding-top: 34px; } }
</style>
</head><body>${renderResumeHtml(content, templateId)}</body></html>`
}

/** Plain text export — §2 "paste-into-form scenarios". */
export function renderResumeText(content: ResumeContent) {
  const out: string[] = []
  const rule = (label: string) => {
    out.push('', label.toUpperCase(), '='.repeat(Math.max(8, label.length)))
  }

  out.push(content.contact.full_name || 'Your name')
  if (content.contact.headline) out.push(content.contact.headline)
  out.push(
    [content.contact.email, content.contact.phone, content.contact.location]
      .filter(Boolean)
      .join(' | '),
  )
  for (const link of content.contact.links) out.push(`${link.label}: ${link.url}`)

  for (const key of visibleSections(content)) {
    if (!sectionHasContent(content, key)) continue
    rule(SECTION_LABELS[key])
    switch (key) {
      case 'summary':
        out.push(content.summary)
        break
      case 'experience':
        for (const exp of sortByOrder(content.experience)) {
          out.push(
            `${exp.title}${exp.company ? `, ${exp.company}` : ''}${
              exp.location ? ` (${exp.location})` : ''
            }`,
          )
          out.push(dateRange(exp.start_date, exp.end_date, exp.is_current))
          for (const b of sortByOrder(exp.bullets)) {
            const text = stripHtml(b.html).trim()
            if (text) out.push(`- ${text}`)
          }
          out.push('')
        }
        break
      case 'education':
        for (const edu of sortByOrder(content.education)) {
          out.push(
            `${edu.degree}${edu.field ? `, ${edu.field}` : ''}${edu.school ? ` — ${edu.school}` : ''} (${dateRange(
              edu.start_date,
              edu.end_date,
              false,
            )})${edu.grade ? ` — ${edu.grade}` : ''}`,
          )
        }
        break
      case 'skills':
        for (const g of sortByOrder(content.skills)) out.push(`${g.category}: ${g.skills.join(', ')}`)
        break
      case 'projects':
        for (const p of sortByOrder(content.projects)) {
          out.push(`${p.name}${p.role ? `, ${p.role}` : ''}${p.url ? ` — ${p.url}` : ''}`)
          if (p.description) out.push(p.description)
          for (const b of sortByOrder(p.bullets)) {
            const text = stripHtml(b.html).trim()
            if (text) out.push(`- ${text}`)
          }
          out.push('')
        }
        break
      case 'certifications':
        for (const c of sortByOrder(content.certifications)) {
          out.push(`${c.name}${c.issuer ? ` — ${c.issuer}` : ''}${c.issued_on ? ` (${c.issued_on})` : ''}`)
        }
        break
      case 'languages':
        out.push(sortByOrder(content.languages).map((l) => `${l.language} (${l.proficiency})`).join(', '))
        break
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
