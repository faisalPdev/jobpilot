import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { DocumentPage } from '@/types'
import { DOC_FONTS } from '@/lib/doc/sanitize'
import {
  MARGIN_PRESETS,
  LINE_SPACING_PRESETS,
  PARAGRAPH_SPACING_PRESETS,
  paragraphSpacing,
} from '@/lib/doc/render'
import { cn } from '@/lib/utils'

/** Sizes the size menu offers. Anything else can still arrive via a paste. */
export const FONT_SIZES = [8, 9, 9.5, 10, 10.5, 11, 12, 14, 16, 18, 22, 26, 32]

/** Theme row — resume-safe neutrals and accents. */
export const THEME_COLORS = [
  { label: 'Black', value: '#14161a' },
  { label: 'Charcoal', value: '#2a2f38' },
  { label: 'Graphite', value: '#3d4553' },
  { label: 'Slate', value: '#697691' },
  { label: 'Silver', value: '#9aa3b2' },
  { label: 'Light grey', value: '#c8ccd4' },
  { label: 'Off white', value: '#f4f5f7' },
  { label: 'White', value: '#ffffff' },
  { label: 'Navy', value: '#1c2caf' },
  { label: 'Brand blue', value: '#1f40e9' },
]

/**
 * Standard palette — rows of hue families (Google Docs / Word style).
 * Columns go light → dark within each family.
 */
