import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto border-b border-ink-200', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === tab.id
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800',
          )}
        >
          {tab.label}
          {tab.count != null && (
            <span
              className={cn(
                'ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                value === tab.id ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500',
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function KeyValue({
  rows,
  className,
}: {
  rows: { label: ReactNode; value: ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn('divide-y divide-ink-100', className)}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{row.label}</dt>
          <dd className="min-w-0 text-right text-sm text-ink-800">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  className?: string
  sortValue?: (row: T) => string | number
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onRowClick,
  sort,
  onSortChange,
  empty,
  className,
}: {
  rows: T[]
  columns: Column<T>[]
  onRowClick?: (row: T) => void
  sort?: { key: string; dir: 'asc' | 'desc' } | null
  onSortChange?: (next: { key: string; dir: 'asc' | 'desc' }) => void
  empty?: ReactNode
  className?: string
}) {
  const sorted = (() => {
    if (!sort) return rows
    const column = columns.find((c) => c.key === sort.key)
    if (!column?.sortValue) return rows
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a)
      const bv = column.sortValue!(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
      return String(av).localeCompare(String(bv)) * factor
    })
  })()

  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue && onSortChange)
              const active = sort?.key === column.key
              return (
                <th key={column.key} className={column.className}>
                  {sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-ink-800"
                      onClick={() =>
                        onSortChange!({
                          key: column.key,
                          dir: active && sort?.dir === 'asc' ? 'desc' : 'asc',
                        })
                      }
                    >
                      {column.header}
                      <span className={cn('text-[10px]', active ? 'text-brand-600' : 'text-ink-300')}>
                        {active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-10 text-center text-sm text-ink-500">
                {empty ?? 'Nothing here yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
