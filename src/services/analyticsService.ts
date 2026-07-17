import type { TrackPoint, WorkShift } from '@/types'
import { haversineM } from './geoService'

export interface TrackStats {
  distanceM: number
  durationMs: number
  avgSpeedKmh: number
  maxSpeedKmh: number
}

/** GPS points with worse accuracy than this are ignored in distance math. */
const MAX_ACCURACY_M = 50
/** Jumps implying > 150 km/h are treated as GPS glitches. */
const MAX_PLAUSIBLE_SPEED_KMH = 150

export function computeTrackStats(points: TrackPoint[]): TrackStats {
  if (points.length < 2) {
    return { distanceM: 0, durationMs: 0, avgSpeedKmh: 0, maxSpeedKmh: 0 }
  }

  let distanceM = 0
  let maxSpeedKmh = 0

  const usable = points.filter((p) => p.acc <= 0 || p.acc <= MAX_ACCURACY_M)
  for (let i = 1; i < usable.length; i++) {
    const a = usable[i - 1]
    const b = usable[i]
    const d = haversineM(a.lat, a.lng, b.lat, b.lng)
    const dtH = (b.t - a.t) / 3_600_000
    const segSpeed = dtH > 0 ? d / 1000 / dtH : 0
    if (segSpeed > MAX_PLAUSIBLE_SPEED_KMH) continue
    distanceM += d
    const reported = b.speed >= 0 ? b.speed : segSpeed
    if (reported > maxSpeedKmh && reported <= MAX_PLAUSIBLE_SPEED_KMH) maxSpeedKmh = reported
  }

  const durationMs = points[points.length - 1].t - points[0].t
  const avgSpeedKmh = durationMs > 0 ? distanceM / 1000 / (durationMs / 3_600_000) : 0

  return { distanceM, durationMs, avgSpeedKmh, maxSpeedKmh }
}

/** Detects gaps in the GPS signal longer than `thresholdMs`. */
export function findGpsGaps(
  points: TrackPoint[],
  thresholdMs: number,
): Array<{ from: number; to: number; durationMs: number }> {
  const gaps: Array<{ from: number; to: number; durationMs: number }> = []
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t
    if (dt > thresholdMs) {
      gaps.push({ from: points[i - 1].t, to: points[i].t, durationMs: dt })
    }
  }
  return gaps
}

export interface DashboardStats {
  totalRangers: number
  activeRangers: number
  finishedRangers: number
  totalKm: number
  avgDurationMs: number
}

export function computeDashboardStats(rangerCount: number, shifts: WorkShift[]): DashboardStats {
  const active = shifts.filter((s) => s.status === 'active')
  const finished = shifts.filter((s) => s.status === 'finished')
  const totalM = shifts.reduce((sum, s) => sum + s.distance_m, 0)
  const durations = shifts.map((s) =>
    s.status === 'finished' ? s.duration_ms : Date.now() - new Date(s.started_at).getTime(),
  )
  const avgDurationMs =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

  return {
    totalRangers: rangerCount,
    activeRangers: active.length,
    finishedRangers: finished.length,
    totalKm: totalM / 1000,
    avgDurationMs,
  }
}

/** Builds a heatmap grid (~cellSizeDeg cells) from many tracks. Returns cells with visit intensity. */
export function buildHeatmapGrid(
  tracks: TrackPoint[][],
  cellSizeDeg = 0.002,
): Array<{ lat: number; lng: number; count: number }> {
  const cells = new Map<string, { lat: number; lng: number; count: number }>()
  for (const track of tracks) {
    for (const p of track) {
      const gy = Math.floor(p.lat / cellSizeDeg)
      const gx = Math.floor(p.lng / cellSizeDeg)
      const key = `${gy}:${gx}`
      const cell = cells.get(key)
      if (cell) cell.count++
      else
        cells.set(key, {
          lat: (gy + 0.5) * cellSizeDeg,
          lng: (gx + 0.5) * cellSizeDeg,
          count: 1,
        })
    }
  }
  return [...cells.values()]
}

/** Which departments have not been visited within `days` days. */
export function computeCoverage(
  allDepartments: string[],
  shifts: WorkShift[],
  days: number,
): Array<{ department: string; lastVisit: string | null; daysAgo: number | null }> {
  const lastVisit = new Map<string, string>()
  for (const s of shifts) {
    for (const dep of s.departments_visited) {
      const prev = lastVisit.get(dep)
      if (!prev || s.work_date > prev) lastVisit.set(dep, s.work_date)
    }
  }
  const now = Date.now()
  return allDepartments
    .map((department) => {
      const visit = lastVisit.get(department) ?? null
      const daysAgo = visit
        ? Math.floor((now - new Date(visit).getTime()) / 86_400_000)
        : null
      return { department, lastVisit: visit, daysAgo }
    })
    .filter((c) => c.daysAgo === null || c.daysAgo >= days)
    .sort((a, b) => (b.daysAgo ?? 9999) - (a.daysAgo ?? 9999))
}
