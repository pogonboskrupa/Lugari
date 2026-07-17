import { create } from 'zustand'
import { trackingService, type ActiveShiftMeta } from '@/services/trackingService'
import { loadDepartments, classifyLocation } from '@/services/geoService'
import { computeTrackStats } from '@/services/analyticsService'
import { processGeofence, resetGeofencing } from '@/services/geofencingService'
import type { LocationStatus, TrackPoint, WorkShift } from '@/types'

interface TrackingState {
  activeShift: ActiveShiftMeta | null
  points: TrackPoint[]
  locationStatus: LocationStatus | null
  distanceM: number
  lastShift: WorkShift | null
  init: (rangerId: string) => Promise<void>
  start: (rangerId: string) => Promise<void>
  stop: () => Promise<void>
}

let unsubscribe: (() => void) | null = null

export const useTrackingStore = create<TrackingState>((set, get) => ({
  activeShift: null,
  points: [],
  locationStatus: null,
  distanceM: 0,
  lastShift: null,

  init: async () => {
    const active = await trackingService.resume()
    if (active) {
      const points = await trackingService.getActivePoints()
      set({
        activeShift: active,
        points,
        distanceM: computeTrackStats(points).distanceM,
      })
      subscribeToPoints(set, get)
    }
  },

  start: async (rangerId) => {
    resetGeofencing()
    const meta = await trackingService.startShift(rangerId)
    set({ activeShift: meta, points: [], distanceM: 0, lastShift: null })
    subscribeToPoints(set, get)
  },

  stop: async () => {
    unsubscribe?.()
    unsubscribe = null
    resetGeofencing()
    const shift = await trackingService.endShift()
    set({ activeShift: null, points: [], locationStatus: null, distanceM: 0, lastShift: shift })
  },
}))

function subscribeToPoints(
  set: (partial: Partial<TrackingState>) => void,
  get: () => TrackingState,
) {
  unsubscribe?.()
  unsubscribe = trackingService.onPoint((point) => {
    const points = [...get().points, point]
    set({ points, distanceM: computeTrackStats(points).distanceM })
    void loadDepartments()
      .then((departments) => {
        const status = classifyLocation(point.lat, point.lng, departments)
        set({ locationStatus: status })
        // Geofencing: auto-log department enter/exit events.
        const shift = get().activeShift
        if (shift) void processGeofence(shift.ranger_id, status).catch(() => undefined)
      })
      .catch(() => undefined)
  })
}
