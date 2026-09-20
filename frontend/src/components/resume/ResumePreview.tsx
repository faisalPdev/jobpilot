import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResumeContent, TemplateId } from '@/types'
import { renderResumeHtml, resumeCss } from '@/lib/export/render'
import { cn } from '@/lib/utils'

const A4_WIDTH = 794 // px at 96dpi
const A4_HEIGHT = 1123

/**
 * Live preview that renders the *same* markup and CSS the PDF export uses, so
 * what the user sees is what the export produces. Isolated in an iframe because
 * the templates set their own typography and must not inherit the app's.
 */
export function ResumePreview({
  content,
  templateId,
  className,
  fit = true,
}: {
  content: ResumeContent
  templateId: TemplateId
  className?: string
  fit?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const doc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;padding:0;background:#fff;}
        ${resumeCss(templateId)}
      </style></head><body>${renderResumeHtml(content, templateId)}</body></html>`,
    [content, templateId],
  )

  useEffect(() => {
    if (!fit) return
    const el = wrapRef.current
    if (!el) return
    const measure = () => setScale(Math.min(1, el.clientWidth / A4_WIDTH))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [fit])

  return (
    <div ref={wrapRef} className={cn('resume-preview w-full', className)}>
      <div
        className="mx-auto overflow-hidden rounded-lg border border-ink-200 bg-paper shadow-card"
        style={{
          width: A4_WIDTH * scale,
          height: A4_HEIGHT * scale,
        }}
      >
        <iframe
          title="Resume preview"
          srcDoc={doc}
          sandbox=""
          className="border-0"
          style={{
            width: A4_WIDTH,
            height: A4_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  )
}
