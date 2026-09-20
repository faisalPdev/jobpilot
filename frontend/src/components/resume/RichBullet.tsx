import { useEffect, useRef } from 'react'
import { cn, sanitizeInlineHtml, stripHtml } from '@/lib/utils'

/**
 * Deliberately constrained rich-text bullet (spec §2).
 *
 * Bold and italic only — no font sizes, colours, tables or nested markup — because
 * everything here has to survive a PDF export and then an ATS text extraction.
 * Paste is sanitised down to the same whitelist, so pasting from Word cannot
 * smuggle in markup that breaks the parse.
 */
export function RichBullet({
  html,
  onChange,
  onEnter,
  onBackspaceEmpty,
  placeholder = 'Describe the impact, with a number where you have one…',
  className,
  readOnly = false,
}: {
  html: string
  onChange: (html: string) => void
  onEnter?: () => void
  onBackspaceEmpty?: () => void
  placeholder?: string
  className?: string
  readOnly?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  // `null` until first paint, so the initial value gets written in.
  const lastHtml = useRef<string | null>(null)

  // The DOM owns the text while the field has focus; React only writes when the
  // value changed somewhere else (an accepted AI rewrite, a version restore).
  // Rendering it via children/dangerouslySetInnerHTML instead would reset the
  // caret on every keystroke.
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (html !== lastHtml.current && html !== node.innerHTML) {
      node.innerHTML = html
      lastHtml.current = html
    }
  }, [html])

  /**
   * While typing, report the DOM's own markup untouched. Sanitising per keystroke
   * would rewrite the value React then writes back (a trailing space gets trimmed,
   * for instance), which yanks the caret to the end mid-word. Normalisation
   * happens on blur and on paste, where a reset is invisible.
   */
  const commit = (sanitize = false) => {
    const node = ref.current
    if (!node) return
    const next = sanitize ? sanitizeInlineHtml(node.innerHTML) : node.innerHTML
    lastHtml.current = next
    onChange(next)
  }

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="false"
      tabIndex={0}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={cn('rich-bullet', readOnly && 'cursor-default', className)}
      onInput={() => commit()}
      onBlur={() => commit(true)}
      onPaste={(e) => {
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text.replace(/\s+/g, ' ').trim())
        commit(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(true)
          onEnter?.()
          return
        }
        if (e.key === 'Backspace' && !stripHtml(ref.current?.innerHTML ?? '').trim()) {
          e.preventDefault()
          onBackspaceEmpty?.()
          return
        }
        // Keep the two allowed formats on their standard shortcuts.
        if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i')) {
          e.preventDefault()
          document.execCommand(e.key === 'b' ? 'bold' : 'italic')
          commit()
        }
      }}
    />
  )
}

export function BulletToolbar({ onFormat }: { onFormat: (cmd: 'bold' | 'italic') => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          onFormat('bold')
        }}
        className="h-6 w-6 rounded text-xs font-bold text-ink-500 hover:bg-ink-100 hover:text-ink-800"
        title="Bold (Ctrl/Cmd+B)"
      >
        B
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          onFormat('italic')
        }}
        className="h-6 w-6 rounded text-xs italic text-ink-500 hover:bg-ink-100 hover:text-ink-800"
        title="Italic (Ctrl/Cmd+I)"
      >
        I
      </button>
    </div>
  )
}
