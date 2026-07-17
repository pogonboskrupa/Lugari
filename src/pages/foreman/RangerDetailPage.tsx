import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PlayCircle, Satellite } from 'lucide-react'
import { MapView } from '@/components/map/MapView'
import { TrackLayer } from '@/components/map/TrackLayer'
import { TrackReplay } from '@/components/map/ReplayControl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getShiftsForRanger } from '@/services/dataService'
import { findGpsGaps } from '@/services/analyticsService'
import { formatDuration, formatKm, formatTime, todayISO } from '@/lib/utils'
import type { WorkShift } from '@/types'

/** Detail view of one ranger's day: full track on the map + analysis + replay. */
export function RangerDetailPage() {
  const { rangerId } = useParams<{ rangerId: string }>()
  const [params, setParams] = useSearchParams()
  const date = params.get('datum') ?? todayISO()
  const [shifts, setShifts] = useState<WorkShift[]>([])
  const [replay, setReplay] = useState(false)

  useEffect(() => {
    if (rangerId) void getShiftsForRanger(rangerId, 60).then(setShifts)
  }, [rangerId])

  const shift = useMemo(() => shifts.find((s) => s.work_date === date), [shifts, date])

  const gpsGaps = useMemo(
    () => (shift ? findGpsGaps(shift.points, 5 * 60_000) : []),
    [shift],
  )

  const center = useMemo(() => {
    const p = shift?.points[0]
    return p ? ([p.lat, p.lng] as [number, number]) : undefined
  }, [shift])

  const enteredNoDepartment = shift && shift.departments_visited.length === 0

  return (
    <div className="relative h-full">
      <MapView className="absolute inset-0" center={center} zoom={center ? 13 : undefined}>
        {shift && !replay && (
          <TrackLayer
            rangerId={shift.ranger_id}
            rangerName={shift.ranger?.full_name ?? 'Lugar'}
            points={shift.points}
            live={shift.status === 'active'}
          />
        )}
        {shift && replay && <TrackReplay rangerId={shift.ranger_id} points={shift.points} />}
      </MapView>

      <div className="absolute left-3 right-3 top-3 z-[1000] mx-auto max-w-md">
        <div className="space-y-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                params.set('datum', e.target.value)
                setParams(params, { replace: true })
                setReplay(false)
              }}
            />
            {shift && (
              <Button
                variant={replay ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setReplay((r) => !r)}
              >
                <PlayCircle className="h-4 w-4" /> Replay
              </Button>
            )}
          </div>

          {!shift && (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Nema GPS traga za odabrani datum.
            </p>
          )}

          {shift && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{shift.ranger?.full_name ?? 'Lugar'}</span>
                {shift.status === 'active' ? (
                  <Badge variant="success">Aktivan</Badge>
                ) : (
                  <Badge variant="secondary">Završio</Badge>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Metric label="Kilometri" value={formatKm(shift.distance_m)} />
                <Metric label="Vrijeme" value={formatDuration(shift.duration_ms)} />
                <Metric label="Prosjek" value={`${shift.avg_speed_kmh} km/h`} />
                <Metric label="Maks." value={`${shift.max_speed_kmh} km/h`} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Metric label="U odjelima" value={formatDuration(shift.time_in_departments_ms)} />
                <Metric label="Na lageru" value={formatDuration(shift.time_at_landing_ms)} />
                <Metric label="Van šume" value={formatDuration(shift.time_outside_ms)} />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatTime(shift.started_at)} – {formatTime(shift.ended_at)} · Odjeli:{' '}
                {shift.departments_visited.join(', ') || '—'}
              </p>
              {enteredNoDepartment && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  ⚠ Lugar nije ušao ni u jedan odjel tokom radnog vremena
                </p>
              )}
              {gpsGaps.length > 0 && (
                <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                  <Satellite className="h-3.5 w-3.5" /> GPS prekid: {gpsGaps.length}× (najduži{' '}
                  {formatDuration(Math.max(...gpsGaps.map((g) => g.durationMs)))})
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-1 py-1.5">
      <p className="font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
