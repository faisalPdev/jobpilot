import type { Editor } from '@tiptap/react'
import type { ToolbarAction, ToolbarState } from '@/components/resume/DocumentToolbar'
import { fontSizeToPt } from '@/lib/doc/sanitize'

/**
 * Adapter between the existing ribbon and the Tiptap editor.
 *
 * The ribbon is 900 lines of working UI whose contract — a `ToolbarState` in,
 * a `ToolbarAction` out — says nothing about how the document is edited. That
 * makes the editing engine swappable without touching a single control, so the
 * migration off `execCommand` does not become a UI rewrite too.
 */

const ALIGNMENTS: Record<string, ToolbarState['align']> = {
  justifyLeft: 'left',
  justifyCenter: 'center',
  justifyRight: 'right',
  justifyFull: 'justify',
}

/** What the ribbon should show for wherever the caret is now. */
export function toolbarStateFromEditor(editor: Editor, fallbackFontPt: number): ToolbarState {
  const align = (['left', 'center', 'right', 'justify'] as const).find((value) =>
    editor.isActive({ textAlign: value }),
  )

  const heading = ([1, 2, 3] as const).find((level) => editor.isActive('heading', { level }))

  // `getAttributes` reads the stored mark, which is only set where the user set
  // it. Falling back to the page size keeps the control showing the size that
  // is actually rendering rather than an empty box.
  const style = editor.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string }

  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    ul: editor.isActive('bulletList'),
    ol: editor.isActive('orderedList'),
    align: align ?? 'left',
    block: heading ? `h${heading}` : 'p',
    fontFamily: style.fontFamily ?? '',
    fontSizePt: (style.fontSize ? fontSizeToPt(style.fontSize) : null) ?? fallbackFontPt,
  }
}

/**
 * Runs a ribbon action. `onLink` and `onImage` stay with the component because
 * they open dialogs; everything else is a command.
 */
export function applyToolbarAction(
  editor: Editor,
  action: ToolbarAction,
  handlers: { onLink: () => void; onImage: () => void },
) {
  const chain = () => editor.chain().focus()

  switch (action.type) {
    case 'exec': {
      const align = ALIGNMENTS[action.command]
      if (align) return chain().setTextAlign(align).run()
      switch (action.command) {
        case 'bold':
          return chain().toggleBold().run()
        case 'italic':
          return chain().toggleItalic().run()
        case 'underline':
          return chain().toggleUnderline().run()
        case 'strikeThrough':
          return chain().toggleStrike().run()
        case 'insertUnorderedList':
          return chain().toggleBulletList().run()
        case 'insertOrderedList':
          return chain().toggleOrderedList().run()
        case 'undo':
          return chain().undo().run()
        case 'redo':
          return chain().redo().run()
        // Inside a list, indent means nest. Elsewhere it is a left indent on the
        // block, which is the `indent` attribute the schema declares.
        case 'indent':
          return editor.isActive('listItem')
            ? chain().sinkListItem('listItem').run()
            : shiftIndent(editor, 36)
        case 'outdent':
          return editor.isActive('listItem')
            ? chain().liftListItem('listItem').run()
            : shiftIndent(editor, -36)
        default:
          return false
      }
    }

    case 'block': {
      if (action.value === 'p') return chain().setParagraph().run()
      const level = Number(action.value.replace('h', ''))
      if (level !== 1 && level !== 2 && level !== 3) return false
      return chain().setHeading({ level }).run()
    }

    case 'fontFamily':
      return action.value
        ? chain().setFontFamily(action.value).run()
        : chain().unsetFontFamily().run()

    case 'fontSize':
      return chain().setFontSize(`${action.value}pt`).run()

    case 'color':
      return action.value ? chain().setColor(action.value).run() : chain().unsetColor().run()

    case 'link':
      handlers.onLink()
      return true

    case 'unlink':
      return chain().unsetLink().run()

    case 'image':
      handlers.onImage()
      return true

    case 'rule':
      return chain().setHorizontalRule().run()

    case 'clear':
      // Marks and block type both, so "clear formatting" means what it says.
      return chain().unsetAllMarks().setParagraph().run()

    // Border and padding are page-furniture the ribbon offers for section rules.
    // The schema has no attribute for them, so they are not supported here yet
    // rather than silently doing nothing somewhere else.
    case 'border':
    case 'padding':
    case 'splitLine':
      return false

    default:
      return false
  }
}

/** Moves the block's left indent by `deltaPt`, clamped at zero. */
function shiftIndent(editor: Editor, deltaPt: number) {
  const type = editor.isActive('heading') ? 'heading' : 'paragraph'
  const current = (editor.getAttributes(type).indent as number | null) ?? 0
  const next = Math.max(0, Math.min(360, current + deltaPt))
  return editor
    .chain()
    .focus()
    .updateAttributes(type, { indent: next === 0 ? null : next })
    .run()
}
