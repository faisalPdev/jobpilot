import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ResumeDocument } from '@/types'
import { DOC_FONTS, sanitizeDocumentHtml, splitLineHtml } from '@/lib/doc/sanitize'
import { mmToPx, documentCss, pageGeometry } from '@/lib/doc/render'
import { cn } from '@/lib/utils'
import { toast } from '@/store/toast'
import { Button } from '@/components/ui/primitives'
import { Field, Input } from '@/components/ui/inputs'
import { Modal } from '@/components/ui/overlays'
import { DocumentToolbar, type ToolbarAction, type ToolbarState } from './DocumentToolbar'

export interface DocumentEditorHandle {
  /** Scrolls the nth heading in the document into view (used by the outline). */
  scrollToHeading: (index: number) => void
  focus: () => void
}

const EMPTY_STATE: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  ul: false,
  ol: false,
  align: 'left',
  block: 'p',
  fontFamily: '',
  fontSizePt: 11,
}

/** Legacy slot the `fontSize` command writes into before we rewrite it to pt. */
const SIZE_SLOT = '7'
const MAX_IMAGE_BYTES = 1_500_000

/**
 * Freeform document editor — a page, a caret and a ribbon.
 *
 * Two decisions worth knowing before changing anything here:
 *
 * 1. **The DOM owns the text while the editor has focus.** React only writes into
 *    the editable when the value changed elsewhere (a version restore, a
 *    conversion). Re-rendering it from state on every keystroke would reset the
 *    caret, which is the classic way contenteditable editors get this wrong.
 * 2. **`document.execCommand` is deprecated but not replaced.** The proposed
 *    successor never shipped, every browser still implements this, and it is what
 *    gives us a native undo stack that survives our own DOM rewrites. The one
 *    thing it does badly — emitting `<font size="7">` — is normalised away below.
 */
