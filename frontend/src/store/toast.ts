import { create } from 'zustand'
import { uid } from '@/lib/utils'

export interface Toast {
  id: string
  tone: 'success' | 'error' | 'info'
  title: string
  body?: string
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push(toast) {
    const id = uid('toast')
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 6000)
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))

export const toast = {
  success: (title: string, body?: string) => useToasts.getState().push({ tone: 'success', title, body }),
  error: (title: string, body?: string) => useToasts.getState().push({ tone: 'error', title, body }),
  info: (title: string, body?: string) => useToasts.getState().push({ tone: 'info', title, body }),
}

/** Turn any thrown value into a toast, and hand back the message. */
export function toastError(err: unknown, fallback = 'Something went wrong') {
  const message = err instanceof Error ? err.message : String(err ?? fallback)
  toast.error(fallback, message)
  return message
}
