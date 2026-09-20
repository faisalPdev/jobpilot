import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { API_MODE } from '@/lib/api'
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/lib/mock/seed'
import { useAuth } from '@/store/auth'
import { Button } from '@/components/ui/primitives'
import { Field, Input } from '@/components/ui/inputs'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const { user, login, loginDemo } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'form' | 'demo' | null>(null)

  if (user) return <Navigate to={(location.state as { from?: string })?.from ?? '/dashboard'} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending('form')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setPending(null)
    }
  }

  const demo = async () => {
    setError(null)
    setPending('demo')
    try {
      await loginDemo()
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the demo')
    } finally {
      setPending(null)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Your resume, tailored to every job, with the tracker to prove what works.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending === 'form'}>
          Sign in
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-ink-400">
        <span className="h-px flex-1 bg-ink-200" />
        or
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      <Button className="w-full" size="lg" onClick={demo} loading={pending === 'demo'}>
        Open the demo account
      </Button>
      <p className="mt-2 text-xs text-ink-500">
        {API_MODE === 'mock'
          ? 'Seeds ten weeks of applications, a master resume and two tailored variants into your browser. Nothing leaves this machine.'
          : 'Signs in as the seeded demo user on the connected backend.'}
      </p>

      <p className="mt-6 text-sm text-ink-600">
        No account yet?{' '}
        <Link to="/register" className="link">
          Create one
        </Link>
      </p>
    </AuthLayout>
  )
}
