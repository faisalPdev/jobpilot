import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { Button } from '@/components/ui/primitives'
import { Checkbox, Field, Input } from '@/components/ui/inputs'
import { AuthLayout } from './AuthLayout'

export function RegisterPage() {
  const { user, register, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      setError('Use at least 8 characters for the password.')
      return
    }
    setError(null)
    setPending(true)
    try {
      await register(form)
      // §10 — consent is recorded explicitly before any resume text reaches a provider.
      if (consent) await updateProfile({ llm_data_consent: true })
      navigate('/resumes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start with your master profile — everything else builds on it.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Full name">
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            autoComplete="name"
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            required
          />
        </Field>

        <Checkbox
          checked={consent}
          onChange={setConsent}
          label="Allow AI generation on my resume content"
          hint="Needed for tailoring, cover letters and interview prep. You can change this in Settings at any time, and scoring/ATS checks work without it."
        />

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-600">
        Already have an account?{' '}
        <Link to="/login" className="link">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