export const STANDARD_COLOR_ROWS: { label: string; colors: string[] }[] = [
  {
    label: 'Reds',
    colors: ['#fef2f2', '#fecaca', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#7f1d1d', '#450a0a'],
  },
  {
    label: 'Oranges',
    colors: ['#fff7ed', '#fed7aa', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#7c2d12', '#431407'],
  },
  {
    label: 'Ambers',
    colors: ['#fffbeb', '#fde68a', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#78350f', '#451a03'],
  },
  {
    label: 'Yellows',
    colors: ['#fefce8', '#fef08a', '#facc15', '#eab308', '#ca8a04', '#a16207', '#713f12', '#422006'],
  },
  {
    label: 'Limes',
    colors: ['#f7fee7', '#d9f99d', '#a3e635', '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', '#1a2e05'],
  },
  {
    label: 'Greens',
    colors: ['#f0fdf4', '#bbf7d0', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#14532d', '#052e16'],
  },
  {
    label: 'Teals',
    colors: ['#f0fdfa', '#99f6e4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#042f2e'],
  },
  {
    label: 'Cyans',
    colors: ['#ecfeff', '#a5f3fc', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#083344'],
  },
  {
    label: 'Blues',
    colors: ['#eff6ff', '#bfdbfe', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e3a8a', '#172554'],
  },
  {
    label: 'Indigos',
    colors: ['#eef2ff', '#c7d2fe', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#312e81', '#1e1b4b'],
  },
  {
    label: 'Violets',
    colors: ['#f5f3ff', '#ddd6fe', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#4c1d95', '#2e1065'],
  },
  {
    label: 'Fuchias',
    colors: ['#fdf4ff', '#f5d0fe', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#701a75', '#4a044e'],
  },
  {
    label: 'Pinks',
    colors: ['#fdf2f8', '#fbcfe8', '#f472b6', '#ec4899', '#db2777', '#be185d', '#831843', '#500724'],
  },
  {
    label: 'Roses',
    colors: ['#fff1f2', '#fecdd3', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#881337', '#4c0519'],
  },
  {
    label: 'Greys',
    colors: ['#f8fafc', '#e2e8f0', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'],
  },
]

/** Flat list kept for any older imports. */
export const TEXT_COLORS = [
  ...THEME_COLORS,
  ...STANDARD_COLOR_ROWS.flatMap((row) =>
    row.colors.map((value, i) => ({ label: `${row.label} ${i + 1}`, value })),
  ),
]

export const BORDER_COLORS = THEME_COLORS

export const BLOCK_STYLES = [
  { value: 'h1', label: 'Title' },
  { value: 'h2', label: 'Section heading' },
  { value: 'h3', label: 'Sub-heading' },
  { value: 'p', label: 'Normal text' },
]

export interface ToolbarState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  ul: boolean
  ol: boolean
  align: 'left' | 'center' | 'right' | 'justify'
  block: string
  fontFamily: string
  fontSizePt: number
}

export type ToolbarAction =
  | { type: 'exec'; command: string; value?: string }
  | { type: 'block'; value: string }
  | { type: 'fontFamily'; value: string }
  | { type: 'fontSize'; value: number }
  | { type: 'color'; value: string }
  | { type: 'border'; widthPt: number; color?: string }
  | { type: 'padding'; valuePt: number }
  | { type: 'splitLine' }
  | { type: 'link' }
  | { type: 'unlink' }
  | { type: 'image' }
  | { type: 'rule' }
  | { type: 'clear' }

export const BORDER_PRESETS = [
  { label: 'None', widthPt: 0 },
  { label: 'Hairline', widthPt: 0.5 },
  { label: 'Thin', widthPt: 1 },
  { label: 'Medium', widthPt: 1.5 },
  { label: 'Thick', widthPt: 2.25 },
]

export const PADDING_PRESETS = [0, 2, 4, 6, 8, 12, 16]

/**
 * The formatting ribbon. Every control uses `onMouseDown` + `preventDefault`
 * rather than `onClick`: the selection in the page must survive the press, and a
 * click would have blurred the editable first.
 */
export function DocumentToolbar({
  state,
  page,
  zoom,
  onZoom,
  onAction,
  onPageChange,
  disabled = false,
}: {
  state: ToolbarState
  page: DocumentPage
  zoom: number
  onZoom: (zoom: number) => void
  onAction: (action: ToolbarAction) => void
  onPageChange?: (page: DocumentPage) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'sticky top-0 z-20 flex flex-wrap items-center gap-1 rounded-xl border border-ink-200 bg-surface px-2 py-1.5 shadow-card',
        disabled && 'pointer-events-none opacity-50',
      )}
      role="toolbar"
      aria-label="Document formatting"
    >
      <Group>
        <Tool label="Undo (Ctrl+Z)" onPress={() => onAction({ type: 'exec', command: 'undo' })}>
          <Undo />
        </Tool>
        <Tool label="Redo (Ctrl+Shift+Z)" onPress={() => onAction({ type: 'exec', command: 'redo' })}>
          <Undo flip />
        </Tool>
      </Group>

      <Divider />

      <select
        aria-label="Zoom"
        className="h-7 rounded-md border border-ink-200 bg-surface px-1 text-xs text-ink-700"
        value={String(zoom)}
        onChange={(e) => onZoom(Number(e.target.value))}
      >
        {[0.5, 0.75, 0.9, 1, 1.25, 1.5].map((z) => (
          <option key={z} value={z}>
            {Math.round(z * 100)}%
          </option>
        ))}
      </select>

      <div
        className="flex h-7 items-center gap-0.5 rounded-md border border-ink-200 bg-surface pl-1 pr-0.5"
        title="Page margins — white space around the page (indent cannot remove this)"
      >
        <span className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">Margin</span>
        <select
          aria-label="Page margin preset"
          className="h-6 max-w-[6.5rem] border-0 bg-transparent px-0.5 text-xs text-ink-700 outline-none"
          value={MARGIN_PRESETS.some((m) => m.value === page.margin_mm) ? String(page.margin_mm) : 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') return
            onPageChange?.({ ...page, margin_mm: Number(e.target.value) })
          }}
        >
          {MARGIN_PRESETS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.value} mm
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        <input
          type="number"
          min={0}
          max={50}
          step={1}
          inputMode="numeric"
          aria-label="Custom page margin in millimetres"
          title="Custom margin (mm)"
          className="h-6 w-11 rounded border-0 bg-ink-50 px-1 text-center text-xs tabular-nums text-ink-800 outline-none focus:ring-1 focus:ring-brand-300"
          value={page.margin_mm}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return
            const n = Number(raw)
            if (!Number.isFinite(n)) return
            onPageChange?.({ ...page, margin_mm: Math.min(50, Math.max(0, Math.round(n))) })
          }}
        />
        <span className="pr-1 text-[10px] text-ink-400">mm</span>
      </div>

      <div
        className="flex h-7 items-center gap-0.5 rounded-md border border-ink-200 bg-surface pl-1 pr-0.5"
        title="Line spacing for the whole page"
      >
        <span className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">Spacing</span>
        <select
          aria-label="Line spacing preset"
          className="h-6 max-w-[7rem] border-0 bg-transparent px-0.5 text-xs text-ink-700 outline-none"
          value={
            LINE_SPACING_PRESETS.some((p) => p.value === page.line_height)
              ? String(page.line_height)
              : 'custom'
          }
          onChange={(e) => {
            if (e.target.value === 'custom') return
            onPageChange?.({ ...page, line_height: Number(e.target.value) })
          }}
        >
          {LINE_SPACING_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        <input
          type="number"
          min={0.8}
          max={3}
          step={0.05}
          inputMode="decimal"
          aria-label="Custom line spacing"
          title="Custom line spacing"
          className="h-6 w-12 rounded border-0 bg-ink-50 px-1 text-center text-xs tabular-nums text-ink-800 outline-none focus:ring-1 focus:ring-brand-300"
          value={page.line_height}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return
            const n = Number(raw)
            if (!Number.isFinite(n)) return
            onPageChange?.({
              ...page,
              line_height: Math.min(3, Math.max(0.8, Math.round(n * 100) / 100)),
            })
          }}
        />
      </div>

      <div
        className="flex h-7 items-center gap-0.5 rounded-md border border-ink-200 bg-surface pl-1 pr-0.5"
        title="Space between paragraphs, for the whole page"
      >
        <span className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">Para</span>
        <select
          aria-label="Paragraph spacing preset"
          className="h-6 max-w-[7rem] border-0 bg-transparent px-0.5 text-xs text-ink-700 outline-none"
          value={
            PARAGRAPH_SPACING_PRESETS.some((p) => p.value === paragraphSpacing(page))
              ? String(paragraphSpacing(page))
              : 'custom'
          }
          onChange={(e) => {
            if (e.target.value === 'custom') return
            onPageChange?.({ ...page, paragraph_spacing: Number(e.target.value) })
          }}
        >
          {PARAGRAPH_SPACING_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        <input
          type="number"
          min={0}
          max={3}
          step={0.05}
          inputMode="decimal"
          aria-label="Custom paragraph spacing"
          title="Custom paragraph spacing"
          className="h-6 w-12 rounded border-0 bg-ink-50 px-1 text-center text-xs tabular-nums text-ink-800 outline-none focus:ring-1 focus:ring-brand-300"
          value={paragraphSpacing(page)}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return
            const n = Number(raw)
            if (!Number.isFinite(n)) return
            onPageChange?.({
              ...page,
              paragraph_spacing: Math.min(3, Math.max(0, Math.round(n * 100) / 100)),
            })
          }}
        />
      </div>

      <Divider />

      <select
        aria-label="Paragraph style"
        className="h-7 w-[9.5rem] rounded-md border border-ink-200 bg-surface px-1 text-xs text-ink-700"
        value={BLOCK_STYLES.some((b) => b.value === state.block) ? state.block : 'p'}
        onChange={(e) => onAction({ type: 'block', value: e.target.value })}
      >
        {BLOCK_STYLES.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Font"
        className="h-7 w-[8.5rem] rounded-md border border-ink-200 bg-surface px-1 text-xs text-ink-700"
        value={DOC_FONTS.some((f) => f.value === state.fontFamily) ? state.fontFamily : page.font_family}
        onChange={(e) => onAction({ type: 'fontFamily', value: e.target.value })}
      >
        {DOC_FONTS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Font size"
        className="h-7 w-[4.2rem] rounded-md border border-ink-200 bg-surface px-1 text-xs tabular-nums text-ink-700"
        value={String(state.fontSizePt)}
        onChange={(e) => onAction({ type: 'fontSize', value: Number(e.target.value) })}
      >
        {[...new Set([...FONT_SIZES, state.fontSizePt])]
          .sort((a, b) => a - b)
          .map((size) => (
            <option key={size} value={size}>
              {size} pt
            </option>
          ))}
      </select>

      <Divider />

      <Group>
        <Tool label="Bold (Ctrl+B)" active={state.bold} onPress={() => onAction({ type: 'exec', command: 'bold' })}>
          <span className="font-bold">B</span>
        </Tool>
        <Tool label="Italic (Ctrl+I)" active={state.italic} onPress={() => onAction({ type: 'exec', command: 'italic' })}>
          <span className="font-serif italic">I</span>
        </Tool>
        <Tool
          label="Underline (Ctrl+U)"
          active={state.underline}
          onPress={() => onAction({ type: 'exec', command: 'underline' })}
        >
          <span className="underline">U</span>
        </Tool>
        <Tool
          label="Strikethrough"
          active={state.strike}
          onPress={() => onAction({ type: 'exec', command: 'strikeThrough' })}
        >
          <span className="line-through">S</span>
        </Tool>
        <ColorTool onPick={(value) => onAction({ type: 'color', value })} />
      </Group>

      <Divider />

      <Group>
        <Tool label="Align left" active={state.align === 'left'} onPress={() => onAction({ type: 'exec', command: 'justifyLeft' })}>
          <Align lines={[1, 0.65, 0.9, 0.55]} />
        </Tool>
        <Tool label="Centre" active={state.align === 'center'} onPress={() => onAction({ type: 'exec', command: 'justifyCenter' })}>
          <Align lines={[1, 0.65, 0.9, 0.55]} align="center" />
        </Tool>
        <Tool label="Align right" active={state.align === 'right'} onPress={() => onAction({ type: 'exec', command: 'justifyRight' })}>
          <Align lines={[1, 0.65, 0.9, 0.55]} align="right" />
        </Tool>
        <Tool label="Justify" active={state.align === 'justify'} onPress={() => onAction({ type: 'exec', command: 'justifyFull' })}>
          <Align lines={[1, 1, 1, 1]} />
        </Tool>
      </Group>

      <Divider />

      <Group>
        <Tool label="Bulleted list" active={state.ul} onPress={() => onAction({ type: 'exec', command: 'insertUnorderedList' })}>
          <ListIcon ordered={false} />
        </Tool>
        <Tool label="Numbered list" active={state.ol} onPress={() => onAction({ type: 'exec', command: 'insertOrderedList' })}>
          <ListIcon ordered />
        </Tool>
        <Tool label="Decrease indent" onPress={() => onAction({ type: 'exec', command: 'outdent' })}>
          <Indent out />
        </Tool>
        <Tool label="Increase indent (Tab)" onPress={() => onAction({ type: 'exec', command: 'indent' })}>
          <Indent />
        </Tool>
      </Group>

      <Divider />

      <Group>
        <BorderTool onPick={(widthPt, color) => onAction({ type: 'border', widthPt, color })} />
        <PaddingTool onPick={(valuePt) => onAction({ type: 'padding', valuePt })} />
      </Group>

      <Divider />

      <Group>
        <Tool label="Insert link (Ctrl+K)" onPress={() => onAction({ type: 'link' })}>
          <LinkIcon />
        </Tool>
        <Tool label="Remove link" onPress={() => onAction({ type: 'unlink' })}>
          <LinkIcon broken />
        </Tool>
        <Tool label="Horizontal rule" onPress={() => onAction({ type: 'rule' })}>
          <span className="text-sm leading-none">—</span>
        </Tool>
        <Tool
          label="Left / right line (Tab) — like Google Docs right-tab for dates and locations"
          onPress={() => onAction({ type: 'splitLine' })}
        >
          <SplitLineIcon />
        </Tool>
        <Tool label="Insert image" onPress={() => onAction({ type: 'image' })}>
          <ImageIcon />
        </Tool>
        <Tool label="Clear formatting" onPress={() => onAction({ type: 'clear' })}>
          <span className="text-[11px] leading-none">T</span>
          <span className="text-[9px] leading-none">✕</span>
        </Tool>
      </Group>
    </div>
  )
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-ink-200" aria-hidden />
}

function Tool({
  label,
  active,
  onPress,
  children,
}: {
  label: string
  active?: boolean
  onPress: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault()
        onPress()
      }}
      className={cn(
        'flex h-7 min-w-[1.75rem] items-center justify-center gap-px rounded-md px-1.5 text-xs',
        active ? 'bg-brand-100 text-brand-800' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
      )}
    >
      {children}
    </button>
  )
}

function ColorTool({ onPick }: { onPick: (value: string) => void }) {
  return (
    <PalettePopover
      label="Text colour"
      trigger={
        <>
          <span className="text-[11px] font-semibold leading-none">A</span>
          <span className="mt-0.5 h-1 w-3.5 rounded-sm bg-gradient-to-r from-ink-900 via-brand-600 to-rose-600" />
        </>
      }
    >
      {(close) => (
        <ColorPalettePanel
          title="Text colour"
          onPick={(value) => {
            onPick(value)
            close()
          }}
        />
      )}
    </PalettePopover>
  )
}

function BorderTool({ onPick }: { onPick: (widthPt: number, color?: string) => void }) {
  return (
    <PalettePopover
      label="Border on selection"
      trigger={<BorderIcon />}
      panelClassName="w-[17.5rem]"
    >
      {(close) => (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Weight</p>
          <div className="grid grid-cols-1 gap-0.5">
            {BORDER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(preset.widthPt)
                  close()
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-ink-700 hover:bg-ink-100"
              >
                <span
                  className="inline-block h-3 w-6 rounded-sm"
                  style={{
                    border: preset.widthPt
                      ? `${Math.max(1, preset.widthPt)}px solid #14161a`
                      : '1px dashed #c8ccd4',
                  }}
                />
                {preset.label}
              </button>
            ))}
          </div>
          <ColorPalettePanel
            title="Border colour"
            onPick={(value) => {
              onPick(1, value)
              close()
            }}
          />
        </div>
      )}
    </PalettePopover>
  )
}

function PalettePopover({
  label,
  trigger,
  children,
  panelClassName,
}: {
  label: string
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className={cn(
          'flex h-7 min-w-[1.75rem] flex-col items-center justify-center rounded-md px-1.5 text-ink-600 hover:bg-ink-100',
          open && 'bg-ink-100 text-ink-900',
        )}
      >
        {trigger}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 pt-1">
          <div
            className={cn(
              'rounded-lg border border-ink-200 bg-surface p-2.5 shadow-pop',
              panelClassName ?? 'w-[17.5rem]',
            )}
          >
            {children(() => setOpen(false))}
          </div>
        </div>
      )}
    </div>
  )
}

