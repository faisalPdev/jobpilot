/**
 * Sanitiser for freeform document mode.
 *
 * The structured editor's `sanitizeInlineHtml` keeps bold/italic and nothing
 * else, because a bullet is one line of text. A document is a page the user
 * lays out themselves, so the whitelist here is wider — headings, lists, links,
 * alignment, borders, spacing, tables — but it is still a whitelist:
 * everything arriving from a Word/Google Docs paste is rebuilt from an inert
 * `DOMParser` document, so no script, no event handler and no external
 * stylesheet survives the trip into the editor.
 *
 * Word pastes most of its look in a `<style>` block with class names. Before
 * serialising we resolve those rules onto matching elements as inline styles,
 * so borders and type styles survive even after classes are stripped.
 *
 * Note the deliberate asymmetry with the structured model: tables and images
 * are *allowed* (people paste them, and destroying them silently is worse than
 * keeping them) but the ATS checker flags both. See `analyzeDocument`.
 */

/** Faces every PDF pipeline can embed and every ATS can extract. */
export const DOC_FONTS = [
  { label: 'Inter (sans)', value: "Inter, 'Helvetica Neue', Arial, sans-serif" },
  { label: 'Helvetica / Arial', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: 'Georgia (serif)', value: 'Georgia, Cambria, "Times New Roman", serif' },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Garamond', value: "Garamond, 'EB Garamond', Georgia, serif" },
  { label: 'Calibri / Carlito', value: 'Calibri, Carlito, Candara, sans-serif' },
  { label: 'Courier (mono)', value: "'Courier New', ui-monospace, Menlo, monospace" },
]

const KEEP_AS: Record<string, string> = {
  strong: 'b',
  em: 'i',
  strike: 's',
  del: 's',
  ins: 'u',
  h4: 'h3',
  h5: 'h3',
  h6: 'h3',
}

const ALLOWED = new Set([
  'p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr', 'br',
  'b', 'i', 'u', 's', 'sub', 'sup', 'a', 'img', 'span', 'div',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col',
])

/** Dropped together with their contents — everything else is unwrapped. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'svg', 'canvas',
  'video', 'audio', 'input', 'select', 'textarea', 'button', 'form', 'link', 'meta',
])

/**
 * Styles Word/Google Docs commonly put on pasted runs and boxes. Layout chrome
 * that breaks the page (absolute positioning, transforms) stays out.
 */
const ALLOWED_STYLES = new Set([
  'text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
  'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness',
  'font-size', 'font-family', 'font-variant', 'font-stretch',
  'color', 'background-color', 'background',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'text-indent', 'line-height', 'letter-spacing', 'word-spacing', 'white-space',
  'text-transform', 'vertical-align', 'list-style-type', 'list-style-position',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-width', 'border-style', 'border-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-collapse', 'border-spacing', 'border-radius',
  'outline', 'outline-width', 'outline-style', 'outline-color',
  'box-sizing', 'display', 'float', 'clear',
  'justify-content', 'align-items', 'align-self', 'gap', 'row-gap', 'column-gap',
  'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'flex-direction', 'flex-wrap',
])

/**
 * Declarations Google Docs stamps on every run it copies. They say nothing, but
 * an inline style beats the document stylesheet, so keeping them means the page
 * font, size and spacing controls stop affecting anything that was pasted.
 */
const NOOP_DECLS: Record<string, RegExp> = {
  'font-style': /^normal$/i,
  'font-variant': /^normal$/i,
  'font-stretch': /^normal$/i,
  'text-decoration': /^none$/i,
  'text-decoration-line': /^none$/i,
  'vertical-align': /^baseline$/i,
}

const WIDTH_TAGS = new Set(['img', 'table', 'td', 'th', 'col', 'div', 'p', 'span', 'hr'])
const HEIGHT_TAGS = new Set(['img', 'table', 'td', 'th', 'tr', 'div', 'hr'])
const DISPLAY_OK = new Set([
  'inline', 'block', 'inline-block', 'inline-table', 'table', 'table-row',
  'table-cell', 'table-header-group', 'table-row-group', 'table-footer-group',
  'list-item', 'none', 'flex',
])
const FLOAT_OK = new Set(['left', 'right', 'none'])
const JUSTIFY_OK = new Set([
  'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end',
])
const FLEX_DIR_OK = new Set(['row', 'row-reverse', 'column', 'column-reverse'])
const WRAP_OK = new Set(['nowrap', 'wrap', 'wrap-reverse'])

const BLOCK = new Set([
  'p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr', 'table', 'tr', 'td', 'th', 'div',
])

const hasDom = () => typeof DOMParser !== 'undefined'

