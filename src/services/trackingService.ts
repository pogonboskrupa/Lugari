import { getDB, kvGet, kvSet, kvDelete } from '@/lib/db'
import { uuid, todayISO } from '@/lib/utils'
import type { TrackPoint, WorkShift } from '@/types'
import { computeTrackStats } from './analyticsService'
import { analyzeTrackLocations, haversineM, loadDepartments } from './geoService'
import { enqueueSync } from './syncService'

/** Record a point at least every 30 s… */
const TIME_THRESHOLD_MS = 30_000
/** …or every 20 m of movement, whichever comes first. */
const DISTANCE_THRESHOLD_M = 20

const ACTIVE_SHIFT_KEY = 'activeShift'

export interface ActiveShiftMeta {
  id: string
  ranger_id: string
  work_date: string
  started_at: string
}

type PointListener = (point: TrackPoint) => void

class TrackingService {
  private watchId: number | null = null
  private wakeLock: WakeLockSentinel | null = null
  private lastRecorded: TrackPoint | null = null
  private listeners = new Set<PointListener>()
  private visibilityHandler = () => {
    if (document.visibilityState === 'visible') void this.acquireWakeLock()
  }

  onPoint(listener: PointListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async getActiveShift(): Promise<ActiveShiftMeta | undefined> {
    return kvGet<ActiveShiftMeta>(ACTIVE_SHIFT_KEY)
  }

  /** Restores GPS watching after an app restart while a shift is active. */
  async resume(): Promise<ActiveShiftMeta | undefined> {
    const active = await this.getActiveShift()
    if (active && this.watchId === null) {
      this.startWatching()
    }
    return active
  }

  async startShift(rangerId: string): Promise<ActiveShiftMeta> {
    const existing = await this.getActiveShift()
    if (existing) return existing

    const meta: ActiveShiftMeta = {
      id: uuid(),
      ranger_id: rangerId,
      work_date: todayISO(),
      started_at: new Date().toISOString(),
    }
    await kvSet(ACTIVE_SHIFT_KEY, meta)
    const db = await getDB()
    await db.clear('activeTrack')
    this.lastRecorded = null
    this.startWatching()
    return meta
  }

  async endShift(): Promise<WorkShift | null> {
    const meta = await this.getActiveShift()
    if (!meta) return null

    this.stopWatching()

    const db = await getDB()
    const raw = await db.getAll('activeTrack')
    const points: TrackPoint[] = raw
      .filter((p) => p.shiftId === meta.id)
      .map(({ t, lat, lng, speed, acc }) => ({ t, lat, lng, speed, acc }))
      .sort((a, b) => a.t - b.t)

    const stats = computeTrackStats(points)

    let breakdown = {
      inDepartmentsMs: 0,
      atLandingMs: 0,
      outsideMs: 0,
      departmentsVisited: [] as string[],
    }
    try {
      const departments = await loadDepartments()
      const full = analyzeTrackLocations(points, departments)
      breakdown = {
        inDepartmentsMs: full.inDepartmentsMs,
        atLandingMs: full.atLandingMs,
        outsideMs: full.outsideMs,
        departmentsVisited: full.departmentsVisited,
      }
    } catch {
      // GeoJSON unavailable offline on first run — breakdown stays empty.
    }

    const shift: WorkShift = {
      id: meta.id,
      ranger_id: meta.ranger_id,
      work_date: meta.work_date,
      started_at: meta.started_at,
      ended_at: new Date().toISOString(),
      status: 'finished',
      distance_m: Math.round(stats.distanceM),
      duration_ms: stats.durationMs,
      avg_speed_kmh: Number(stats.avgSpeedKmh.toFixed(2)),
      max_speed_kmh: Number(stats.maxSpeedKmh.toFixed(2)),
      points,
      departments_visited: breakdown.departmentsVisited,
      time_in_departments_ms: breakdown.inDepartmentsMs,
      time_at_landing_ms: breakdown.atLandingMs,
      time_outside_ms: breakdown.outsideMs,
    }

    await db.put('shifts', shift)
    await db.clear('activeTrack')
    await kvDelete(ACTIVE_SHIFT_KEY)
    await enqueueSync('shift', shift)
    return shift
  }

  async getActivePoints(): Promise<TrackPoint[]> {
    const meta = await this.getActiveShift()
    if (!meta) return []
    const db = await getDB()
    const raw = await db.getAll('activeTrack')
    return raw
      .filter((p) => p.shiftId === meta.id)
      .map(({ t, lat, lng, speed, acc }) => ({ t, lat, lng, speed, acc }))
      .sort((a, b) => a.t - b.t)
  }

  get isWatching(): boolean {
    return this.watchId !== null
  }

  private startWatching() {
    if (!('geolocation' in navigator)) return
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => void this.handlePosition(pos),
      () => {
        /* GPS errors are transient in the field — keep the watch alive. */
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 25_000 },
    )
    void this.acquireWakeLock()
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    document.removeEventListener('visibilitychange', this.visibilityHandler)
    void this.wakeLock?.release().catch(() => undefined)
    this.wakeLock = null
  }

  /** Keeps the screen awake so Android does not suspend GPS sampling. */
  private async acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen')
      }
    } catch {
      // Wake lock denied (battery saver etc.) — tracking still works while app is foregrounded.
    }
  }

  private async handlePosition(pos: GeolocationPosition) {
    const meta = await this.getActiveShift()
    if (!meta) return

    const point: TrackPoint = {
      t: pos.timestamp || Date.now(),
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      speed: pos.coords.speed != null ? Number((pos.coords.speed * 3.6).toFixed(1)) : -1,
      acc: Math.round(pos.coords.accuracy),
    }

    if (this.lastRecorded) {
      const dt = point.t - this.lastRecorded.t
      const dist = haversineM(this.lastRecorded.lat, this.lastRecorded.lng, point.lat, point.lng)
      if (dt < TIME_THRESHOLD_MS && dist < DISTANCE_THRESHOLD_M) return
    }

    this.lastRecorded = point
    const db = await getDB()
    await db.add('activeTrack', { ...point, shiftId: meta.id })
    for (const listener of this.listeners) listener(point)
  }
}

export const trackingService = new TrackingService()
