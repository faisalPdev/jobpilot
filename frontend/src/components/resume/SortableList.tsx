import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

/**
 * Drag-and-drop ordering for resume sections and their items. Order is persisted
 * as `order_index` on each row (spec §2), never as document position.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
  className,
}: {
  items: T[]
  onReorder: (from: number, to: number) => void
  children: (item: T, index: number) => ReactNode
  className?: string
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from >= 0 && to >= 0) onReorder(from, to)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>{items.map((item, index) => children(item, index))}</div>
      </SortableContext>
    </DndContext>
  )
}

export function SortableRow({
  id,
  children,
  className,
  handleClassName,
}: {
  id: string
  children: ReactNode
  className?: string
  handleClassName?: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-90 shadow-pop', className)}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reorder"
        className={cn(
          'absolute left-1 top-2 cursor-grab rounded p-1 text-ink-300 hover:bg-ink-100 hover:text-ink-600 active:cursor-grabbing',
          handleClassName,
        )}
      >
        <svg viewBox="0 0 10 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <circle cx="2" cy="3" r="1.2" />
          <circle cx="8" cy="3" r="1.2" />
          <circle cx="2" cy="8" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="2" cy="13" r="1.2" />
          <circle cx="8" cy="13" r="1.2" />
        </svg>
      </button>
      {children}
    </div>
  )
}
