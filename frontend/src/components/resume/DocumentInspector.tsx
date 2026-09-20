import type { DocumentPage, PageSize, ResumeDocument } from '@/types'
import type { DocumentReport } from '@/lib/doc/checks'
import {
  MARGIN_PRESETS,
  LINE_SPACING_PRESETS,
  PARAGRAPH_SPACING_PRESETS,
  PAGE_SIZES,
  paragraphSpacing,
} from '@/lib/doc/render'
import { DOC_FONTS, countInlineSpacing, resetDocumentSpacing } from '@/lib/doc/sanitize'
import { FONT_SIZES } from './DocumentToolbar'
import { cn } from '@/lib/utils'
import { Badge, Button, Hint } from '@/components/ui/primitives'
import { Field } from '@/components/ui/inputs'

/** Headings, in order, as a clickable table of contents. */
export function DocumentOutline({
  report,
  onJump,
}: {
  report: DocumentReport
  onJump: (index: number) => void
}) {
  if (report.outline.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink-500">
          No headings yet. Select a line and set it to <b>Title</b> or <b>Section heading</b> in the ribbon —
          the outline builds itself, and an ATS reads the same structure.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-0.5">
        {report.outline.map((item) => (
          <li key={item.index}>
            <button
              type="button"
              onClick={() => onJump(item.index)}
              className={cn(
                'block w-full truncate rounded-md px-2 py-1 text-left text-xs hover:bg-ink-100',
                item.level === 1 && 'font-semibold text-ink-900',
                item.level === 2 && 'pl-3 text-ink-700',
                item.level === 3 && 'pl-6 text-ink-500',
              )}
              title={item.text}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ul>
      <Hint>Click a heading to jump to it.</Hint>
    </div>
  )
}

/** The document-mode equivalent of the structured score + ATS panels. */
export function DocumentChecks({ report }: { report: DocumentReport }) {
  const errors = report.issues.filter((i) => i.severity === 'error')
  const warnings = report.issues.filter((i) => i.severity === 'warning')
  const infos = report.issues.filter((i) => i.severity === 'info')
  const { stats } = report

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label="words" value={stats.words} />
        <Stat label="pages" value={stats.pages} tone={stats.pages > 2 ? 'warning' : 'plain'} />
        <Stat label="bullets" value={stats.bullets} />
        <Stat
          label="w/ metrics"
          value={stats.bullets ? Math.round((stats.quantified / stats.bullets) * 100) + '%' : '—'}
          tone={stats.bullets && stats.quantified / stats.bullets < 0.4 ? 'warning' : 'plain'}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {report.sections.map((section) => (
          <Badge key={section.key} tone={section.found ? 'success' : 'neutral'}>
            {section.found ? '✓' : '○'} {section.key}
          </Badge>
        ))}
      </div>

      {errors.length === 0 ? (
        <Badge tone="success">✓ No blocking issues</Badge>
      ) : (
        <Badge tone="danger">
          {errors.length} blocking issue{errors.length === 1 ? '' : 's'}
        </Badge>
      )}

      {report.issues.length === 0 ? (
        <p className="text-xs text-ink-500">
          Contact details present, standard headings, no tables or images. This page will survive a parser.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...errors, ...warnings, ...infos].map((issue) => (
            <li
              key={issue.code + issue.message}
              className={cn(
                'rounded-lg border p-2.5',
                issue.severity === 'error'
                  ? 'border-rose-200 bg-rose-50'
                  : issue.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-ink-200 bg-ink-50',
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-px text-xs font-bold',
                    issue.severity === 'error'
                      ? 'text-rose-600'
                      : issue.severity === 'warning'
                        ? 'text-amber-600'
                        : 'text-ink-400',
                  )}
                >
                  {issue.severity === 'error' ? '!' : issue.severity === 'warning' ? '▲' : 'i'}
                </span>
                <div>
                  <p className="text-xs font-medium text-ink-800">{issue.message}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{issue.fix}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {report.skills.length > 0 && (
        <div>
          <p className="label">Skills detected on the page</p>
          <div className="flex flex-wrap gap-1">
            {report.skills.slice(0, 24).map((skill) => (
              <Badge key={skill}>{skill}</Badge>
            ))}
          </div>
        </div>
      )}

      <Hint>
        A document is not scored on the structured rubric — there are no fields to read. Convert it back to a
        structured resume when you want matching, tailoring and the full score.
      </Hint>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: number | string
  tone?: 'plain' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-ink-200 p-2 text-center">
      <div className={cn('text-base font-semibold tabular-nums', tone === 'warning' ? 'text-amber-600' : 'text-ink-900')}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-ink-500">{label}</div>
    </div>
  )
}

/** Page size, margins and the base typography — the document's own defaults. */
export function DocumentPageSetup({
  doc,
  onChange,
}: {
  doc: ResumeDocument
  onChange: (doc: ResumeDocument) => void
}) {
  const set = (patch: Partial<DocumentPage>) => onChange({ ...doc, page: { ...doc.page, ...patch } })
  const baked = countInlineSpacing(doc.html)

  return (
    <div className="space-y-3">
      <Field label="Page size">
        <select
          className="input-base"
          value={doc.page.size}
          onChange={(e) => set({ size: e.target.value as PageSize })}
        >
          {Object.entries(PAGE_SIZES).map(([key, geo]) => (
            <option key={key} value={key}>
              {geo.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Page margins"
        hint="White space around the page content — same value on all four sides, and the real print margin on export."
      >
        <div className="space-y-2">
          <select
            className="input-base"
            value={MARGIN_PRESETS.some((m) => m.value === doc.page.margin_mm) ? String(doc.page.margin_mm) : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'custom') return
              set({ margin_mm: Number(e.target.value) })
            }}
          >
            {MARGIN_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
            {!MARGIN_PRESETS.some((m) => m.value === doc.page.margin_mm) && (
              <option value="custom">Custom ({doc.page.margin_mm} mm)</option>
            )}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              className="input-base w-24 tabular-nums"
              value={doc.page.margin_mm}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                set({ margin_mm: Math.min(50, Math.max(0, Math.round(n))) })
              }}
              aria-label="Custom margin in millimetres"
            />
            <span className="text-xs text-ink-500">mm on every side</span>
          </div>
        </div>
      </Field>

      <Field label="Body font">
        <select
          className="input-base"
          value={doc.page.font_family}
          onChange={(e) => set({ font_family: e.target.value })}
        >
          {DOC_FONTS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Body size">
        <select
          className="input-base"
          value={String(doc.page.font_size_pt)}
          onChange={(e) => set({ font_size_pt: Number(e.target.value) })}
        >
          {FONT_SIZES.filter((s) => s >= 8 && s <= 14).map((size) => (
            <option key={size} value={size}>
              {size} pt
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Line spacing"
        hint="Space between lines *inside* a paragraph. A paste that made every line its own paragraph has nothing for this to act on — use Paragraph spacing below."
      >
        <div className="space-y-2">
          <select
            className="input-base"
            value={
              LINE_SPACING_PRESETS.some((p) => p.value === doc.page.line_height)
                ? String(doc.page.line_height)
                : 'custom'
            }
            onChange={(e) => {
              if (e.target.value === 'custom') return
              set({ line_height: Number(e.target.value) })
            }}
          >
            {LINE_SPACING_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label} ({preset.value})
              </option>
            ))}
            {!LINE_SPACING_PRESETS.some((p) => p.value === doc.page.line_height) && (
              <option value="custom">Custom ({doc.page.line_height})</option>
            )}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.8}
              max={3}
              step={0.05}
              className="input-base w-24 tabular-nums"
              value={doc.page.line_height}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                set({ line_height: Math.min(3, Math.max(0.8, Math.round(n * 100) / 100)) })
              }}
              aria-label="Custom line spacing"
            />
            <span className="text-xs text-ink-500">× body size</span>
          </div>
        </div>
      </Field>

      <Field
        label="Paragraph spacing"
        hint="Space between one paragraph and the next. This is the one that moves a pasted document, where each line is usually its own paragraph."
      >
        <div className="space-y-2">
          <select
            className="input-base"
            value={
              PARAGRAPH_SPACING_PRESETS.some((p) => p.value === paragraphSpacing(doc.page))
                ? String(paragraphSpacing(doc.page))
                : 'custom'
            }
            onChange={(e) => {
              if (e.target.value === 'custom') return
              set({ paragraph_spacing: Number(e.target.value) })
            }}
          >
            {PARAGRAPH_SPACING_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label} ({preset.value})
              </option>
            ))}
            {!PARAGRAPH_SPACING_PRESETS.some((p) => p.value === paragraphSpacing(doc.page)) && (
              <option value="custom">Custom ({paragraphSpacing(doc.page)})</option>
            )}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={3}
              step={0.05}
              className="input-base w-24 tabular-nums"
              value={paragraphSpacing(doc.page)}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                set({ paragraph_spacing: Math.min(3, Math.max(0, Math.round(n * 100) / 100)) })
              }}
              aria-label="Custom paragraph spacing"
            />
            <span className="text-xs text-ink-500">× body size</span>
          </div>
        </div>
      </Field>

      {baked.total > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs text-ink-700">
            <b>
              {baked.line_height > 0
                ? 'The spacing controls above are not reaching the whole document.'
                : 'Paragraph spacing above is not reaching the whole document.'}
            </b>{' '}
            {baked.total} {baked.total === 1 ? 'block carries' : 'blocks carry'} spacing of their own, pasted in
            from Word or Google Docs. Spacing set directly on a block always wins over the page defaults, so
            those blocks keep their own gaps whatever you choose above.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange({ ...doc, html: resetDocumentSpacing(doc.html) })}
          >
            Clear pasted spacing
          </Button>
          <p className="text-xs text-ink-500">
            Clears line spacing and paragraph gaps only. Bold, italics, headings, bullets, tables, indents and
            alignment are untouched, and this is undoable from version history.
          </p>
        </div>
      )}

      <Hint>
        These are the document's defaults. Anything you set on a selection with the ribbon overrides them, and
        both survive the PDF export unchanged.
      </Hint>
    </div>
  )
}