function safeUrl(raw: string) {
  const url = raw.trim()
  if (/^(https?:|mailto:|tel:|#)/i.test(url)) return url
  // A bare domain typed into the link dialog is the common case, not an attack.
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return 'https://' + url
  return null
}

function safeImageSrc(raw: string) {
  const src = raw.trim()
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) return src
  if (/^https:\/\//i.test(src)) return src
  return null
}

/** Normalises px/pt/em/legacy keywords to a clamped point size. */
export function fontSizeToPt(value: string): number | null {
  const keywords: Record<string, number> = {
    'xx-small': 7, 'x-small': 8, small: 10, medium: 11, large: 13, 'x-large': 17, 'xx-large': 22,
  }
  const key = value.trim().toLowerCase()
  if (keywords[key]) return keywords[key]
  const match = /^(-?[\d.]+)\s*(pt|px|em|rem)?$/.exec(key)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const pt = match[2] === 'px' ? n * 0.75 : match[2] === 'em' || match[2] === 'rem' ? n * 11 : n
  return Math.round(Math.min(48, Math.max(6, pt)) * 10) / 10
}

/** Word system colours and shorthand that would otherwise look wrong off Windows. */
function normalizeCssValue(value: string) {
  return value
    .replace(/\bwindowtext\b/gi, '#14161a')
    .replace(/\bwindow\b/gi, '#ffffff')
    .replace(/\btransparent\b/gi, 'transparent')
}

function isSafeStyleValue(value: string) {
  return !/url\s*\(|expression\s*\(|javascript:|@import|[<>{}]/i.test(value)
}

function cleanStyle(style: string, tag: string) {
  const out: string[] = []
  for (const rule of style.split(';')) {
    const idx = rule.indexOf(':')
    if (idx < 0) continue
    const prop = rule.slice(0, idx).trim().toLowerCase()
    let value = normalizeCssValue(rule.slice(idx + 1).trim())
    if (!prop || !value) continue
    // Word's private mso-* props are not CSS; skip them after we already
    // copied anything useful into standard properties via the class resolver.
    if (prop.startsWith('mso-')) continue
    if (!ALLOWED_STYLES.has(prop)) continue
    if (!isSafeStyleValue(value)) continue
    if ((prop === 'width' || prop === 'min-width' || prop === 'max-width') && !WIDTH_TAGS.has(tag)) continue
    if ((prop === 'height' || prop === 'min-height' || prop === 'max-height') && !HEIGHT_TAGS.has(tag)) continue
    if (prop === 'display' && !DISPLAY_OK.has(value.toLowerCase())) continue
    if (prop === 'float' && !FLOAT_OK.has(value.toLowerCase())) continue
    if (prop === 'justify-content' && !JUSTIFY_OK.has(value.toLowerCase())) continue
    if (prop === 'flex-direction' && !FLEX_DIR_OK.has(value.toLowerCase())) continue
    if (prop === 'flex-wrap' && !WRAP_OK.has(value.toLowerCase())) continue
    if (NOOP_DECLS[prop] && NOOP_DECLS[prop].test(value)) continue
    // `white-space: pre`/`pre-wrap` rides on every Docs span and stops the text
    // reflowing to our page width. `nowrap` is ours — the tab-stop lines set it.
    if (prop === 'white-space' && !/^(nowrap|normal)$/i.test(value)) continue
    if (prop === 'background' && /url\s*\(/i.test(value)) continue
    if (prop === 'font-size') {
      const pt = fontSizeToPt(value)
      if (!pt) continue
      value = pt + 'pt'
    }
    // Word puts `background-color: white` on every run; it prints as a grey box.
    if (
      (prop === 'background-color' || prop === 'background') &&
      /^(white|#fff(fff)?|transparent|rgba?\(255,\s*255,\s*255)/i.test(value)
    ) {
      continue
    }
    out.push(prop + ': ' + value)
  }
  return out.join('; ')
}

/**
 * Parse the simple class/element rules Word and Google Docs put in the paste
 * `<style>` block, then bake matching declarations onto each element's style=
 * so stripping classes later does not erase borders and type.
 */
function applyEmbeddedStyles(root: HTMLElement) {
  const sheetText = Array.from(root.ownerDocument.querySelectorAll('style'))
    .map((el) => el.textContent ?? '')
    .join('\n')
  if (!sheetText.trim()) return

  type Rule = {
    tag: string | null
    className: string | null
    parentClass: string | null
    parentTag: string | null
    decls: string
  }
  const rules: Rule[] = []
  // Word wraps the rules in HTML comments inside <style>; strip those plus
  // real CSS comments and at-rules before matching simple selectors.
  const cleaned = sheetText
    .replace(/<!--|-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@[^{]+\{[^{}]*\}/g, '')

  const ruleRe = /([^{}@]+)\{([^{}]+)\}/g
  let match: RegExpExecArray | null
  while ((match = ruleRe.exec(cleaned))) {
    const selectors = match[1].split(',')
    const decls = match[2].trim()
    if (!decls) continue
    for (const rawSel of selectors) {
      const sel = rawSel.trim().replace(/:[\w-]+(\([^)]*\))?/g, '').trim()
      if (!sel || sel.includes('[') || sel.includes('>') || sel.includes('+') || sel.includes('~')) continue

      // `.Grid td` / `table.Grid td` — Word puts cell borders on descendants.
      const desc = /^([a-z0-9]+)?(?:\.([A-Za-z0-9_-]+))?\s+([a-z0-9]+)$/i.exec(sel)
      if (desc) {
        rules.push({
          tag: desc[3].toLowerCase(),
          className: null,
          parentClass: desc[2] ?? null,
          parentTag: desc[1] ? desc[1].toLowerCase() : null,
          decls,
        })
        continue
      }

      const m = /^([a-z0-9]+)?(?:\.([A-Za-z0-9_-]+))?$/i.exec(sel)
      if (!m || (!m[1] && !m[2])) continue
      rules.push({
        tag: m[1] ? m[1].toLowerCase() : null,
        className: m[2] ?? null,
        parentClass: null,
        parentTag: null,
        decls,
      })
    }
  }
  if (!rules.length) return

  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase()
    if (DROP_WITH_CONTENT.has(tag)) return
    const classNames = (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
    const collected: string[] = []
    for (const rule of rules) {
      if (rule.tag && rule.tag !== tag) continue
      if (rule.className && !classNames.includes(rule.className)) continue
      if (rule.parentClass || rule.parentTag) {
        let parent: Element | null = node.parentElement
        let matched = false
        while (parent && parent !== root) {
          const pTag = parent.tagName.toLowerCase()
          const pClasses = (parent.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
          const tagOk = !rule.parentTag || rule.parentTag === pTag
          const classOk = !rule.parentClass || pClasses.includes(rule.parentClass)
          if (tagOk && classOk) {
            matched = true
            break
          }
          parent = parent.parentElement
        }
        if (!matched) continue
      }
      if (!rule.tag && !rule.className && !rule.parentClass && !rule.parentTag) continue
      collected.push(rule.decls)
    }
    if (collected.length) {
      const existing = node.getAttribute('style') ?? ''
      // Embedded sheet first, inline last — matching normal CSS precedence.
      node.setAttribute('style', joinDeclarations([...collected, existing]))
    }
    for (const child of Array.from(node.children)) walk(child)
  }
  walk(root)
}

/**
 * Joins declaration blocks into one style attribute.
 *
 * The rules lifted out of a `<style>` block already end in `;`, so concatenating
 * them with a separator produced `...sans-serif;; text-align: center`. Our own
 * reader splits on `;` and skips the empty, which is why this went unnoticed —
 * but a stricter CSS parser stops at the malformed declaration and discards
 * everything after it, silently losing whatever Word put last.
 */
function joinDeclarations(parts: string[]) {
  return parts
    .flatMap((part) => part.split(';'))
    .map((decl) => decl.trim())
    .filter(Boolean)
    .join('; ')
}

/** Promote legacy table/presentational attributes Word still emits into CSS. */
function promotePresentationalAttrs(root: HTMLElement) {
  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase()
    const parts: string[] = []
    const style = node.getAttribute('style') ?? ''

    if (tag === 'table') {
      const border = node.getAttribute('border')
      if (border && /^\d+$/.test(border) && Number(border) > 0 && !/\bborder\b/i.test(style)) {
        parts.push(`border: ${border}px solid #14161a`)
        for (const cell of Array.from(node.querySelectorAll('td, th'))) {
          const cs = cell.getAttribute('style') ?? ''
          if (!/\bborder\b/i.test(cs)) {
            cell.setAttribute('style', (cs ? cs + '; ' : '') + `border: ${border}px solid #14161a`)
          }
        }
      }
      const spacing = node.getAttribute('cellspacing')
      if (spacing && /^\d+$/.test(spacing) && !/border-spacing/i.test(style)) {
        parts.push(`border-spacing: ${spacing}px`)
        if (Number(spacing) === 0) parts.push('border-collapse: collapse')
      }
      const padding = node.getAttribute('cellpadding')
      if (padding && /^\d+$/.test(padding)) {
        for (const cell of Array.from(node.querySelectorAll('td, th'))) {
          const cs = cell.getAttribute('style') ?? ''
          if (!/\bpadding\b/i.test(cs)) {
            cell.setAttribute('style', (cs ? cs + '; ' : '') + `padding: ${padding}px`)
          }
        }
      }
    }

    if (tag === 'td' || tag === 'th' || tag === 'tr' || tag === 'table' || tag === 'p' || tag === 'div') {
      const width = node.getAttribute('width')
      if (width && !/\bwidth\s*:/i.test(style)) {
        parts.push(/^\d+$/.test(width) ? `width: ${width}px` : `width: ${width}`)
      }
      const height = node.getAttribute('height')
      if (height && !/\bheight\s*:/i.test(style)) {
        parts.push(/^\d+$/.test(height) ? `height: ${height}px` : `height: ${height}`)
      }
      const bgcolor = node.getAttribute('bgcolor')
      if (bgcolor && !/background/i.test(style) && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(bgcolor.trim())) {
        parts.push('background-color: ' + bgcolor.trim())
      }
      const align = node.getAttribute('align')
      if (align && /^(left|center|right|justify)$/i.test(align) && !/text-align/i.test(style)) {
        parts.push('text-align: ' + align.toLowerCase())
      }
      const valign = node.getAttribute('valign')
      if (valign && /^(top|middle|bottom|baseline)$/i.test(valign) && !/vertical-align/i.test(style)) {
        parts.push('vertical-align: ' + (valign.toLowerCase() === 'middle' ? 'middle' : valign.toLowerCase()))
      }
    }

    if (parts.length) {
      node.setAttribute('style', (style ? style + '; ' : '') + parts.join('; '))
    }
    for (const child of Array.from(node.children)) walk(child)
  }
  walk(root)
}

/**
 * Legacy `<font>` is what `document.execCommand('fontSize'|'fontName')` still
 * emits in every browser. Rather than fight it, the editor issues the command
 * and then lets this translate the result into a plain styled span.
 */
function fontElementStyle(el: Element) {
  const parts: string[] = []
  const face = el.getAttribute('face')
  const color = el.getAttribute('color')
  if (face) parts.push('font-family: ' + face.replace(/[<>{};]/g, ''))
  if (color && /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d,.\s%]+\))$/i.test(color.trim())) {
    parts.push('color: ' + color.trim())
  }
  return parts.join('; ')
}

function escapeText(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string) {
  return escapeText(s).replace(/"/g, '&quot;')
}

function serialize(node: Node, out: string[]) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out.push(escapeText(child.nodeValue ?? ''))
      continue
    }
    if (child.nodeType !== 1) continue
    const el = child as Element
    const raw = el.tagName.toLowerCase()

    if (DROP_WITH_CONTENT.has(raw)) continue

    if (raw === 'font') {
      const style = fontElementStyle(el)
      if (style) out.push('<span style="' + escapeAttr(style) + '">')
      serialize(el, out)
      if (style) out.push('</span>')
      continue
    }

    const tag = KEEP_AS[raw] ?? raw
    if (!ALLOWED.has(tag)) {
      // `section`, `article`, `main`… keep the text, drop the box.
      const wrapsBlocks = Array.from(el.children).some((c) => BLOCK.has(c.tagName.toLowerCase()))
      if ((raw === 'div' || raw === 'section') && !wrapsBlocks) {
        out.push('<p>')
        serialize(el, out)
        out.push('</p>')
      } else {
        serialize(el, out)
      }
      continue
    }

    // Keep a `div` only when it carries layout/style; otherwise unwrap so Word's
    // nested wrappers do not bloat the document.
    if (tag === 'div') {
      const style = cleanStyle(el.getAttribute('style') ?? '', 'div')
      if (!style) {
        serialize(el, out)
        continue
      }
      out.push('<div style="' + escapeAttr(style) + '">')
      serialize(el, out)
      out.push('</div>')
      continue
    }

    if (tag === 'col' || tag === 'colgroup') {
      const attrs: string[] = []
      const span = el.getAttribute('span')
      if (span && /^\d{1,2}$/.test(span)) attrs.push('span="' + span + '"')
      const style = cleanStyle(el.getAttribute('style') ?? '', tag)
      if (style) attrs.push('style="' + escapeAttr(style) + '"')
      if (tag === 'col') {
        out.push(attrs.length ? '<col ' + attrs.join(' ') + '>' : '<col>')
        continue
      }
      out.push(attrs.length ? '<colgroup ' + attrs.join(' ') + '>' : '<colgroup>')
      serialize(el, out)
      out.push('</colgroup>')
      continue
    }

    const attrs: string[] = []
    if (tag === 'a') {
      const href = safeUrl(el.getAttribute('href') ?? '')
      if (href) attrs.push('href="' + escapeAttr(href) + '"', 'target="_blank"', 'rel="noopener noreferrer"')
    }
    if (tag === 'img') {
      const src = safeImageSrc(el.getAttribute('src') ?? '')
      if (!src) continue
      attrs.push('src="' + escapeAttr(src) + '"')
      const alt = el.getAttribute('alt')
      if (alt) attrs.push('alt="' + escapeAttr(alt) + '"')
    }
    if (tag === 'td' || tag === 'th') {
      for (const name of ['colspan', 'rowspan']) {
        const v = el.getAttribute(name)
        if (v && /^\d{1,2}$/.test(v)) attrs.push(name + '="' + v + '"')
      }
    }
    const style = cleanStyle(el.getAttribute('style') ?? '', tag)
    if (style) attrs.push('style="' + escapeAttr(style) + '"')

    const open = attrs.length ? '<' + tag + ' ' + attrs.join(' ') + '>' : '<' + tag + '>'
    out.push(open)
    if (tag === 'br' || tag === 'hr' || tag === 'img') continue
    serialize(el, out)
    out.push('</' + tag + '>')
  }
}

/** Last-resort strip for non-DOM environments (the node smoke run). */
function stripToWhitelist(html: string) {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?!\/?(?:p|h1|h2|h3|ul|ol|li|blockquote|hr|br|b|i|u|s|a|div|span|table|thead|tbody|tfoot|tr|td|th|colgroup|col)\b)[^>]*>/gi, '')
}

