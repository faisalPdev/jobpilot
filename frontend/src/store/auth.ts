import { create } from 'zustand'
import type { User } from '@/types'
import { api } from '@/lib/api'

interface AuthState {
  user: User | null
  status: 'idle' | 'loading' | 'ready'
  bootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  loginDemo: () => Promise<void>
  register: (input: { email: string; password: string; full_name: string }) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (patch: Partial<User>) => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  async bootstrap() {
    set({ status: 'loading' })
    try {
      const user = await api.auth.me()
      set({ user, status: 'ready' })
    } catch {
      set({ user: null, status: 'ready' })
    }
  },

  async login(email, password) {
    const res = await api.auth.login({ email, password })
    set({ user: res.user, status: 'ready' })
  },

  async loginDemo() {
    const res = await api.auth.loginDemo()
    set({ user: res.user, status: 'ready' })
  },

  async register(input) {
    const res = await api.auth.register(input)
    set({ user: res.user, status: 'ready' })
  },

  async logout() {
    await api.auth.logout()
    set({ user: null })
  },

  async updateProfile(patch) {
    const user = await api.auth.updateProfile(patch)
    set({ user })
  },
}))
