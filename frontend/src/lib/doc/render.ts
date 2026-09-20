/**
 * Renderers for freeform document mode.
 *
 * The same CSS string drives the on-screen sheet and the PDF/DOCX export, so the
 * editor is genuinely WYSIWYG rather than approximately so. Sizes are declared
 * in points: a browser resolves `10.5pt` to px at 96dpi on screen and to real
 * points on paper, which is exactly the behaviour we want from one stylesheet.
 */
import type { DocumentPage, PageSize, ResumeDocument } from '@/types'
import { download, slugify } from '../utils'
import { DOC_FONTS, documentToText, sanitizeDocumentHtml } from './sanitize'

export interface PageGeometry {
  label: string
  /** Millimetres. */
  width_mm: number
  height_mm: number
  /** CSS px at 96dpi — what the on-screen sheet is sized with. */
  width_px: number
  height_px: number
}

const MM_PER_PX = 25.4 / 96

export const PAGE_SIZES: Record<PageSize, PageGeometry> = {
  a4: { label: 'A4 · 210 × 297 mm', width_mm: 210, height_mm: 297, width_px: 794, height_px: 1123 },
  letter: { label: 'Letter · 8.5 × 11 in', width_mm: 215.9, height_mm: 279.4, width_px: 816, height_px: 1056 },
}

export const MARGIN_PRESETS = [
  { label: 'Minimal (5 mm)', value: 5 },
  { label: 'Narrow (10 mm)', value: 10 },
  { label: 'Normal (15 mm)', value: 15 },
  { label: 'Comfortable (18 mm)', value: 18 },
  { label: 'Wide (25 mm)', value: 25 },
  { label: 'Extra wide (30 mm)', value: 30 },
]

/** Multipliers applied as `line-height` on the document body. */
export const LINE_SPACING_PRESETS = [
  { label: 'Single', value: 1 },
  { label: 'Tight', value: 1.15 },
  { label: 'Snug', value: 1.3 },
  { label: 'Normal', value: 1.45 },
  { label: 'Relaxed', value: 1.6 },
  { label: 'Loose', value: 1.8 },
  { label: 'Double', value: 2 },
]

/**
 * Multipliers applied as the bottom margin of a paragraph.
 *
 * Line spacing and paragraph spacing are different things and a document needs
 * both: line spacing is the leading inside a paragraph, and has nothing to act
 * on when a paste produced one paragraph per line — which is what Google Docs
 * does. Then every gap on the page is this value instead.
 */
export const PARAGRAPH_SPACING_PRESETS = [
  { label: 'None', value: 0 },
  { label: 'Tight', value: 0.25 },
  { label: 'Normal', value: 0.5 },
  { label: 'Relaxed', value: 0.85 },
  { label: 'Loose', value: 1.2 },
]

/** What `.doc p` used before the setting existed; keeps old documents put. */
export const DEFAULT_PARAGRAPH_SPACING = 0.5

/** Paragraph spacing for a page, tolerating documents saved without one. */
export function paragraphSpacing(page: DocumentPage) {
  const value = page.paragraph_spacing
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_PARAGRAPH_SPACING
}

export function defaultDocumentPage(): DocumentPage {
  return {
    size: 'a4',
    margin_mm: 18,
    font_family: DOC_FONTS[1].value,
    font_size_pt: 10.5,
    line_height: 1.45,
    paragraph_spacing: DEFAULT_PARAGRAPH_SPACING,
  }
}

export function mmToPx(mm: number) {
  return Math.round(mm / MM_PER_PX)
}

export function pageGeometry(page: DocumentPage) {
  return PAGE_SIZES[page.size] ?? PAGE_SIZES.a4
}

/**
 * Typography for the document body, scoped to `.doc`.
 *
 * Every element is given explicit margins because the app's Tailwind preflight
 * zeroes them: relying on UA defaults would make the editor and the export drift
 * apart the moment one of them is not inside the app shell.
 */
