import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { RangerHome } from '@/pages/ranger/RangerHome'
import { LogbookPage } from '@/pages/ranger/LogbookPage'
import { IncidentsPage } from '@/pages/ranger/IncidentsPage'
import { PhotosPage } from '@/pages/ranger/PhotosPage'
import { TasksPage } from '@/pages/ranger/TasksPage'
import { ForemanDashboard } from '@/pages/foreman/ForemanDashboard'
import { LiveMapPage } from '@/pages/foreman/LiveMapPage'
import { RangerDetailPage } from '@/pages/foreman/RangerDetailPage'
import { ReportsPage } from '@/pages/foreman/ReportsPage'
import { CoveragePage } from '@/pages/foreman/CoveragePage'
import { ForemanTasksPage } from '@/pages/foreman/ForemanTasksPage'
import { SilvicultureDashboard } from '@/pages/silviculture/SilvicultureDashboard'
import { PhotoMapPage } from '@/pages/silviculture/PhotoMapPage'
import { AdminPage } from '@/pages/admin/AdminPage'
import { useAuthStore } from '@/store/authStore'
import { useTrackingStore } from '@/store/trackingStore'
import { initSync } from '@/services/syncService'
import { requestNotificationPermission } from '@/services/notificationService'

export default function App() {
  const { profile, loading, init } = useAuthStore()
  const initTracking = useTrackingStore((s) => s.init)

  useEffect(() => {
    void init()
    initSync()
  }, [init])

  // Resume an interrupted shift and ask for notification permission once logged in.
  useEffect(() => {
    if (profile) {
      void initTracking(profile.id)
      void requestNotificationPermission()
    }
  }, [profile, initTracking])

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={profile ? <Navigate to="/" replace /> : <LoginPage />} />
        {!profile && <Route path="*" element={<Navigate to="/login" replace />} />}
        {profile && (
          <Route element={<AppShell />}>
            {profile.role === 'ranger' && (
              <>
                <Route path="/" element={<RangerHome />} />
                <Route path="/knjiga" element={<LogbookPage />} />
                <Route path="/prijave" element={<IncidentsPage />} />
                <Route path="/foto" element={<PhotosPage />} />
                <Route path="/zadaci" element={<TasksPage />} />
              </>
            )}
            {profile.role === 'foreman' && (
              <>
                <Route path="/" element={<ForemanDashboard />} />
                <Route path="/karta" element={<LiveMapPage />} />
                <Route path="/lugar/:rangerId" element={<RangerDetailPage />} />
                <Route path="/izvjestaji" element={<ReportsPage />} />
                <Route path="/pokrivenost" element={<CoveragePage />} />
                <Route path="/zadaci" element={<ForemanTasksPage />} />
              </>
            )}
            {profile.role === 'silviculture_foreman' && (
              <>
                <Route path="/" element={<SilvicultureDashboard />} />
                <Route path="/foto-karta" element={<PhotoMapPage />} />
              </>
            )}
            {profile.role === 'admin' && (
              <>
                <Route path="/" element={<AdminPage />} />
                <Route path="/karta" element={<LiveMapPage />} />
                <Route path="/lugar/:rangerId" element={<RangerDetailPage />} />
                <Route path="/izvjestaji" element={<ReportsPage />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  )
}
