import { useRef, useState } from 'react'
import { API_MODE, api } from '@/lib/api'
import { download, formatDateTime, relativeTime } from '@/lib/utils'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/store/auth'
import { toast, toastError } from '@/store/toast'
import { Badge, Button, Hint, PageHeader } from '@/components/ui/primitives'
import { LoadingState, Progress } from '@/components/ui/feedback'
import { Field, Input, Switch } from '@/components/ui/inputs'
import { ConfirmDialog } from '@/components/ui/overlays'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useTheme } from '@/store/theme'

export function SettingsPage() {
  const { user, updateProfile } = useAuth()
  const themePreference = useTheme((s) => s.preference)
  const resolvedTheme = useTheme((s) => s.resolved)
  const usage = useAsync(() => api.system.usage(), [])
  const jobs = useAsync(() => api.system.jobs(), [])
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    full_name: user?.full_name ?? '',
    follow_up_days: user?.follow_up_days ?? 7,
    weekly_application_goal: user?.weekly_application_goal ?? 10,
  })
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirm, setConfirm] = useState<'reset' | 'reseed' | null>(null)

  const save = async () => {
    setSaving(true)
    try {
      await updateProfile({
        full_name: form.full_name,
        follow_up_days: Math.max(1, Number(form.follow_up_days) || 7),
        weekly_application_goal: Math.max(1, Number(form.weekly_application_goal) || 10),
      })
      toast.success('Saved')
    } catch (err) {
      toastError(err, 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const toggleConsent = async (value: boolean) => {
    try {
      await updateProfile({ llm_data_consent: value })
      toast.success(value ? 'AI generation enabled' : 'AI generation disabled')
    } catch (err) {
      toastError(err, 'Could not update the setting')
    }
  }

  if (!user) return <LoadingState />

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings" subtitle="Profile, goals, data handling and the state of your local database." />

      <section className="panel p-4">
        <h3 className="text-sm font-semibold text-ink-900">Profile</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="Email" hint="Changing your sign-in email is not part of Phase 1.">
            <Input value={user.email} disabled />
          </Field>
          <Field label="Weekly application goal" hint="Drives the goal tracker and streaks on the dashboard.">
            <Input
              type="number"
              min={1}
              value={form.weekly_application_goal}
              onChange={(e) => setForm({ ...form, weekly_application_goal: Number(e.target.value) })}
            />
          </Field>
          <Field label="Follow-up after (days)" hint="How long silence should last before you get nudged.">
            <Input
              type="number"
              min={1}
              value={form.follow_up_days}
              onChange={(e) => setForm({ ...form, follow_up_days: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Button className="mt-3" variant="primary" onClick={save} loading={saving}>
          Save profile
        </Button>
      </section>

      <section className="panel p-4">
        <h3 className="text-sm font-semibold text-ink-900">Appearance</h3>
        <Hint className="mt-1">
          Stored in this browser, not on your profile, so it applies before you sign in and does not follow you to
          another machine.
        </Hint>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <Hint>
            {themePreference === 'system'
              ? `Following your operating system, which is currently ${resolvedTheme}.`
              : `Always ${themePreference}, whatever your operating system is set to.`}
          </Hint>
        </div>
        <Hint className="mt-2">
          Resume previews and exports stay on white paper in either theme — what you see is what the PDF produces.
        </Hint>
      </section>

      <section className="panel p-4">
        <h3 className="text-sm font-semibold text-ink-900">Data and privacy</h3>
        <div className="mt-3 space-y-3">
          <Switch
            checked={user.llm_data_consent}
            onChange={toggleConsent}
            label="Allow AI generation on my resume content"
            hint="Required for tailoring, cover letters and interview prep. Resume scoring and the ATS check are local and work either way."
          />
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
            <p className="text-xs text-ink-600">
              Your resume contains personal data. In this build every byte stays in your browser's localStorage —
              nothing is uploaded. With the backend connected, resumes are encrypted at rest, scoped per user, and
              only sent to a model provider once you have agreed to the data-handling policy.
            </p>
          </div>
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="text-sm font-semibold text-ink-900">AI usage this month</h3>
        {usage.data ? (
          <>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs text-ink-500">
                {usage.data.generations_used} of {usage.data.generations_cap} generations
              </span>
              <span className="text-xs tabular-nums text-ink-700">≈ ${usage.data.est_cost_usd.toFixed(2)}</span>
            </div>
            <Progress
              value={usage.data.generations_used}
              max={usage.data.generations_cap}
              tone={usage.data.generations_used / usage.data.generations_cap > 0.8 ? 'warning' : 'brand'}
              className="mt-1.5"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {usage.data.by_kind.map((row) => (
                <Badge key={row.kind} tone="neutral">
                  {row.kind.replace(/_/g, ' ')} · {row.count}
                </Badge>
              ))}
              {usage.data.cached_hits > 0 && (
                <Badge tone="success">{usage.data.cached_hits} served from cache</Badge>
              )}
            </div>
            <Hint className="mt-2">
              Period started {formatDateTime(usage.data.period_start)}. Repeated JD parses are cached, which is why
              the billable count is lower than the total.
            </Hint>
          </>
        ) : (
          <LoadingState label="Loading usage…" />
        )}
      </section>

      <section className="panel p-4">
        <h3 className="text-sm font-semibold text-ink-900">Background jobs</h3>
        <Hint className="mt-1">
          Generation runs on a queue (Celery + Redis in production) so slow model calls never block a request.
        </Hint>
        <ul className="mt-3 divide-y divide-ink-100">
          {(jobs.data ?? []).slice(0, 10).map((job) => (
            <li key={job.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-ink-800">{job.kind.replace(/_/g, ' ')}</div>
                <div className="truncate text-[11px] text-ink-500">{job.message}</div>
              </div>
              <div className="shrink-0 text-right">
                <Badge tone={job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'danger' : 'neutral'}>
                  {job.status}
                </Badge>
                <div className="mt-0.5 text-[10px] text-ink-400">{relativeTime(job.created_at)}</div>
              </div>
            </li>
          ))}
          {(jobs.data ?? []).length === 0 && <Hint className="py-2">No jobs recorded yet.</Hint>}
        </ul>
      </section>

      <section className="panel p-4">
        <h3 className="text-sm font-semibold text-ink-900">Local database</h3>
        <div className="mt-1 flex items-center gap-2">
          <Badge tone={API_MODE === 'mock' ? 'warning' : 'success'}>
            {API_MODE === 'mock' ? 'mock mode' : 'live API'}
          </Badge>
          <Hint>
            {API_MODE === 'mock'
              ? 'Everything is served from your browser. Export a dump if you want to keep it.'
              : 'Connected to the FastAPI backend; these controls are disabled.'}
          </Hint>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              try {
                download('jobpilot-db.json', await api.system.exportAll(), 'application/json')
                toast.success('Exported')
              } catch (err) {
                toastError(err, 'Export failed')
              }
            }}
          >
            Export data
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Import data</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                await api.system.importAll(await file.text())
                toast.success('Imported', 'Reloading…')
                setTimeout(() => window.location.reload(), 600)
              } catch (err) {
                toastError(err, 'Import failed')
              }
            }}
          />
          <Button onClick={() => setConfirm('reseed')}>Reload demo data</Button>
          <Button variant="danger" onClick={() => setConfirm('reset')}>
            Wipe everything
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        loading={resetting}
        destructive={confirm === 'reset'}
        confirmLabel={confirm === 'reset' ? 'Wipe' : 'Reload demo data'}
        title={confirm === 'reset' ? 'Wipe the local database?' : 'Replace everything with demo data?'}
        body={
          confirm === 'reset'
            ? 'Every resume, application and prep session in this browser is deleted. Export first if you want a copy.'
            : 'Your current data is replaced by the seeded demo account: ten weeks of applications, a master resume and two tailored variants.'
        }
        onConfirm={async () => {
          setResetting(true)
          try {
            if (confirm === 'reset') await api.system.reset()
            else await api.system.reseed()
            toast.success('Done', 'Reloading…')
            setTimeout(() => window.location.reload(), 600)
          } catch (err) {
            toastError(err, 'That failed')
          } finally {
            setResetting(false)
            setConfirm(null)
          }
        }}
      />
    </div>
  )
}