function ColorPalettePanel({
  title,
  onPick,
}: {
  title: string
  onPick: (value: string) => void
}) {
  const customId = useId()
  const [hex, setHex] = useState('#14161a')

  const applyCustom = (raw: string) => {
    const value = normalizeHex(raw)
    if (!value) return
    setHex(value)
    onPick(value)
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{title}</p>

      <div>
        <p className="mb-1 text-[10px] text-ink-400">Theme</p>
        <div className="grid grid-cols-10 gap-1">
          {THEME_COLORS.map((c) => (
            <Swatch key={c.value} label={c.label} value={c.value} onPick={onPick} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] text-ink-400">Standard</p>
        <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5 scrollbar-thin">
          {STANDARD_COLOR_ROWS.map((row) => (
            <div key={row.label} className="grid grid-cols-8 gap-1" title={row.label}>
              {row.colors.map((value) => (
                <Swatch key={value} label={`${row.label} ${value}`} value={value} onPick={onPick} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] text-ink-400">Custom</p>
        <div className="flex items-center gap-2">
          <label htmlFor={customId} className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-ink-200">
            <span className="absolute inset-0" style={{ background: normalizeHex(hex) ?? '#14161a' }} />
            <input
              id={customId}
              type="color"
              value={normalizeHex(hex) ?? '#14161a'}
              aria-label="Custom colour picker"
              className="absolute inset-0 cursor-pointer opacity-0"
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => applyCustom(e.target.value)}
            />
          </label>
          <input
            type="text"
            spellCheck={false}
            aria-label="Custom colour hex"
            placeholder="#14161a"
            value={hex}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyCustom(hex)
              }
            }}
            onBlur={() => {
              const value = normalizeHex(hex)
              if (value) setHex(value)
            }}
            className="h-7 flex-1 rounded-md border border-ink-200 bg-surface px-2 font-mono text-xs text-ink-800 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
          />
          <button
            type="button"
            className="h-7 rounded-md border border-ink-200 px-2 text-xs text-ink-700 hover:bg-ink-100"
            onMouseDown={(e) => {
              e.preventDefault()
              applyCustom(hex)
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

function Swatch({
  label,
  value,
  onPick,
}: {
  label: string
  value: string
  onPick: (value: string) => void
}) {
  const light = isLightColor(value)
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => {
        e.preventDefault()
        onPick(value)
      }}
      className={cn(
        'h-5 w-5 rounded-sm border transition hover:scale-110 hover:shadow-sm',
        light ? 'border-ink-300' : 'border-ink-200/80',
      )}
      style={{ background: value }}
    />
  )
}

function normalizeHex(raw: string): string | null {
  const value = raw.trim()
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('')
  }
  return ('#' + hex).toLowerCase()
}

function isLightColor(hex: string) {
  const normalized = normalizeHex(hex)
  if (!normalized) return false
  const n = Number.parseInt(normalized.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 200
}

function PaddingTool({ onPick }: { onPick: (valuePt: number) => void }) {
  return (
    <div className="group relative">
      <button
        type="button"
        title="Padding on selection"
        aria-label="Padding on selection"
        onMouseDown={(e) => e.preventDefault()}
        className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-ink-600 hover:bg-ink-100"
      >
        <PaddingIcon />
      </button>
      <div className="pointer-events-none absolute left-0 top-full z-30 hidden pt-1 group-hover:block group-focus-within:block">
        <div className="pointer-events-auto w-36 space-y-1 rounded-lg border border-ink-200 bg-surface p-2 shadow-pop">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Padding</p>
          {PADDING_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(value)
              }}
              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs text-ink-700 hover:bg-ink-100"
            >
              <span>{value === 0 ? 'None' : value + ' pt'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- icons */

const svg = 'h-3.5 w-3.5 fill-none stroke-current'

function BorderIcon() {
  return (
    <svg viewBox="0 0 16 16" className={svg} strokeWidth={1.4} aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="0.5" />
    </svg>
  )
}

function SplitLineIcon() {
  return (
    <svg viewBox="0 0 16 16" className={svg} strokeWidth={1.4} strokeLinecap="round" aria-hidden>
      <line x1="2" y1="5" x2="7" y2="5" />
      <line x1="9" y1="5" x2="14" y2="5" />
      <line x1="2" y1="11" x2="6" y2="11" />
      <line x1="10" y1="11" x2="14" y2="11" />
    </svg>
  )
}

function PaddingIcon() {
  return (
    <svg viewBox="0 0 16 16" className={svg} strokeWidth={1.4} strokeLinecap="round" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="0.5" strokeDasharray="2 1.5" />
      <rect x="5" y="5" width="6" height="6" rx="0.5" />
    </svg>
  )
}

function Align({ lines, align = 'left' }: { lines: number[]; align?: 'left' | 'center' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" className={svg} strokeWidth={1.4} strokeLinecap="round" aria-hidden>
      {lines.map((width, i) => {
        const w = width * 12
        const x = align === 'center' ? 8 - w / 2 : align === 'right' ? 14 - w : 2
        const y = 3 + i * 3.3
        return <line key={i} x1={x} y1={y} x2={x + w} y2={y} />
      })}
    </svg>
  )
}

function ListIcon({ ordered }: { ordered: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={svg} strokeWidth={1.4} strokeLinecap="round" aria-hidden>
      {[3.2, 8, 12.8].map((y, i) => (
        <g key={y}>
          <line x1={6} y1={y} x2={14} y2={y} />
          {ordered ? (
            <text x={1} y={y + 1.9} className="fill-current stroke-none" style={{ fontSize: '5px' }}>
              {i + 1}
            </text>
          ) : (
            <circle cx={2.6} cy={y} r={1.1} className="fill-current stroke-none" />
          )}
        </g>
      ))}
    </svg>
  )
}

function Indent({ out = false }: { out?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={svg} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1={6} y1={3} x2={14} y2={3} />
      <line x1={6} y1={8} x2={14} y2={8} />
      <line x1={6} y1={13} x2={14} y2={13} />
      <polyline points={out ? '4,5.5 1.5,8 4,10.5' : '1.5,5.5 4,8 1.5,10.5'} />
    </svg>
  )
}

function LinkIcon({ broken = false }: { broken?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={svg} strokeWidth={1.4} strokeLinecap="round" aria-hidden>
      <path d="M6.5 9.5 9.5 6.5" />
      <path d="M9 4.5 10.4 3.1a2.4 2.4 0 0 1 3.4 3.4L12.4 7.9" />
      <path d="M7 11.5 5.6 12.9a2.4 2.4 0 0 1-3.4-3.4L3.6 8.1" />
      {broken && <line x1={2} y1={14} x2={14} y2={2} />}
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" className={svg} strokeWidth={1.4} strokeLinejoin="round" aria-hidden>
      <rect x={1.6} y={2.8} width={12.8} height={10.4} rx={1.4} />
      <circle cx={5.6} cy={6.4} r={1.1} />
      <path d="M2.4 12 6 8.6l2.4 2.2 2.2-1.9 3 2.9" />
    </svg>
  )
}

function Undo({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={svg}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <polyline points="5.5,3.5 2,7 5.5,10.5" />
      <path d="M2 7h6.6a4 4 0 0 1 0 8H6" />
    </svg>
  )
}