export function documentCss(page: DocumentPage) {
  const em = (n: number) => n.toFixed(3) + 'em'
  return [
    '.doc {',
    '  font-family: ' + page.font_family + ';',
    '  font-size: ' + page.font_size_pt + 'pt;',
    '  line-height: ' + page.line_height + ';',
    '  color: #14161a;',
    '  text-align: left;',
    '  word-wrap: break-word;',
    '}',
    '.doc > *:first-child { margin-top: 0; }',
    '.doc p { margin: 0 0 ' + em(paragraphSpacing(page)) + '; }',
    '.doc h1 { font-size: ' + em(1.95) + '; line-height: 1.15; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 ' + em(0.15) + '; }',
    '.doc h2 { font-size: ' + em(1.06) + '; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; ' +
      'border-bottom: 1px solid #14161a; padding-bottom: 2px; margin: ' + em(1.05) + ' 0 ' + em(0.45) + '; }',
    '.doc h3 { font-size: ' + em(1) + '; font-weight: 700; margin: ' + em(0.6) + ' 0 ' + em(0.15) + '; }',
    // Tailwind's preflight zeroes list markers and turns images into blocks;
    // the document has to opt back in or the editor and the export disagree.
    // Outside markers need enough padding or they clip against the page edge
    // (especially when page margins are tight or Word pasted padding-left: 0).
    '.doc ul, .doc ol { margin: ' + em(0.2) + ' 0 ' + em(0.6) + '; padding-left: ' + em(1.75) + '; }',
    '.doc ul { list-style: disc outside; }',
    '.doc ol { list-style: decimal outside; }',
    '.doc ul ul { list-style: circle outside; padding-left: ' + em(1.45) + '; }',
    '.doc ol ol { list-style: lower-alpha outside; padding-left: ' + em(1.45) + '; }',
    '.doc li { margin: 0 0 ' + em(0.14) + '; padding-left: 0.15em; }',
    '.doc li::marker { color: inherit; }',
    '.doc li > p { margin: 0; }',
    '.doc i, .doc em { font-style: italic; }',
    '.doc u { text-decoration: underline; }',
    // Google Docs–style left/right lines (company + location, title + dates).
    '.doc p[style*="space-between"] > span:last-child { text-align: right; }',
    '.doc blockquote { margin: ' + em(0.5) + ' 0; padding-left: ' + em(0.8) + '; border-left: 2px solid #c8ccd4; color: #3d4553; }',
    '.doc hr { border: 0; border-top: 1px solid #c8ccd4; margin: ' + em(0.8) + ' 0; }',
    '.doc a { color: inherit; text-decoration: underline; }',
    '.doc img { max-width: 100%; height: auto; display: inline-block; vertical-align: top; }',
    '.doc table { border-collapse: collapse; width: 100%; margin: ' + em(0.5) + ' 0; }',
    '.doc td, .doc th { padding: 3px 6px; vertical-align: top; text-align: left; }',
    // Default grid only when the cell did not bring its own border from a paste.
    // Inline border styles must win so DOCX tables keep their exact look.
    '.doc td:not([style*="border"]), .doc th:not([style*="border"]) { border: 1px solid #c8ccd4; }',
    '.doc b, .doc strong { font-weight: 700; }',
    // Page breaks that a print engine can honour and a screen renderer ignores.
    '.doc h1, .doc h2, .doc h3 { break-after: avoid-page; page-break-after: avoid; }',
    '.doc li, .doc p { break-inside: avoid-page; }',
  ].join('\n')
}

/** Body markup only — used by both the editor sheet and the export document. */
export function renderDocumentHtml(doc: ResumeDocument) {
  return '<div class="doc">' + sanitizeDocumentHtml(doc.html) + '</div>'
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Standalone printable document. Margins are real `@page` margins rather than
 * padding, so the browser paginates a three-page CV correctly instead of
 * clipping it at the first sheet.
 */
export function renderDocumentDocument(doc: ResumeDocument, title: string) {
  const geo = pageGeometry(doc.page)
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8" />',
    '<title>' + esc(title) + '</title>',
    '<style>',
    '  @page { size: ' + geo.width_mm + 'mm ' + geo.height_mm + 'mm; margin: ' + doc.page.margin_mm + 'mm; }',
    '  html, body { margin: 0; padding: 0; background: #fff; }',
    '  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    documentCss(doc.page),
    '  @media screen { body { padding: ' + doc.page.margin_mm + 'mm; max-width: ' + geo.width_mm + 'mm; margin: 0 auto; } }',
    '</style>',
    '</head><body>' + renderDocumentHtml(doc) + '</body></html>',
  ].join('\n')
}

/** PDF via the browser's own print-to-PDF, mirroring `exportResumePdf`. */
export function exportDocumentPdf(doc: ResumeDocument, title: string) {
  const html = renderDocumentDocument(doc, title)
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '210mm'
  frame.style.height = '297mm'
  frame.style.opacity = '0'
  frame.style.pointerEvents = 'none'
  document.body.appendChild(frame)

  const target = frame.contentDocument
  if (!target) {
    frame.remove()
    throw new Error('Could not open a print frame — check the browser popup settings.')
  }
  target.open()
  target.write(html)
  target.close()

  const finish = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1500)
  }
  if (frame.contentWindow?.document.readyState === 'complete') setTimeout(finish, 120)
  else frame.onload = () => setTimeout(finish, 120)
}

export function exportDocumentDocx(doc: ResumeDocument, title: string) {
  const html = renderDocumentDocument(doc, title).replace(
    '<head>',
    '<head><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->',
  )
  download(slugify(title) + '.doc', html, 'application/msword')
}

export function exportDocumentHtmlFile(doc: ResumeDocument, title: string) {
  download(slugify(title) + '.html', renderDocumentDocument(doc, title), 'text/html;charset=utf-8')
}

export function exportDocumentTxt(doc: ResumeDocument, title: string) {
  download(slugify(title) + '.txt', documentToText(doc.html), 'text/plain;charset=utf-8')
}
