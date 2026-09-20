import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { API_MODE } from '@/lib/api'
import { cn, initials } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useToasts } from '@/store/toast'
import { Badge, Button } from '@/components/ui/primitives'
import { ThemeToggleButton } from '@/components/ui/ThemeToggle'

interface NavItem {
  to: string
  label: string
  icon: string
  hint: string
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: '◧', hint: 'Funnel, volume, sources, skill gaps' }],
  },
  {
    section: 'Build',
    items: [
      { to: '/resumes', label: 'Resumes', icon: '▤', hint: 'Structured resumes, versions, exports' },
      { to: '/job-descriptions', label: 'Job descriptions', icon: '❑', hint: 'Ingest and parse a JD' },
      { to: '/tailor', label: 'Tailoring', icon: '✦', hint: 'Match, gap analysis, tailored drafts' },
      { to: '/cover-letters', label: 'Cover letters', icon: '✎', hint: 'Generated drafts by tone' },
    ],
  },
  {
    section: 'Run',
    items: [
      { to: '/applications', label: 'Applications', icon: '▦', hint: 'Kanban and table tracker' },
      { to: '/discovery', label: 'Discovery', icon: '◎', hint: 'Saved searches and ranked matches' },
      { to: '/interview-prep', label: 'Interview prep', icon: '✻', hint: 'Questions, STAR drafts, mock rounds' },
    ],
  },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const onLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-200 bg-surface transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-ink-100 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary">
            J
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink-900">JobPilot</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400">Phase 1</div>
          </div>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((group) => (
            <div key={group.section} className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                {group.section}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  title={item.hint}
                  className={({ isActive }) =>
                    cn(
                      'mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-brand-50 font-medium text-brand-700'
                        : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                    )
                  }
                >
                  <span className="w-4 text-center text-xs text-ink-400">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-100 p-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
                isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600 hover:bg-ink-100',
              )
            }
          >
            <span className="w-4 text-center text-xs text-ink-400">⚙</span>
            Settings
          </NavLink>
          <div className="mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold text-ink-50">
              {initials(user?.full_name ?? 'You')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-ink-800">{user?.full_name}</div>
              <div className="truncate text-[10px] text-ink-400">{user?.email}</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-rose-600"
              title="Sign out"
            >
              ⇥
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-scrim/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-200 bg-surface/90 px-4 backdrop-blur">
          <Button
            size="icon"
            variant="ghost"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </Button>
          <Breadcrumb path={location.pathname} />
          <div className="flex-1" />
          <ThemeToggleButton />
          {API_MODE === 'mock' ? (
            <Badge tone="warning" className="hidden sm:inline-flex" title="No backend required">
              Mock data mode
            </Badge>
          ) : (
            <Badge tone="success" className="hidden sm:inline-flex">
              Live API
            </Badge>
          )}
        </header>

        <main className="scrollbar-thin min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <ToastHost />
    </div>
  )
}

const CRUMBS: Record<string, string> = {
  dashboard: 'Dashboard',
  resumes: 'Resumes',
  'job-descriptions': 'Job descriptions',
  tailor: 'Tailoring engine',
  'cover-letters': 'Cover letters',
  applications: 'Applications',
  discovery: 'Discovery agent',
  'interview-prep': 'Interview prep',
  settings: 'Settings',
}

function Breadcrumb({ path }: { path: string }) {
  const [, first] = path.split('/')
  return <div className="text-sm font-medium text-ink-700">{CRUMBS[first] ?? 'JobPilot'}</div>
}

function ToastHost() {
  const { toasts, dismiss } = useToasts()
  if (!toasts.length) return null
  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
    info: 'border-brand-200 bg-brand-50 text-brand-900',
  }
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={cn('rounded-xl border p-3 shadow-pop', tones[t.tone])}>
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold">{t.title}</div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-xs opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
          {t.body && <p className="mt-1 whitespace-pre-wrap text-xs opacity-90">{t.body}</p>}
        </div>
      ))}
    </div>
  )
}
