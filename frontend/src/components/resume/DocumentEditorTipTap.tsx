import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { ResumeDocument } from '@/types'
import { documentExtensions } from '@/lib/doc/tiptapSchema'
import { applyToolbarAction, toolbarStateFromEditor } from '@/lib/doc/tiptapToolbar'
import { preparePastedHtml } from '@/lib/doc/sanitize'
import { documentCss, mmToPx, pageGeometry } from '@/lib/doc/render'
import { cn } from '@/lib/utils'
import { toast } from '@/store/toast'
import { Button } from '@/components/ui/primitives'
import { Field, Input } from '@/components/ui/inputs'
import { Modal } from '@/components/ui/overlays'
import { DocumentToolbar, type ToolbarState } from './DocumentToolbar'

export interface DocumentEditorHandle {
  scrollToHeading: (index: number) => void
  focus: () => void
}

const MAX_IMAGE_BYTES = 1_500_000

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

/**
 * Document editor on a Tiptap schema.
 *
 * Only the engine changes. The page — geometry, margins, the margin guide, the
 * page-break guides, zoom, and the height measurement that drives the page
 * count — is the same as the contenteditable editor, `documentCss` styles both,
 * and the document is still stored as the HTML string every other module reads,
 * so the exporter, the ATS checks and the outline are untouched.
 *
 * What it buys: a real undo stack, commands instead of twelve deprecated
 * `execCommand` calls, and a parser that can only produce declared nodes and
 * attributes — so the pasted `line-height` and `font-size` that kept escaping
 * the whitelist have nowhere left to live.
 */
export const DocumentEditorTipTap = forwardRef<
  DocumentEditorHandle,
  {
    doc: ResumeDocument
    onChange: (doc: ResumeDocument) => void
    onSave?: () => void
    onPagesChange?: (pages: number) => void
    zoom: number
    onZoom: (zoom: number) => void
    readOnly?: boolean
    className?: string
  }
>(function DocumentEditorTipTap(
  { doc, onChange, onSave, onPagesChange, zoom, onZoom, readOnly = false, className },
  ref,
) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
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

  const editor = useEditor({
    extensions: documentExtensions,
    content: doc.html,
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'doc doc-editable', spellcheck: 'true' },
      transformPastedHTML: (html) => preparePastedHtml(html),
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      lastHtml.current = html
      onChange({ ...doc, html })
    },
    onSelectionUpdate: ({ editor }) =>
      setState(toolbarStateFromEditor(editor, doc.page.font_size_pt)),
    onTransaction: ({ editor }) =>
      setState(toolbarStateFromEditor(editor, doc.page.font_size_pt)),
  })

  // A version restore or a mode switch replaces the document underneath us.
  // Writing it back while the user types would fight the caret, so this only
  // runs for a change that did not come from this editor.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (doc.html === lastHtml.current) return
    lastHtml.current = doc.html
    editor.commands.setContent(doc.html, { emitUpdate: false })
  }, [doc.html, editor])

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!readOnly)
  }, [editor, readOnly])

  // The editable keeps its natural height and a filler below it fills the sheet,
  // so `scrollHeight` is the true height of the text. A min-height on the
  // editable would make the page count ratchet up and never come back down.
  useEffect(() => {
    const node = sheetRef.current
    if (!node) return
    const measure = () => setContentHeight(node.scrollHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [editor])

  useEffect(() => {
    onPagesChange?.(pages)
  }, [pages, onPagesChange])

  useImperativeHandle(ref, () => ({
    scrollToHeading(index: number) {
      const headings = sheetRef.current?.querySelectorAll('h1, h2, h3')
      headings?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    focus() {
      editor?.commands.focus()
    },
  }))

  const insertImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error('That image is over 1.5 MB. Resize it first — the document is stored inline.')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const src = String(reader.result ?? '')
        if (src) editor?.chain().focus().setImage({ src }).run()
      }
      reader.readAsDataURL(file)
    },
    [editor],
  )

  const applyLink = () => {
    if (!editor) return
    const url = linkUrl.trim()
    if (url) editor.chain().focus().setLink({ href: url }).run()
    else editor.chain().focus().unsetLink().run()
    setLinkOpen(false)
    setLinkUrl('')
  }

  if (!editor) return null

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <style>{css}</style>

      <DocumentToolbar
        state={state}
        page={doc.page}
        zoom={zoom}
        onZoom={onZoom}
        onPageChange={(page) => onChange({ ...doc, page })}
        onAction={(action) =>
          applyToolbarAction(editor, action, {
            onLink: () => {
              setLinkUrl(editor.getAttributes('link').href ?? '')
              setLinkOpen(true)
            },
            onImage: () => fileRef.current?.click(),
          })
        }
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
              transform: `scale(${zoom})`,
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
              onKeyDown={(e) => {
                const meta = e.metaKey || e.ctrlKey
                if (meta && e.key.toLowerCase() === 's') {
                  e.preventDefault()
                  onSave?.()
                  return
                }
                if (meta && e.key.toLowerCase() === 'k') {
                  e.preventDefault()
                  setLinkUrl(editor.getAttributes('link').href ?? '')
                  setLinkOpen(true)
                }
              }}
              onDrop={(e) => {
                const file = e.dataTransfer.files?.[0]
                if (!file) return
                e.preventDefault()
                insertImageFile(file)
              }}
            >
              <EditorContent editor={editor} />
            </div>

            {/* Clicking the empty part of the sheet puts the caret at the end,
                the way it does in any word processor. */}
            <div
              className="min-h-0 flex-1 cursor-text"
              aria-hidden
              onMouseDown={(e) => {
                e.preventDefault()
                if (readOnly) return
                editor.chain().focus('end').run()
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
