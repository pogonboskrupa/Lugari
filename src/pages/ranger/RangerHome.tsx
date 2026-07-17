import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, Satellite } from 'lucide-react'
import { MapView } from '@/components/map/MapView'
import { TrackLayer } from '@/components/map/TrackLayer'
import { Fab } from '@/components/layout/Fab'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import { useTrackingStore } from '@/store/trackingStore'
import { formatDuration, formatKm, formatTime } from '@/lib/utils'
import { notifyUser } from '@/services/notificationService'
import { findGpsGaps } from '@/services/analyticsService'
import type { WorkShift } from '@/types'

/** Warn when no GPS fix for 5 minutes during an active shift. */
const GPS_GAP_WARNING_MS = 5 * 60_000

export function RangerHome() {
  const { profile } = useAuthStore()
  const { activeShift, points, locationStatus, distanceM, start, stop } = useTrackingStore()
  const [now, setNow] = useState(Date.now())
  const [summary, setSummary] = useState<WorkShift | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])

  const durationMs = activeShift ? now - new Date(activeShift.started_at).getTime() : 0

  const gpsWarning = useMemo(() => {
    if (!activeShift || points.length === 0) return false
    const lastPoint = points[points.length - 1]
    if (now - lastPoint.t > GPS_GAP_WARNING_MS) return true
    return findGpsGaps(points, GPS_GAP_WARNING_MS).length > 0
  }, [activeShift, points, now])

  const noDepartmentWarning = useMemo(() => {
    if (!activeShift) return false
    // After 2 h of work without entering any department, warn the ranger.
    return durationMs > 2 * 3_600_000 && locationStatus?.kind === 'outside'
  }, [activeShift, durationMs, locationStatus])

  async function handleStart() {
    if (!profile) return
    setBusy(true)
    try {
      await start(profile.id)
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    if (!profile) return
    setBusy(true)
    try {
      await stop()
      const finished = useTrackingStore.getState().lastShift
      if (finished) {
        setSummary(finished)
        const foremanId = profile.work_unit?.foreman_id
        if (foremanId) {
          await notifyUser(
            foremanId,
            'shift_end',
            'Završen radni dan',
            `${profile.full_name} je završio radni dan (${formatKm(finished.distance_m)}).`,
            finished.id,
          ).catch(() => undefined)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const center = points.length > 0 ? ([points[points.length - 1].lat, points[points.length - 1].lng] as [number, number]) : undefined

  return (
    <div className="relative h-full">
      <MapView className="absolute inset-0" center={center} zoom={center ? 14 : undefined}>
        {profile && activeShift && (
          <TrackLayer rangerId={profile.id} rangerName={profile.full_name} points={points} live />
        )}
      </MapView>

      {/* Status panel */}
      <div className="absolute left-3 right-3 top-3 z-[1000]">
        <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
          {activeShift ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <Badge variant="success" className="gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> Aktivan radni dan
                </Badge>
                <span className="text-xs text-muted-foreground">
                  od {formatTime(activeShift.started_at)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold tabular-nums">{formatKm(distanceM)}</p>
                  <p className="text-[11px] text-muted-foreground">Pređeno</p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{formatDuration(durationMs)}</p>
                  <p className="text-[11px] text-muted-foreground">Trajanje</p>
                </div>
                <div>
                  <p className="truncate text-lg font-bold">
                    {locationStatus?.kind === 'department'
                      ? locationStatus.label
                      : locationStatus?.kind === 'landing'
                        ? 'Lager'
                        : 'Van odjela'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Lokacija</p>
                </div>
              </div>
              {(gpsWarning || noDepartmentWarning) && (
                <div className="mt-2 space-y-1">
                  {gpsWarning && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <Satellite className="h-3.5 w-3.5" /> GPS signal je prekinut duže od 5 minuta
                    </p>
                  )}
                  {noDepartmentWarning && (
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      Niste ušli ni u jedan odjel tokom radnog vremena
                    </p>
                  )}
                </div>
              )}
              <Button
                variant="destructive"
                size="lg"
                className="mt-3 w-full"
                disabled={busy}
                onClick={() => void handleStop()}
              >
                <Pause className="h-5 w-5" /> Završi radni dan
              </Button>
            </>
          ) : (
            <Button size="lg" className="w-full" disabled={busy} onClick={() => void handleStart()}>
              <Play className="h-5 w-5" /> Započni radni dan
            </Button>
          )}
        </div>
      </div>

      <Fab />

      {/* End-of-day summary */}
      <Dialog open={!!summary} onClose={() => setSummary(null)} title="Sažetak radnog dana">
        {summary && (
          <div className="space-y-2 text-sm">
            <SummaryRow label="Početak" value={formatTime(summary.started_at)} />
            <SummaryRow label="Kraj" value={formatTime(summary.ended_at)} />
            <SummaryRow label="Kilometri" value={formatKm(summary.distance_m)} />
            <SummaryRow label="Vrijeme rada" value={formatDuration(summary.duration_ms)} />
            <SummaryRow label="Prosječna brzina" value={`${summary.avg_speed_kmh} km/h`} />
            <SummaryRow label="Maksimalna brzina" value={`${summary.max_speed_kmh} km/h`} />
            <SummaryRow label="U odjelima" value={formatDuration(summary.time_in_departments_ms)} />
            <SummaryRow label="Na lageru" value={formatDuration(summary.time_at_landing_ms)} />
            <SummaryRow label="Van šume" value={formatDuration(summary.time_outside_ms)} />
            <SummaryRow
              label="Odjeli"
              value={summary.departments_visited.join(', ') || 'Nijedan odjel nije posjećen'}
            />
          </div>
        )}
      </Dialog>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