/** Parse a CSS length into px (approx) for ratio math; null if not absolute. */
function absoluteLengthPx(value: string): number | null {
  const v = value.trim().toLowerCase()
  const m = /^(-?[\d.]+)\s*(px|pt|cm|mm|in)?$/.exec(v)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2] || 'px'
  if (unit === 'px') return n
  if (unit === 'pt') return n * (96 / 72)
  if (unit === 'in') return n * 96
  if (unit === 'cm') return n * (96 / 2.54)
  if (unit === 'mm') return n * (96 / 25.4)
  return null
}

function readStyleMap(style: string) {
  const map = new Map<string, string>()
  for (const rule of style.split(';')) {
    const idx = rule.indexOf(':')
    if (idx < 0) continue
    const prop = rule.slice(0, idx).trim().toLowerCase()
    const value = rule.slice(idx + 1).trim()
    if (prop && value) map.set(prop, value)
  }
  return map
}

function writeStyleMap(map: Map<string, string>) {
  return Array.from(map.entries())
    .map(([k, v]) => k + ': ' + v)
    .join('; ')
}

/**
 * Word pastes tables with a fixed pt/px width from the source page. That leaves
 * a strip of empty page on the right, and Decrease indent cannot fix it —
 * indent only changes margin-left, which already bottoms out at 0.
 * Stretch the table to the content box and keep column proportions.
 */
