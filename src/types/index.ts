// ── Domain types ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'foreman' | 'silviculture_foreman' | 'ranger'

export interface Forestry {
  id: string
  name: string
  created_at: string
}

export interface WorkUnit {
  id: string
  forestry_id: string
  name: string
  foreman_id: string | null
  created_at: string
  forestry?: Forestry
}

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  work_unit_id: string | null
  forestry_id: string | null
  phone: string | null
  active: boolean
  created_at: string
  work_unit?: WorkUnit
}

// ── GPS tracking ─────────────────────────────────────────────────────────────

export interface TrackPoint {
  /** epoch ms */
  t: number
  lat: number
  lng: number
  /** km/h, -1 when unknown */
  speed: number
  /** accuracy in meters */
  acc: number
}

export type ShiftStatus = 'active' | 'finished'

export interface WorkShift {
  id: string
  ranger_id: string
  work_date: string
  started_at: string
  ended_at: string | null
  status: ShiftStatus
  distance_m: number
  duration_ms: number
  avg_speed_kmh: number
  max_speed_kmh: number
  points: TrackPoint[]
  departments_visited: string[]
  time_in_departments_ms: number
  time_at_landing_ms: number
  time_outside_ms: number
  ranger?: Profile
}

export type LocationStatus =
  | { kind: 'department'; label: string }
  | { kind: 'landing'; label: string }
  | { kind: 'outside' }

// ── Logbook ──────────────────────────────────────────────────────────────────

export const LOGBOOK_ACTIVITIES = [
  'Obilazak odjela',
  'Kontrola sječine',
  'Doznaka',
  'Kontrola izvoza',
  'Kontrola lagera',
  'Sastanak',
  'Požar',
  'Šumska šteta',
  'Bespravna sječa',
  'Bespravan promet drvnih sortimenata',
  'Napomena',
] as const

export type LogbookActivity = (typeof LOGBOOK_ACTIVITIES)[number]

export interface LogbookEntry {
  id: string
  ranger_id: string
  entry_date: string
  entry_time: string
  department: string
  activity: LogbookActivity
  description: string
  created_at: string
  ranger?: Profile
}

// ── Incidents (prijave) ──────────────────────────────────────────────────────

export const INCIDENT_TYPES = [
  'Bespravna sječa',
  'Bespravan promet',
  'Požar',
  'Šteta',
  'Ostalo',
] as const

export type IncidentType = (typeof INCIDENT_TYPES)[number]

export interface Incident {
  id: string
  ranger_id: string
  type: IncidentType
  description: string
  lat: number | null
  lng: number | null
  department: string | null
  tree_count: number | null
  wood_volume_m3: number | null
  wood_species: string | null
  note: string | null
  photo_urls: string[]
  video_url: string | null
  audio_url: string | null
  created_at: string
  ranger?: Profile
}

// ── Photos ───────────────────────────────────────────────────────────────────

export interface FieldPhoto {
  id: string
  ranger_id: string
  url: string
  lat: number | null
  lng: number | null
  department: string | null
  taken_at: string
  incident_id: string | null
  ranger?: Profile
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'done'

export interface RangerTask {
  id: string
  foreman_id: string
  ranger_id: string
  title: string
  description: string | null
  department: string | null
  due_date: string | null
  status: TaskStatus
  completed_at: string | null
  completed_lat: number | null
  completed_lng: number | null
  created_at: string
  ranger?: Profile
}

// ── Notifications ────────────────────────────────────────────────────────────

export type AppNotificationType = 'incident' | 'photo' | 'shift_end' | 'alert'

export interface AppNotification {
  id: string
  recipient_id: string
  type: AppNotificationType
  title: string
  body: string
  read: boolean
  ref_id: string | null
  created_at: string
}

// ── GeoJSON compartments (odjeli) ────────────────────────────────────────────

export interface DepartmentProperties {
  sumarija: string
  gospodarska_jedinica: string
  odjel: string
  /** true for landing/log-yard areas (lager) */
  lager?: boolean
}

export function departmentLabel(p: DepartmentProperties): string {
  return `${p.gospodarska_jedinica} ${p.odjel}`
}

// ── Offline sync queue ───────────────────────────────────────────────────────

export type SyncEntity = 'shift' | 'logbook' | 'incident' | 'photo' | 'task_completion'

export interface SyncQueueItem {
  id: string
  entity: SyncEntity
  payload: unknown
  created_at: number
  attempts: number
}
