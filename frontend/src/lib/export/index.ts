import type { ResumeContent, TemplateId } from '@/types'
import { download, slugify } from '../utils'
import { renderResumeDocument, renderResumeText } from './render'

export * from './render'
export * from './templates'

/**
 * PDF export. In production this is server-rendered (headless Chromium) so the
 * exact bytes can be frozen as an application attachment (§4). Client-side we hand
 * the document to the browser's own print-to-PDF, which produces the same layout
 * from the same CSS.
 */
export function exportResumePdf(content: ResumeContent, templateId: TemplateId, title: string) {
  const html = renderResumeDocument(content, templateId, title)
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '210mm'
  frame.style.height = '297mm'
  frame.style.opacity = '0'
  frame.style.pointerEvents = 'none'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  if (!doc) {
    document.body.removeChild(frame)
    throw new Error('Could not open a print frame — check the browser popup settings.')
  }
  doc.open()
  doc.write(html)
  doc.close()

  const finish = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1500)
  }
  if (frame.contentWindow?.document.readyState === 'complete') setTimeout(finish, 120)
  else frame.onload = () => setTimeout(finish, 120)
}

/**
 * DOCX export. A real .docx is a zip of OOXML parts, which needs a zip writer;
 * Word opens an HTML-flavoured .doc losslessly enough for editing, so that is what
 * we emit client-side. The backend endpoint (GET /resumes/{id}/export?format=docx)
 * returns a true OOXML file.
 */
export function exportResumeDocx(content: ResumeContent, templateId: TemplateId, title: string) {
  const html = renderResumeDocument(content, templateId, title)
  const withWordMeta = html.replace(
    '<head>',
    `<head><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->`,
  )
  download(`${slugify(title)}.doc`, withWordMeta, 'application/msword')
}

export function exportResumeTxt(content: ResumeContent, title: string) {
  download(`${slugify(title)}.txt`, renderResumeText(content), 'text/plain;charset=utf-8')
}

export function exportResumeJson(content: ResumeContent, title: string) {
  download(`${slugify(title)}.json`, JSON.stringify(content, null, 2), 'application/json')
}