function fitTablesToContentWidth(root: HTMLElement) {
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const map = readStyleMap(table.getAttribute('style') ?? '')
    const widthAttr = table.getAttribute('width')
    if (widthAttr && !map.has('width')) {
      map.set('width', /^\d+$/.test(widthAttr) ? widthAttr + 'px' : widthAttr)
    }

    const rawWidth = map.get('width')
    const tablePx = rawWidth ? absoluteLengthPx(rawWidth) : null

    const sampleCells = Array.from(table.querySelector('tr')?.children ?? []).filter((el) => {
      const t = el.tagName.toLowerCase()
      return t === 'td' || t === 'th'
    }) as Element[]

    const colEls = Array.from(table.querySelectorAll(':scope > colgroup > col, :scope > col'))
    const widthTargets = colEls.length ? colEls : sampleCells

    if (tablePx && widthTargets.length) {
      const absolute = widthTargets.map((el) => {
        const cm = readStyleMap(el.getAttribute('style') ?? '')
        const attr = el.getAttribute('width')
        const w =
          cm.get('width') ||
          (attr ? (/^\d+$/.test(attr) ? attr + 'px' : attr) : '')
        return w ? absoluteLengthPx(w) : null
      })
      const sum = absolute.reduce<number>((acc, n) => acc + (n ?? 0), 0)
      if (sum > 0) {
        widthTargets.forEach((el, i) => {
          const px = absolute[i]
          if (px == null) return
          const cm = readStyleMap(el.getAttribute('style') ?? '')
          cm.set('width', Math.round((px / sum) * 1000) / 10 + '%')
          el.removeAttribute('width')
          el.setAttribute('style', writeStyleMap(cm))
        })
      }
    } else {
      for (const el of widthTargets) {
        const cm = readStyleMap(el.getAttribute('style') ?? '')
        const w = cm.get('width')
        if (w && absoluteLengthPx(w) != null) {
          cm.delete('width')
          el.removeAttribute('width')
          el.setAttribute('style', writeStyleMap(cm))
        }
      }
    }

    map.set('width', '100%')
    for (const key of ['margin-left', 'margin-right', 'margin']) {
      const v = map.get(key)
      if (!v) continue
      if (key === 'margin') {
        const parts = v.trim().split(/\s+/)
        if (parts.length === 1) map.set('margin', parts[0] + ' 0')
        else if (parts.length === 2) map.set('margin', parts[0] + ' 0')
        else if (parts.length === 3) map.set('margin', parts[0] + ' 0 ' + parts[2])
        else if (parts.length >= 4) map.set('margin', parts[0] + ' 0 ' + parts[2] + ' 0')
      } else {
        map.delete(key)
      }
    }
    table.removeAttribute('width')
    table.removeAttribute('align')
    table.setAttribute('style', writeStyleMap(map))
  }
}

