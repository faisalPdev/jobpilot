import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { Application, ApplicationStatus } from '@/types'
import { PIPELINE, STATUS_STYLES } from '@/lib/pipeline'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/primitives'

/**
 * Kanban view of the pipeline (§4). Dropping a card into a column records a
 * timestamped status transition, which is what makes time-in-stage analysable
 * later — the board is a write path into history, not just a display.
 */
export function KanbanBoard({
  applications,
  onMove,
}: {
  applications: Application[]
  onMove: (id: string, status: ApplicationStatus, index: number) => void
}) {
  const [dragging, setDragging] = useState<Application | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const columns = PIPELINE.map((status) => ({
    status,
    items: applications
      .filter((app) => app.status === status)
      .sort((a, b) => a.board_index - b.board_index),
  }))

  const onDragStart = (event: DragStartEvent) => {
    setDragging(applications.find((app) => app.id === event.active.id) ?? null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null)
    const { active, over } = event
    if (!over) return
    const target = String(over.id) as ApplicationStatus
    if (!PIPELINE.includes(target)) return
    const app = applications.find((a) => a.id === active.id)
    if (!app || app.status === target) return
    onMove(String(active.id), target, columns.find((c) => c.status === target)?.items.length ?? 0)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-3">
        {columns.map((column) => (
          <Column key={column.status} status={column.status} items={column.items} />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="w-64 rotate-1">
            <Card app={dragging} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ status, items }: { status: ApplicationStatus; items: Application[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const style = STATUS_STYLES[status]

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('h-2 w-2 rounded-full', style.dot)} />
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{status}</span>
        <span className="text-xs tabular-nums text-ink-400">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[8rem] flex-1 flex-col gap-2 rounded-xl border-2 border-dashed p-2 transition-colors',
          isOver ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200 bg-ink-50/40',
        )}
      >
        {items.map((app) => (
          <DraggableCard key={app.id} app={app} />
        ))}
        {items.length === 0 && (
          <p className="px-1 py-6 text-center text-[11px] text-ink-400">Drop here to move to {status}</p>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ app }: { app: Application }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && 'opacity-40')}>
      <Card app={app} />
    </div>
  )
}

function Card({ app, dragging = false }: { app: Application; dragging?: boolean }) {
  const overdue = app.next_follow_up_at && app.next_follow_up_at <= new Date().toISOString()

  return (
    <article
      className={cn(
        'rounded-lg border border-ink-200 bg-surface p-2.5 shadow-card',
        dragging ? 'shadow-pop' : 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/applications/${app.id}`}
          onClick={(e) => e.stopPropagation()}
          className="line-clamp-2 text-xs font-semibold text-ink-900 hover:text-brand-700"
        >
          {app.role_title}
        </Link>
        {app.match_score != null && (
          <span
            className={cn(
              'shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums',
              app.match_score >= 70
                ? 'bg-emerald-50 text-emerald-700'
                : app.match_score >= 50
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-ink-100 text-ink-500',
            )}
            title="Match score against your master resume"
          >
            {Math.round(app.match_score)}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-ink-600">{app.company_name}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded bg-ink-100 px-1 py-0.5 text-[10px] text-ink-600">{app.source}</span>
        {app.attachments.length > 0 && (
          <span className="rounded bg-ink-100 px-1 py-0.5 text-[10px] text-ink-600" title="Frozen submission snapshot">
            📎 {app.attachments.length}
          </span>
        )}
        {overdue && <Badge tone="warning">follow up</Badge>}
      </div>
      <p className="mt-1 text-[10px] text-ink-400">
        {app.applied_at ? `Applied ${formatDate(app.applied_at)}` : `Saved ${relativeTime(app.created_at)}`}
      </p>
    </article>
  )
}
