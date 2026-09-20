import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui/feedback'
import { useAuth } from '@/store/auth'
import { useTheme } from '@/store/theme'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ResumesPage } from '@/pages/ResumesPage'
import { ResumeEditorPage } from '@/pages/ResumeEditorPage'
import { JobDescriptionsPage } from '@/pages/JobDescriptionsPage'
import { JobDescriptionDetailPage } from '@/pages/JobDescriptionDetailPage'
import { TailorPage } from '@/pages/TailorPage'
import { CoverLettersPage } from '@/pages/CoverLettersPage'
import { ApplicationsPage } from '@/pages/ApplicationsPage'
import { ApplicationDetailPage } from '@/pages/ApplicationDetailPage'
import { DiscoveryPage } from '@/pages/DiscoveryPage'
import { InterviewPrepPage } from '@/pages/InterviewPrepPage'
import { InterviewSessionPage } from '@/pages/InterviewSessionPage'
import { SettingsPage } from '@/pages/SettingsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status !== 'ready') return <LoadingState label="Restoring your session…" className="min-h-screen" />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

export default function App() {
  const { bootstrap, status } = useAuth()
  const initTheme = useTheme((s) => s.init)

  useEffect(() => {
    if (status === 'idle') void bootstrap()
  }, [bootstrap, status])

  // index.html has already painted the right theme; this picks up OS changes
  // that happen while the tab is open.
  useEffect(() => initTheme(), [initTheme])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/resumes" element={<ResumesPage />} />
        <Route path="/resumes/:resumeId" element={<ResumeEditorPage />} />
        <Route path="/job-descriptions" element={<JobDescriptionsPage />} />
        <Route path="/job-descriptions/:jdId" element={<JobDescriptionDetailPage />} />
        <Route path="/tailor" element={<TailorPage />} />
        <Route path="/cover-letters" element={<CoverLettersPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/interview-prep" element={<InterviewPrepPage />} />
        <Route path="/interview-prep/:sessionId" element={<InterviewSessionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