/**
 * Word often pastes lists with `padding-left: 0` and outside markers, so the
 * discs hang off the left edge and get clipped — especially with tight page
 * margins. Guarantee enough indent for a full bullet to show.
 */
/**
 * Google Docs sizes list indents with logical properties
 * (`padding-inline-start: 48px`). They are not in the whitelist and nothing
 * downstream reads them, so a pasted list lost its indent entirely and fell
 * back to the stylesheet default — about half of what the source used, with
 * every nesting level flattened to the same step.
 */
const LOGICAL_PROPS: Record<string, string> = {
  'padding-inline-start': 'padding-left',
  'padding-inline-end': 'padding-right',
  'margin-inline-start': 'margin-left',
  'margin-inline-end': 'margin-right',
}

function normalizeLogicalProperties(root: HTMLElement) {
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    const map = readStyleMap(el.getAttribute('style') ?? '')
    let changed = false
    for (const [logical, physical] of Object.entries(LOGICAL_PROPS)) {
      const value = map.get(logical)
      if (!value) continue
      map.delete(logical)
      // A physical value already on the element was written deliberately.
      if (!map.has(physical)) map.set(physical, value)
      changed = true
    }
    if (changed) el.setAttribute('style', writeStyleMap(map))
  }
}

/**
 * Spacing Word and Google Docs stamp onto every paragraph they copy.
 *
 * `line-height` is the one that fights the document's own Line spacing control.
 * An inline declaration outranks `.doc { line-height: ... }` by origin rather
 * than specificity, so no rule `documentCss` can write will ever reach a pasted
 * paragraph: the setting silently stops applying to exactly the content the
 * user just added. The value is wrong on arrival anyway — Word's `107%` means
 * 107% of the font's natural line box, which CSS reads as 107% of font-size,
 * landing about a fifth tighter than the document being copied from.
 *
 * Vertical margins split two ways. A non-zero one carries real structure — the
 * gap before a section heading — so it survives a paste; dropping those closes
 * up every section of a pasted resume. A zero one carries nothing: Google Docs
 * stamps `margin-top: 0pt; margin-bottom: 0pt` on every paragraph it copies,
 * and because inline beats the stylesheet that silently cancels
 * `.doc p { margin: … }`, welding the paste into one block that no page control
 * can open up. Zero means "the source set no space", which is exactly when the
 * document's own spacing should apply, so those go.
 *
 * `resetDocumentSpacing` drops the non-zero ones too, but only when asked.
 */
function stripSpacing(root: HTMLElement, options: { margins?: 'zero' | 'all' } = {}) {
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    const map = readStyleMap(el.getAttribute('style') ?? '')
    let changed = map.delete('line-height')
    if (options.margins && dropVerticalMargins(map, options.margins)) changed = true
    if (!changed) continue
    const next = writeStyleMap(map)
    if (next) el.setAttribute('style', next)
    else el.removeAttribute('style')
  }
}

/** `0`, `0pt`, `0.0cm` — a length that sets no space, whatever the unit. */
function isZeroLength(value: string) {
  return /^-?0(\.0+)?(pt|px|cm|mm|in|em|rem|%)?$/i.test(value.trim())
}

/**
 * Removes top/bottom margins while keeping the horizontal ones, because those
 * are the indent. The shorthand has to be expanded rather than deleted or a
 * `margin: 0cm 0cm 8pt 36pt` would take a 36pt left indent down with it.
 */
function dropVerticalMargins(map: Map<string, string>, scope: 'zero' | 'all') {
  let changed = false
  const shorthand = map.get('margin')
  if (shorthand !== undefined) {
    const parts = shorthand.trim().split(/\s+/)
    const top = parts[0] ?? ''
    const bottom = parts[2] ?? top
    if (scope === 'all' || (isZeroLength(top) && isZeroLength(bottom))) {
      map.delete('margin')
      changed = true
      if (parts.length >= 1 && parts.length <= 4) {
        const right = parts[1] ?? parts[0]
        const left = parts[3] ?? right
        // Word writes the shorthand first and overrides with longhands after, so
        // a longhand already in the map was the more specific declaration.
        if (!map.has('margin-right')) map.set('margin-right', right)
        if (!map.has('margin-left')) map.set('margin-left', left)
      }
    }
  }
  for (const prop of ['margin-top', 'margin-bottom']) {
    const value = map.get(prop)
    if (value === undefined) continue
    if (scope === 'all' || isZeroLength(value)) {
      map.delete(prop)
      changed = true
    }
  }
  return changed
}

