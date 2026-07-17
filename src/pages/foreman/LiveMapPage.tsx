import { useEffect, useMemo, useState } from 'react'
import { Flame, Layers } from 'lucide-react'
import { MapView } from '@/components/map/MapView'
import { TrackLayer } from '@/components/map/TrackLayer'
import { HeatmapLayer } from '@/components/map/HeatmapLayer'
import { PhotoMarkers } from '@/components/map/PhotoMarkers'
import { Input } from '@/components/ui/input'
import { getFieldPhotos, getShiftsForDate, getShiftsInRange } from '@/services/dataService'
import { rangerColor, todayISO } from '@/lib/utils'
import type { FieldPhoto, WorkShift } from '@/types'

export function LiveMapPage() {
  const [date, setDate] = useState(todayISO())
  const [shifts, setShifts] = useState<WorkShift[]>([])
  const [photos, setPhotos] = useState<FieldPhoto[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatTracks, setHeatTracks] = useState<WorkShift[]>([])
  const [panelOpen, setPanelOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const data = await getShiftsForDate(date)
      if (!cancelled) setShifts(data)
    }
    void load()
    const t = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [date])

  useEffect(() => {
    void getFieldPhotos().then(setPhotos)
  }, [])

  // Heatmap uses the last 30 days of tracks.
  useEffect(() => {
    if (!showHeatmap) return
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    void getShiftsInRange(from, todayISO()).then(setHeatTracks)
  }, [showHeatmap])

  const visibleShifts = useMemo(
    () => shifts.filter((s) => !hidden.has(s.ranger_id)),
    [shifts, hidden],
  )

  function toggleRanger(id: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="relative h-full">
      <MapView className="absolute inset-0">
        {visibleShifts.map((shift) => (
          <TrackLayer
            key={shift.id}
            rangerId={shift.ranger_id}
            rangerName={shift.ranger?.full_name ?? 'Lugar'}
            points={shift.points}
            live={shift.status === 'active'}
          />
        ))}
        {showHeatmap && <HeatmapLayer tracks={heatTracks.map((s) => s.points)} />}
        <PhotoMarkers photos={photos} />
      </MapView>

      {/* Layer control */}
      <div className="absolute left-3 top-3 z-[1000] w-64">
        <div className="rounded-2xl border border-border bg-card/95 shadow-lg backdrop-blur">
          <button
            className="flex w-full items-center gap-2 p-3 text-sm font-semibold"
            onClick={() => setPanelOpen((o) => !o)}
          >
            <Layers className="h-4 w-4 text-primary" /> GPS tragovi
            <span className="ml-auto text-xs text-muted-foreground">
              {panelOpen ? 'Sakrij' : 'Prikaži'}
            </span>
          </button>
          {panelOpen && (
            <div className="space-y-2 border-t border-border p-3">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              {shifts.map((shift) => (
                <label key={shift.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!hidden.has(shift.ranger_id)}
                    onChange={() => toggleRanger(shift.ranger_id)}
                    className="accent-[var(--primary)]"
                  />
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: rangerColor(shift.ranger_id) }}
                  />
                  <span className="truncate">{shift.ranger?.full_name ?? shift.ranger_id}</span>
                  {shift.status === 'active' && (
                    <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-success" />
                  )}
                </label>
              ))}
              {shifts.length === 0 && (
                <p className="text-xs text-muted-foreground">Nema tragova za odabrani datum.</p>
              )}
              <label className="flex cursor-pointer items-center gap-2 border-t border-border pt-2 text-sm">
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(e) => setShowHeatmap(e.target.checked)}
                  className="accent-[var(--primary)]"
                />
                <Flame className="h-4 w-4 text-warning" /> Heatmap (30 dana)
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