export const DocumentEditor = forwardRef<DocumentEditorHandle, {
  doc: ResumeDocument
  onChange: (doc: ResumeDocument) => void
  onSave?: () => void
  onPagesChange?: (pages: number) => void
  zoom: number
  onZoom: (zoom: number) => void
  readOnly?: boolean
  className?: string
}>(function DocumentEditor(
  { doc, onChange, onSave, onPagesChange, zoom, onZoom, readOnly = false, className },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedRange = useRef<Range | null>(null)
  const lastHtml = useRef<string | null>(null)

  const [state, setState] = useState<ToolbarState>(EMPTY_STATE)
  const [contentHeight, setContentHeight] = useState(0)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const geo = pageGeometry(doc.page)
  const marginPx = mmToPx(doc.page.margin_mm)
  const pageContentPx = Math.max(120, geo.height_px - marginPx * 2)
  const pages = Math.max(1, Math.ceil((contentHeight || 1) / pageContentPx))
  const sheetHeight = marginPx * 2 + pages * pageContentPx

  const css = useMemo(() => documentCss(doc.page), [doc.page])

  /* ------------------------------------------------------------- syncing */

  useEffect(() => {
    const node = sheetRef.current
    if (!node) return
    if (doc.html !== lastHtml.current && doc.html !== node.innerHTML) {
      node.innerHTML = doc.html
      lastHtml.current = doc.html
    }
  }, [doc.html])

  const commit = useCallback(
    (sanitize = false) => {
      const node = sheetRef.current
      if (!node) return
      const next = sanitize ? sanitizeDocumentHtml(node.innerHTML) : node.innerHTML
      if (sanitize && next !== node.innerHTML) node.innerHTML = next
      if (next === lastHtml.current) return
      lastHtml.current = next
      onChange({ ...doc, html: next })
    },
    [doc, onChange],
  )

  /* ------------------------------------------------- selection reporting */

  const readState = useCallback(() => {
    const node = sheetRef.current
    const selection = window.getSelection()
    if (!node || !selection || selection.rangeCount === 0) return
    const anchor = selection.anchorNode
    if (!anchor || !node.contains(anchor)) return

    // The ribbon's dropdowns take focus when they open, which drops the caret.
    // Keeping the last in-document range lets every command put it back.
    savedRange.current = selection.getRangeAt(0).cloneRange()

    const element = (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement) ?? node
    const block = element.closest('h1, h2, h3, p, li, blockquote, td, th')
    const computed = window.getComputedStyle(element)
    const tag = block?.tagName.toLowerCase() ?? 'p'

    const query = (command: string) => {
      try {
        return document.queryCommandState(command)
      } catch {
        return false
      }
    }

    setState({
      bold: query('bold'),
      italic: query('italic'),
      underline: query('underline'),
      strike: query('strikeThrough'),
      ul: query('insertUnorderedList'),
      ol: query('insertOrderedList'),
      align: query('justifyCenter')
        ? 'center'
        : query('justifyRight')
          ? 'right'
          : query('justifyFull')
            ? 'justify'
            : 'left',
      // A list item reads as normal text, the way it does in every word processor.
      block: tag === 'li' || tag === 'td' || tag === 'th' || tag === 'blockquote' ? 'p' : tag,
      fontFamily: matchFontFamily(computed.fontFamily) ?? '',
      fontSizePt: Math.round(parseFloat(computed.fontSize) * 0.75 * 10) / 10,
    })
  }, [])

  useEffect(() => {
    const handler = () => readState()
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [readState])

  /* ------------------------------------------------------ height / pages */

  // The editable is left at its natural height and a filler below it takes the
  // rest of the sheet, so `scrollHeight` is the true height of the text. Putting
  // a min-height on the editable itself would make the page count ratchet up and
  // never come back down when text is deleted.
  useEffect(() => {
    const node = sheetRef.current
    if (!node) return
    const measure = () => setContentHeight(node.scrollHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    onPagesChange?.(pages)
  }, [pages, onPagesChange])

  useImperativeHandle(ref, () => ({
    scrollToHeading(index: number) {
      const headings = sheetRef.current?.querySelectorAll('h1, h2, h3')
      headings?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    focus() {
      sheetRef.current?.focus()
    },
  }))

  /* ----------------------------------------------------------- commands */

  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount && sheetRef.current?.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange()
    }
  }

  const restoreSelection = () => {
    const node = sheetRef.current
    if (!node) return
    node.focus()
    const selection = window.getSelection()
    if (selection && selection.rangeCount && node.contains(selection.anchorNode)) return
    const range = savedRange.current
    // A sanitising commit can replace the nodes the range pointed at.
    if (!range || !node.contains(range.commonAncestorContainer)) return
    try {
      selection?.removeAllRanges()
      selection?.addRange(range)
    } catch {
      /* the range went stale — the caret just stays where the browser put it */
    }
  }

  const exec = useCallback(
    (command: string, value?: string, css = false) => {
      const node = sheetRef.current
      if (!node || readOnly) return
      restoreSelection()
      try {
        document.execCommand('styleWithCSS', false, css ? 'true' : 'false')
        document.execCommand(command, false, value)
      } catch {
        /* an unsupported command is a no-op, not a crash */
      }
      normalizeFontElements(node)
      commit()
      readState()
    },
    [commit, readState, readOnly],
  )

  const insertImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('That image is too large', 'Every save stores a full snapshot — keep images under 1.5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      restoreSelection()
      exec('insertImage', String(reader.result))
    }
    reader.readAsDataURL(file)
  }

  const applyBoxStyle = useCallback(
    (mutate: (el: HTMLElement) => void) => {
      const node = sheetRef.current
      if (!node || readOnly) return
      restoreSelection()
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      const anchor = selection.anchorNode
      if (!anchor || !node.contains(anchor)) return
      const start = (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement) as Element | null
      if (!start) return
      // Prefer the cell when editing a table; otherwise the nearest block; fall
      // back to a wrapping table so a whole grid can be restyled in one go.
      const target = (start.closest('td, th') ||
        start.closest('p, h1, h2, h3, blockquote, div, li') ||
        start.closest('table')) as HTMLElement | null
      if (!target || !node.contains(target)) return
      mutate(target)
      commit(true)
      readState()
    },
    [commit, readOnly, readState],
  )

  const onAction = (action: ToolbarAction) => {
    switch (action.type) {
      case 'exec':
        exec(action.command, action.value)
        break
      case 'block':
        exec('formatBlock', action.value)
        break
      case 'fontFamily':
        exec('fontName', action.value, true)
        break
      case 'fontSize': {
        const node = sheetRef.current
        if (!node || readOnly) break
        restoreSelection()
        document.execCommand('styleWithCSS', false, 'false')
        document.execCommand('fontSize', false, SIZE_SLOT)
        node.querySelectorAll('font[size="' + SIZE_SLOT + '"]').forEach((el) => {
          const span = document.createElement('span')
          span.style.fontSize = action.value + 'pt'
          while (el.firstChild) span.appendChild(el.firstChild)
          el.replaceWith(span)
        })
        commit()
        readState()
        break
      }
      case 'color':
        exec('foreColor', action.value, true)
        break
      case 'border':
        applyBoxStyle((el) => {
          // Keep an explicit `border` declaration so the stylesheet's default
          // table grid does not reappear after "None".
          if (action.widthPt <= 0) {
            el.style.border = 'none'
            return
          }
          const color = action.color ?? '#14161a'
          el.style.border = action.widthPt + 'pt solid ' + color
        })
        break
      case 'padding':
        applyBoxStyle((el) => {
          el.style.padding = action.valuePt <= 0 ? '0' : action.valuePt + 'pt'
        })
        break
      case 'splitLine': {
        const selection = window.getSelection()
        restoreSelection()
        const block =
          (selection?.anchorNode &&
            ((selection.anchorNode.nodeType === 1
              ? (selection.anchorNode as Element)
              : selection.anchorNode.parentElement
            )?.closest('p, h1, h2, h3') as HTMLElement | null)) ||
          null
        if (block && sheetRef.current?.contains(block)) {
          // Turn the current line into left | right at the caret.
          document.execCommand('insertText', false, '\t')
          commit(true)
        } else {
          exec('insertHTML', splitLineHtml('Company or school', 'Location or dates'))
        }
        readState()
        break
      }
      case 'link':
        saveSelection()
        setLinkUrl(currentLinkHref() ?? '')
        setLinkOpen(true)
        break
      case 'unlink':
        exec('unlink')
        break
      case 'rule':
        exec('insertHorizontalRule')
        break
      case 'image':
        saveSelection()
        fileRef.current?.click()
        break
      case 'clear':
        exec('removeFormat')
        exec('formatBlock', 'p')
        break
    }
  }

  const applyLink = () => {
    const url = linkUrl.trim()
    setLinkOpen(false)
    restoreSelection()
    if (!url) {
      exec('unlink')
      return
    }
    const selection = window.getSelection()
    if (selection?.isCollapsed) {
      // No selection: insert the URL as its own link rather than doing nothing.
      exec('insertHTML', '<a href="' + escapeAttr(url) + '">' + escapeText(url) + '</a>')
      return
    }
    exec('createLink', url)
  }

  /* -------------------------------------------------------------- render */

  return (
    <div ref={rootRef} className={cn('flex min-h-0 flex-col gap-3', className)}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <DocumentToolbar
        state={state}
        page={doc.page}
        zoom={zoom}
        onZoom={onZoom}
        onAction={onAction}
        onPageChange={(page) => onChange({ ...doc, page })}
        disabled={readOnly}
      />

      <div className="doc-canvas scrollbar-thin min-h-[26rem] flex-1 overflow-auto rounded-xl border border-ink-200 bg-ink-100 p-6">
        <div
          className="relative mx-auto"
          style={{ width: geo.width_px * zoom, height: sheetHeight * zoom }}
        >
          <div
            className="doc-sheet absolute left-0 top-0 flex flex-col bg-paper shadow-pop"
            style={{
              width: geo.width_px,
              height: sheetHeight,
              padding: marginPx,
              transform: 'scale(' + zoom + ')',
              transformOrigin: 'top left',
            }}
          >
            {/* Margin guides — the grey gutter is page margin, not indent. */}
            <div
              className="pointer-events-none absolute inset-0 border border-dashed border-ink-200/80"
              style={{ margin: marginPx }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute left-0 top-0 z-10 rounded-br bg-ink-100/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-500"
              aria-hidden
            >
              {doc.page.margin_mm} mm margin
            </div>

            {/* Page-break guides. The PDF export paginates for real; these show
                where the breaks will land while you are still typing. */}
            {Array.from({ length: pages - 1 }, (_, i) => (
              <div
                key={i}
                className="doc-guide"
                style={{ top: marginPx + (i + 1) * pageContentPx }}
                aria-hidden
              >
                <span>page {i + 2}</span>
              </div>
            ))}

            <div
              ref={sheetRef}
              className="doc doc-editable"
              contentEditable={!readOnly}
              suppressContentEditableWarning
              spellCheck
              role="textbox"
              aria-multiline="true"
              aria-label="Resume document"
              onInput={() => commit()}
              onBlur={(e) => commit(!rootRef.current?.contains(e.relatedTarget as Node | null))}
              onKeyUp={readState}
              onMouseUp={readState}
              onPaste={(e) => {
                e.preventDefault()
                const html = e.clipboardData.getData('text/html')
                const text = e.clipboardData.getData('text/plain')
                if (html) {
                  document.execCommand('insertHTML', false, sanitizeDocumentHtml(html, { paste: true }))
                } else if (text) {
                  if (text.includes('\t')) {
                    const lines = text.replace(/\r\n/g, '\n').split('\n')
                    const asHtml = lines
                      .map((line) => {
                        if (!line.includes('\t')) {
                          return '<p>' + escapeText(line || '') + (line ? '' : '<br>') + '</p>'
                        }
                        const [left, ...rest] = line.split('\t')
                        return splitLineHtml(left.trim(), rest.join(' ').trim())
                      })
                      .join('')
                    document.execCommand('insertHTML', false, sanitizeDocumentHtml(asHtml, { paste: true }))
                  } else {
                    document.execCommand('insertText', false, text)
                  }
                }
                commit()
                readState()
              }}
              onDrop={(e) => {
                const file = e.dataTransfer.files?.[0]
                if (!file) return
                e.preventDefault()
                saveSelection()
                insertImageFile(file)
              }}
              onKeyDown={(e) => {
                const meta = e.metaKey || e.ctrlKey
                if (meta && e.key.toLowerCase() === 's') {
                  e.preventDefault()
                  commit(true)
                  onSave?.()
                  return
                }
                if (meta && e.key.toLowerCase() === 'k') {
                  e.preventDefault()
                  onAction({ type: 'link' })
                  return
                }
                if (e.key === 'Tab') {
                  e.preventDefault()
                  // In a list, Tab indents. Elsewhere it acts like Google Docs'
                  // right-tab: text after the caret jumps to the right margin.
                  if (state.ul || state.ol || e.shiftKey) {
                    exec(e.shiftKey ? 'outdent' : 'indent')
                    return
                  }
                  document.execCommand('insertText', false, '\t')
                  commit(true)
                  readState()
                  return
                }
                if (e.key === 'Enter' && !e.shiftKey && /^h[123]$/.test(state.block)) {
                  // Headings should not run on: the next paragraph is body text.
                  window.setTimeout(() => {
                    document.execCommand('formatBlock', false, 'p')
                    commit()
                    readState()
                  }, 0)
                }
              }}
            />

            {/* Clicking the empty part of the sheet should put the caret at the
                end of the document, the way it does in any word processor. */}
            <div
              className="min-h-0 flex-1 cursor-text"
              aria-hidden
              onMouseDown={(e) => {
                e.preventDefault()
                const node = sheetRef.current
                if (!node || readOnly) return
                node.focus()
                const range = document.createRange()
                range.selectNodeContents(node)
                range.collapse(false)
                const selection = window.getSelection()
                selection?.removeAllRanges()
                selection?.addRange(range)
                readState()
              }}
            />
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) insertImageFile(file)
          e.target.value = ''
        }}
      />

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Link"
        subtitle="Leave it empty to remove the link."
        size="sm"
        footer={
          <>
            <Button onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={applyLink}>
              Apply
            </Button>
          </>
        }
      >
        <Field label="URL">
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="linkedin.com/in/you"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink()
            }}
          />
        </Field>
      </Modal>
    </div>
  )
})