/**
 * A block whose only content is an empty inline generates no line box, so it
 * renders at zero height. Google Docs writes every blank line you typed as
 * `<p><span style="…"></span></p>`, which meant a pasted document lost all of
 * the spacing between its sections. `&nbsp;` already produces a line box, so
 * only genuinely empty blocks get the `<br>`.
 */
function keepEmptyBlocksVisible(root: HTMLElement) {
  for (const block of Array.from(root.querySelectorAll('p, h1, h2, h3, li, blockquote'))) {
    if (block.querySelector('br, img, table, ul, ol, p, h1, h2, h3, blockquote')) continue
    // Collapsible whitespace disappears; a non-breaking space does not.
    if ((block.textContent ?? '').replace(/[ \t\r\n]+/g, '').length) continue
    block.appendChild(root.ownerDocument.createElement('br'))
  }
}

function normalizeLists(root: HTMLElement) {
  const insufficient = (value: string | undefined) => {
    if (!value) return true
    const v = value.trim().toLowerCase()
    if (/^-/.test(v)) return true
    if (/^0+(\.0+)?([a-z%]*)?$/.test(v)) return true
    const em = /^([\d.]+)\s*em$/.exec(v)
    if (em && Number(em[1]) < 1.25) return true
    const rem = /^([\d.]+)\s*rem$/.exec(v)
    if (rem && Number(rem[1]) < 1.25) return true
    // absoluteLengthPx rejects 0; treat missing/zero as insufficient above.
    const px = absoluteLengthPx(v)
    if (px != null && px < 16) return true
    // Bare numbers from Word attributes are rare on padding; ignore %.
    return false
  }

  for (const list of Array.from(root.querySelectorAll('ul, ol'))) {
    const map = readStyleMap(list.getAttribute('style') ?? '')
    if (insufficient(map.get('padding-left'))) {
      map.set('padding-left', '1.75em')
    }
    const marginLeft = map.get('margin-left')
    if (marginLeft && (/^-/.test(marginLeft.trim()) || /^0+(\.0+)?([a-z%]*)?$/.test(marginLeft.trim()))) {
      // Zero/negative margin plus outside markers is what clips the disc.
      map.delete('margin-left')
    }
    if ((map.get('list-style-position') || '').toLowerCase() === 'outside' || !map.get('list-style-position')) {
      map.set('list-style-position', 'outside')
    }
    list.setAttribute('style', writeStyleMap(map))
  }

  for (const li of Array.from(root.querySelectorAll('li'))) {
    const map = readStyleMap(li.getAttribute('style') ?? '')
    let changed = false
    const indent = map.get('text-indent')
    if (indent && /^-/.test(indent.trim())) {
      map.delete('text-indent')
      changed = true
    }
    const marginLeft = map.get('margin-left')
    if (marginLeft && /^-/.test(marginLeft.trim())) {
      map.delete('margin-left')
      changed = true
    }
    if (changed) li.setAttribute('style', writeStyleMap(map))
  }
}

function isTabMarkerElement(el: Element) {
  const style = (el.getAttribute('style') ?? '').toLowerCase()
  if (/mso-tab-count/i.test(style) || el.getAttribute('mso-tab-count')) return true
  // Google Docs often wraps the tab in a white-space:pre span whose text is \t.
  if (/white-space:\s*pre/i.test(style)) {
    const text = el.textContent ?? ''
    if (/^\t+$/.test(text) || /^\u00a0{2,}$/.test(text)) return true
  }
  return false
}

/**
 * Google Docs / Word right-tab lines ("Company … Remote") paste as a tab
 * character between the two sides. Browsers have no tab stops, so convert those
 * blocks into a flex row with the right side pinned to the margin.
 */
function normalizeTabStops(root: HTMLElement) {
  const blocks = Array.from(root.querySelectorAll('p, h1, h2, h3, div, li'))
  for (const block of blocks) {
    const style = block.getAttribute('style') ?? ''
    if (/\bdisplay\s*:\s*flex\b/i.test(style) && /\bspace-between\b/i.test(style)) continue

    for (const el of Array.from(block.querySelectorAll('*'))) {
      if (isTabMarkerElement(el)) {
        el.replaceWith(root.ownerDocument.createTextNode('\t'))
      }
    }

    const found = findFirstTab(block)
    if (!found) continue

    const doc = root.ownerDocument
    const leftRange = doc.createRange()
    leftRange.selectNodeContents(block)
    leftRange.setEnd(found.text, found.offset)
    const rightRange = doc.createRange()
    rightRange.selectNodeContents(block)
    rightRange.setStart(found.text, found.offset + 1)

    const leftContents = leftRange.cloneContents()
    const rightContents = rightRange.cloneContents()
    const leftText = (leftContents.textContent ?? '').trim()
    const rightText = (rightContents.textContent ?? '').replace(/^\t+/, '').trim()
    if (!leftText || !rightText) continue

    const left = doc.createElement('span')
    left.appendChild(leftContents)
    const right = doc.createElement('span')
    right.setAttribute(
      'style',
      'text-align: right; white-space: nowrap; flex-shrink: 0; margin-left: 1em',
    )
    right.appendChild(rightContents)

    const map = readStyleMap(style)
    map.set('display', 'flex')
    map.set('justify-content', 'space-between')
    map.set('align-items', 'baseline')
    map.set('gap', '1em')
    map.set('width', '100%')
    if (map.get('text-align') === 'left') map.delete('text-align')

    while (block.firstChild) block.removeChild(block.firstChild)
    block.appendChild(left)
    block.appendChild(right)
    block.setAttribute('style', writeStyleMap(map))
  }

  // Some pastes use float:right instead of a tab for the trailing date/location.
  for (const block of blocks) {
    const style = block.getAttribute('style') ?? ''
    if (/\bdisplay\s*:\s*flex\b/i.test(style) && /\bspace-between\b/i.test(style)) continue
    const floated = Array.from(block.querySelectorAll('span, b, i, u')).find((el) =>
      /float\s*:\s*right/i.test(el.getAttribute('style') ?? ''),
    )
    if (!floated || !floated.textContent?.trim()) continue

    const doc = root.ownerDocument
    const right = doc.createElement('span')
    right.setAttribute(
      'style',
      'text-align: right; white-space: nowrap; flex-shrink: 0; margin-left: 1em',
    )
    while (floated.firstChild) right.appendChild(floated.firstChild)
    floated.remove()

    const left = doc.createElement('span')
    while (block.firstChild) left.appendChild(block.firstChild)
    if (!(left.textContent ?? '').trim() || !(right.textContent ?? '').trim()) {
      while (left.firstChild) block.appendChild(left.firstChild)
      while (right.firstChild) block.appendChild(right.firstChild)
      continue
    }

    const map = readStyleMap(style)
    map.set('display', 'flex')
    map.set('justify-content', 'space-between')
    map.set('align-items', 'baseline')
    map.set('gap', '1em')
    map.set('width', '100%')
    block.appendChild(left)
    block.appendChild(right)
    block.setAttribute('style', writeStyleMap(map))
  }
}

