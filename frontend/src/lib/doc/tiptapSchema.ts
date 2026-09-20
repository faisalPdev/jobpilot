import { Extension } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'
import { TableKit } from '@tiptap/extension-table'
import { Image } from '@tiptap/extension-image'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Highlight } from '@tiptap/extension-highlight'

/**
 * The document schema.
 *
 * The contenteditable editor stored raw HTML and defended it with a whitelist,
 * so every property Word or Docs invented was a hole to patch after a user
 * found one. Here the document is a tree of declared nodes and attributes, and
 * the parser can only produce what is declared: `line-height` is not an
 * attribute of anything below, so a pasted `line-height: 107%` has nowhere to
 * live. It is not stripped, it is unrepresentable — and the page's own Line
 * spacing setting is the only thing that decides leading, which is the whole
 * point of having that control.
 *
 * Font family and size are the opposite case. They *are* declared, because the
 * ribbon has to set them on a selection. That would let a paste bring its own
 * fonts in, so those are removed on the way in instead — see
 * `stripPastedTypography` in sanitize.ts, wired to `transformPastedHTML`.
 */

/** Word writes lengths in cm/pt/in; normalise to pt so one unit reaches the DOM. */
function toPt(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(-?[\d.]+)\s*(pt|px|cm|mm|in)?$/.exec(value.trim().toLowerCase())
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n)) return null
  const unit = match[2] || 'px'
  const pt =
    unit === 'pt' ? n
    : unit === 'px' ? n * 0.75
    : unit === 'in' ? n * 72
    : unit === 'cm' ? n * 28.3465
    : n * 2.83465
  // A zero carries nothing: Google Docs stamps `margin: 0pt` on every paragraph
  // it copies, which would cancel the page's paragraph spacing. Sub-point noise
  // is Word rounding. The ceiling stops one bad paste pushing the next
  // paragraph off the page.
  const rounded = Math.round(Math.min(72, Math.max(0, pt)) * 10) / 10
  return rounded === 0 ? null : rounded
}

function readStyle(el: HTMLElement, prop: string): string | null {
  return el.style.getPropertyValue(prop) || null
}

/**
 * Spacing and indent as attributes on the blocks that can carry them.
 *
 * Re-emitted as margins so the stored HTML keeps the shape the exporter, the
 * ATS checks and the outline already read.
 */
const BlockSpacing = Extension.create({
  name: 'blockSpacing',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          spaceBefore: {
            default: null,
            parseHTML: (el) => toPt(readStyle(el as HTMLElement, 'margin-top')),
            renderHTML: (attrs) =>
              attrs.spaceBefore ? { style: `margin-top: ${attrs.spaceBefore}pt` } : {},
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => toPt(readStyle(el as HTMLElement, 'margin-bottom')),
            renderHTML: (attrs) =>
              attrs.spaceAfter ? { style: `margin-bottom: ${attrs.spaceAfter}pt` } : {},
          },
          indent: {
            default: null,
            parseHTML: (el) => toPt(readStyle(el as HTMLElement, 'margin-left')),
            renderHTML: (attrs) =>
              attrs.indent ? { style: `margin-left: ${attrs.indent}pt` } : {},
          },
        },
      },
    ]
  },
})

export const documentExtensions = [
  StarterKit.configure({
    // A resume has no code blocks, and every node left in the schema is one
    // more place a paste can hide something.
    codeBlock: false,
    link: { openOnClick: false, autolink: true },
  }),
  TextStyleKit.configure({
    // Deliberately absent: leading belongs to the page's Line spacing setting,
    // and not declaring it is what stops a paste overriding that control.
    lineHeight: false,
  }),
  TextAlign.configure({ types: ['paragraph', 'heading'] }),
  TableKit.configure({ table: { resizable: true } }),
  Image.configure({ inline: true, allowBase64: true }),
  Subscript,
  Superscript,
  Highlight.configure({ multicolor: true }),
  BlockSpacing,
]
