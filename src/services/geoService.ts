import { booleanPointInPolygon, point } from '@turf/turf'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { departmentLabel, type DepartmentProperties, type LocationStatus, type TrackPoint } from '@/types'

export type DepartmentFeature = Feature<Polygon | MultiPolygon, DepartmentProperties>
export type DepartmentCollection = FeatureCollection<Polygon | MultiPolygon, DepartmentProperties>

let cache: DepartmentCollection | null = null

/** Loads the compartments GeoJSON (served from /public, cached by the service worker for offline use). */
export async function loadDepartments(): Promise<DepartmentCollection> {
  if (cache) return cache
  const res = await fetch('/geojson/odjeli.geojson')
  if (!res.ok) throw new Error('Ne mogu učitati GeoJSON odjela')
  cache = (await res.json()) as DepartmentCollection
  return cache
}

/** Finds the department polygon containing the given location, if any. */
export function findDepartmentAt(
  lat: number,
  lng: number,
  departments: DepartmentCollection,
): DepartmentFeature | null {
  const p = point([lng, lat])
  for (const feature of departments.features) {
    if (booleanPointInPolygon(p, feature)) return feature
  }
  return null
}

/** Classifies a location: in a department, at a landing (lager), or outside. */
export function classifyLocation(
  lat: number,
  lng: number,
  departments: DepartmentCollection,
): LocationStatus {
  const feature = findDepartmentAt(lat, lng, departments)
  if (!feature) return { kind: 'outside' }
  const label = departmentLabel(feature.properties)
  if (feature.properties.lager) return { kind: 'landing', label }
  return { kind: 'department', label }
}

export interface TrackTimeBreakdown {
  inDepartmentsMs: number
  atLandingMs: number
  outsideMs: number
  departmentsVisited: string[]
  /** ms spent per department label */
  perDepartmentMs: Record<string, number>
}

/** Splits total track time into department / landing / outside buckets. */
export function analyzeTrackLocations(
  points: TrackPoint[],
  departments: DepartmentCollection,
): TrackTimeBreakdown {
  const result: TrackTimeBreakdown = {
    inDepartmentsMs: 0,
    atLandingMs: 0,
    outsideMs: 0,
    departmentsVisited: [],
    perDepartmentMs: {},
  }
  const visited = new Set<string>()

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    // Each point "owns" the interval until the next point (last point owns 0).
    const dt = i < points.length - 1 ? points[i + 1].t - pt.t : 0
    const status = classifyLocation(pt.lat, pt.lng, departments)
    if (status.kind === 'department') {
      result.inDepartmentsMs += dt
      visited.add(status.label)
      result.perDepartmentMs[status.label] = (result.perDepartmentMs[status.label] ?? 0) + dt
    } else if (status.kind === 'landing') {
      result.atLandingMs += dt
    } else {
      result.outsideMs += dt
    }
  }

  result.departmentsVisited = [...visited]
  return result
}

/** Haversine distance in meters. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