function findFirstTab(node: Node): { text: Text; offset: number } | null {
  if (node.nodeType === 3) {
    const value = node.nodeValue ?? ''
    const offset = value.indexOf('\t')
    if (offset >= 0) return { text: node as Text, offset }
    return null
  }
  for (const child of Array.from(node.childNodes)) {
    const found = findFirstTab(child)
    if (found) return found
  }
  return null
}

const INLINE_WRAPPERS = ['b', 'strong', 'i', 'em', 'u', 's', 'span', 'font']

/**
 * Google Docs wraps the whole copied range in
 * `<b style="font-weight:normal" id="docs-internal-guid-…">`, and Word nests
 * runs in `<span>`s the same way. An inline element holding block elements is
 * not valid HTML: the editable re-parses it on insert, the parser clones the
 * wrapper into every block, and block-level commands — alignment, headings,
 * lists — then act on the wrapper instead of the paragraph. That is what makes
 * a pasted resume arrive centred with the outline showing a single heading.
 *
 * Unwrap them so the paste arrives as top-level blocks, carrying the wrapper's
 * own formatting down rather than dropping it.
 */
function unwrapInlineBlockWrappers(root: HTMLElement) {
  const doc = root.ownerDocument
  const selector = INLINE_WRAPPERS.join(', ')
  // Unwrapping can expose another wrapper a level up, so repeat until clean.
  for (let pass = 0; pass < 20; pass++) {
    const wrappers = Array.from(root.querySelectorAll(selector)).filter((el) =>
      Array.from(el.children).some((c) => BLOCK.has(c.tagName.toLowerCase())),
    )
    if (!wrappers.length) return
    for (const wrapper of wrappers) {
      const tag = wrapper.tagName.toLowerCase()
      const style = wrapper.getAttribute('style') ?? ''
      // Google's wrapper is `font-weight: normal` precisely so it formats nothing.
      const neutered = /font-weight\s*:\s*(normal|[1-5]00)/i.test(style)
      const mark = neutered || tag === 'span' || tag === 'font' ? null : KEEP_AS[tag] ?? tag
      const inherited = readStyleMap(style)
      inherited.delete('font-weight')

      for (const child of Array.from(wrapper.children)) {
        if (!BLOCK.has(child.tagName.toLowerCase())) continue
        if (mark) {
          const inline = doc.createElement(mark)
          while (child.firstChild) inline.appendChild(child.firstChild)
          child.appendChild(inline)
        }
        if (inherited.size) {
          const own = readStyleMap(child.getAttribute('style') ?? '')
          // The block's own declarations win, as they would in the cascade.
          const merged = new Map(inherited)
          for (const [k, v] of own) merged.set(k, v)
          child.setAttribute('style', writeStyleMap(merged))
        }
      }
      wrapper.replaceWith(...Array.from(wrapper.childNodes))
    }
  }
}

/**
 * `execCommand('insertHTML')` merges the first pasted block into the block the
 * caret is sitting in, so pasting into the centred name line of a starter
 * document drags that centring across the whole paste. A block that states its
 * own alignment has nothing to inherit.
 */
function anchorBlockAlignment(root: HTMLElement) {
  for (const block of Array.from(root.querySelectorAll('p, h1, h2, h3, li, blockquote'))) {
    const map = readStyleMap(block.getAttribute('style') ?? '')
    if ((map.get('display') ?? '').toLowerCase() === 'flex') continue
    if (map.get('text-align')) continue
    map.set('text-align', 'left')
    block.setAttribute('style', writeStyleMap(map))
  }
}

/**
 * Rebuilds `html` from the whitelist. Also guarantees at least one block, so a
 * freshly emptied document still has a paragraph for the caret to sit in.
 *
 * Word/Google Docs often put a full `<html><head><style>…` document on the
 * clipboard. Parse that as-is so class rules in `<head>` can be resolved onto
 * the body before classes are stripped.
 */
export function sanitizeDocumentHtml(html: string, options: { paste?: boolean } = {}): string {
  if (!hasDom()) return stripToWhitelist(html)
  const looksComplete = /<html[\s>]|<body[\s>]/i.test(html)
  const parsed = new DOMParser().parseFromString(
    looksComplete ? html : '<body>' + html + '</body>',
    'text/html',
  )
  applyEmbeddedStyles(parsed.body)
  // Before anything reads the block structure — the wrappers hide it.
  unwrapInlineBlockWrappers(parsed.body)
  promotePresentationalAttrs(parsed.body)
  // Before normalizeLists, which reads padding-left to decide the indent.
  normalizeLogicalProperties(parsed.body)
  fitTablesToContentWidth(parsed.body)
  normalizeLists(parsed.body)
  normalizeTabStops(parsed.body)
  keepEmptyBlocksVisible(parsed.body)
  // Paste only: a stored document's line-height was either typed by the user
  // with the ribbon or already cleaned on its way in.
  if (options.paste) stripSpacing(parsed.body, { margins: 'zero' })
  if (options.paste) anchorBlockAlignment(parsed.body)
  const out: string[] = []
  serialize(parsed.body, out)
  const cleaned = out
    .join('')
    .replace(/<p>(\s|&nbsp;)*<\/p>/g, '<p><br></p>')
    .trim()
  return cleaned || '<p><br></p>'
}