/* ----------------------------------------------------------------- helpers */

function escapeText(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string) {
  return escapeText(s).replace(/"/g, '&quot;')
}

/** `execCommand('fontName')` still emits `<font face>` in WebKit. Rewrite it. */
function normalizeFontElements(root: HTMLElement) {
  root.querySelectorAll('font').forEach((el) => {
    const span = document.createElement('span')
    const face = el.getAttribute('face')
    const color = el.getAttribute('color')
    const size = el.getAttribute('size')
    if (face) span.style.fontFamily = face
    if (color) span.style.color = color
    if (size && size === SIZE_SLOT) span.style.fontSize = '11pt'
    while (el.firstChild) span.appendChild(el.firstChild)
    el.replaceWith(span)
  })
}

/** Maps a computed font stack back onto the entry the font menu offers. */
function matchFontFamily(computed: string) {
  const first = computed.split(',')[0]?.replace(/["']/g, '').trim().toLowerCase()
  if (!first) return null
  return DOC_FONTS.find((f) => f.value.split(',')[0].replace(/["']/g, '').trim().toLowerCase() === first)?.value ?? null
}

function currentLinkHref() {
  const selection = window.getSelection()
  const node = selection?.anchorNode
  const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement
  return element?.closest('a')?.getAttribute('href') ?? null
}