/**
 * Bakes the paste's `<style>` rules onto the elements they match, then hands
 * back the body HTML.
 *
 * A schema-based editor filters what it is given, but its parser never resolves
 * CSS classes — and Word puts almost everything in a `<style>` block keyed by
 * `class=MsoNormal`, so without this step a Word paste arrives as bare tags
 * with its spacing and indent already gone.
 */
export function resolveEmbeddedStyles(html: string): string {
  if (!hasDom()) return html
  const looksComplete = /<html[\s>]|<body[\s>]/i.test(html)
  const parsed = new DOMParser().parseFromString(
    looksComplete ? html : '<body>' + html + '</body>',
    'text/html',
  )
  applyEmbeddedStyles(parsed.body)
  normalizeLogicalProperties(parsed.body)
  return parsed.body.innerHTML
}

/**
 * Everything the editor hands to ProseMirror on a paste.
 *
 * Two jobs, in order. Resolve the source's `<style>` block, or Word's spacing
 * and indent never arrive at all. Then remove the typography the schema *does*
 * declare — font family and size — because those are declared for the ribbon's
 * benefit, not the clipboard's: kept, they would pin pasted text to Calibri
 * 11pt and Arial 20.5pt and put it beyond the page's font controls, which is
 * the bug this whole approach exists to end. Leading needs no handling here;
 * the schema has no line-height attribute, so it cannot survive the parse.
 */
export function preparePastedHtml(html: string): string {
  if (!hasDom()) return html
  const resolved = resolveEmbeddedStyles(html)
  const parsed = new DOMParser().parseFromString('<body>' + resolved + '</body>', 'text/html')
  for (const el of Array.from(parsed.body.querySelectorAll('[style]'))) {
    const map = readStyleMap(el.getAttribute('style') ?? '')
    let changed = false
    for (const prop of ['font-family', 'font-size', 'line-height']) {
      if (map.delete(prop)) changed = true
    }
    if (!changed) continue
    const next = writeStyleMap(map)
    if (next) el.setAttribute('style', next)
    else el.removeAttribute('style')
  }
  return parsed.body.innerHTML
}

/**
 * Clears spacing a paste baked into stored content, so the page's Line spacing
 * and margins govern the whole document again. Unlike the paste-time pass this
 * also drops paragraph gaps, which is the point: it is the user saying they
 * want the document's own rhythm rather than the one Word arrived with.
 */
export function resetDocumentSpacing(html: string): string {
  if (!hasDom()) return html
  const parsed = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html')
  stripSpacing(parsed.body, { margins: 'all' })
  const out: string[] = []
  serialize(parsed.body, out)
  return out.join('').trim() || '<p><br></p>'
}

/**
 * How many elements carry their own spacing. Used to explain why the page
 * controls look like they are doing nothing, rather than leaving the user to
 * work it out.
 */
export function countInlineSpacing(html: string) {
  let line_height = 0
  let margins = 0
  for (const match of html.matchAll(/style\s*=\s*"([^"]*)"/gi)) {
    const style = match[1]
    if (/(^|;)\s*line-height\s*:/i.test(style)) line_height += 1
    if (/(^|;)\s*margin(-top|-bottom)?\s*:/i.test(style)) margins += 1
  }
  return { line_height, margins, total: line_height + margins }
}

/** HTML for a Google Docs–style left / right line (company + location, etc.). */
export function splitLineHtml(left = 'Left', right = 'Right') {
  return (
    '<p style="display: flex; justify-content: space-between; align-items: baseline; gap: 1em; width: 100%">' +
    '<span>' +
    escapeText(left) +
    '</span>' +
    '<span style="text-align: right; white-space: nowrap; flex-shrink: 0; margin-left: 1em">' +
    escapeText(right) +
    '</span></p>'
  )
}

/**
 * Block-aware plain text. Used by the exports, by the ATS/keyword checks, and as
 * the input when a document is converted back into a structured profile — so the
 * line breaks have to match what a PDF text extractor would produce.
 */
export function documentToText(html: string): string {
  if (!hasDom()) {
    return html
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|h1|h2|h3|div|li|tr|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html')
  const lines: string[] = []
  let current = ''

  const flush = () => {
    const text = current.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
    if (text) lines.push(text)
    current = ''
  }

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        current += child.nodeValue ?? ''
        continue
      }
      if (child.nodeType !== 1) continue
      const el = child as Element
      const tag = el.tagName.toLowerCase()
      if (DROP_WITH_CONTENT.has(tag)) continue
      if (tag === 'br' || tag === 'hr') {
        flush()
        continue
      }
      if (tag === 'li') {
        flush()
        current = '- '
        walk(el)
        flush()
        continue
      }
      if (tag === 'td' || tag === 'th') {
        walk(el)
        current += '\t'
        continue
      }
      if (BLOCK.has(tag) || tag === 'div') {
        flush()
        walk(el)
        flush()
        continue
      }
      walk(el)
    }
  }

  walk(doc.body)
  flush()
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Counts shown in the editor status bar. */
export function documentCounts(html: string) {
  const text = documentToText(html)
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    characters: text.replace(/\s/g, '').length,
  }
}
