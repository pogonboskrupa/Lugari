import {
  collection,
  doc,
  documentId,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDB } from '@/lib/db'
import { db, functions } from '@/lib/firebase'
import { uuid, todayISO } from '@/lib/utils'
import type {
  AppNotification,
  FieldPhoto,
  Forestry,
  Incident,
  LogbookEntry,
  Profile,
  RangerTask,
  UserRole,
  WorkShift,
  WorkUnit,
} from '@/types'
import { enqueueSync } from './syncService'

/**
 * Data access layer. Reads prefer Firestore and fall back to IndexedDB;
 * writes always land in IndexedDB first and are synced via the queue.
 */

// ── Query scope ──────────────────────────────────────────────────────────────

/**
 * Firestore security rules are not filters: a query that *could* return one
 * document the viewer may not read fails entirely, rather than silently
 * dropping that document. So every collection-wide read has to be narrowed to
 * the rangers the viewer is allowed to see, instead of filtering client-side.
 */

/** Max values allowed in a Firestore `in` filter. */
const IN_LIMIT = 30

let viewer: { id: string; role: UserRole } | null = null
let supervisedIds: string[] | null = null

/** Call whenever the signed-in profile changes so scoped reads stay correct. */
export function setDataViewer(profile: Profile | null): void {
  viewer = profile ? { id: profile.id, role: profile.role } : null
  supervisedIds = null
}

/** Ranger ids the viewer may read, or null when unconstrained (admin). */
async function visibleRangerIds(): Promise<string[] | null> {
  if (!viewer) return []
  if (viewer.role === 'admin') return null
  if (viewer.role === 'ranger') return [viewer.id]
  if (!supervisedIds) {
    if (!db) return []
    // Includes deactivated rangers so their history stays visible to the foreman.
    const snap = await getDocs(
      query(
        collection(db, 'profiles'),
        where('supervisor_id', '==', viewer.id),
        where('role', '==', 'ranger'),
      ),
    )
    supervisedIds = snap.docs.map((d) => d.id)
  }
  return supervisedIds
}

/** Runs a ranger-scoped query, splitting into chunks of 30 and merging results. */
async function runScoped<T extends { id: string }>(
  path: string,
  extra: QueryConstraint[],
  sort?: (a: T, b: T) => number,
): Promise<T[]> {
  if (!db) return []
  const ids = await visibleRangerIds()
  if (ids !== null && ids.length === 0) return []

  const scopes: QueryConstraint[][] =
    ids === null
      ? [[]]
      : Array.from({ length: Math.ceil(ids.length / IN_LIMIT) }, (_, i) => [
          where('ranger_id', 'in', ids.slice(i * IN_LIMIT, (i + 1) * IN_LIMIT)),
        ])

  const rows: T[] = []
  for (const scope of scopes) {
    const snap = await getDocs(query(collection(db, path), ...scope, ...extra))
    for (const d of snap.docs) rows.push({ id: d.id, ...d.data() } as T)
  }
  return sort ? rows.sort(sort) : rows
}

// ── Joins (Firestore has none — batch-fetch and attach) ─────────────────────

async function fetchProfilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  const map = new Map<string, Profile>()
  if (!db || ids.length === 0) return map
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30)
    const snap = await getDocs(query(collection(db, 'profiles'), where(documentId(), 'in', chunk)))
    for (const d of snap.docs) map.set(d.id, { id: d.id, ...d.data() } as Profile)
  }
  return map
}

async function attachRangers<T extends { ranger_id: string }>(rows: T[]): Promise<(T & { ranger?: Profile })[]> {
  const profiles = await fetchProfilesByIds(rows.map((r) => r.ranger_id))
  return rows.map((r) => ({ ...r, ranger: profiles.get(r.ranger_id) }))
}

// ── Shifts ───────────────────────────────────────────────────────────────────

export async function getShiftsForDate(date: string): Promise<WorkShift[]> {
  if (db) {
    try {
      const rows = await runScoped<WorkShift>('work_shifts', [where('work_date', '==', date)])
      return await attachRangers(rows)
    } catch {
      // Offline or unreachable — fall through to the local cache.
    }
  }
  const localDb = await getDB()
  return localDb.getAllFromIndex('shifts', 'by-date', date)
}

export async function getShiftsInRange(from: string, to: string): Promise<WorkShift[]> {
  if (db) {
    try {
      const rows = await runScoped<WorkShift>(
        'work_shifts',
        [where('work_date', '>=', from), where('work_date', '<=', to), orderBy('work_date', 'desc')],
        (a, b) => b.work_date.localeCompare(a.work_date),
      )
      return await attachRangers(rows)
    } catch {
      // Offline or unreachable — fall through to the local cache.
    }
  }
  const localDb = await getDB()
  const all = await localDb.getAll('shifts')
  return all
    .filter((s) => s.work_date >= from && s.work_date <= to)
    .sort((a, b) => b.work_date.localeCompare(a.work_date))
}

export async function getShiftsForRanger(rangerId: string, limitCount = 30): Promise<WorkShift[]> {
  if (db) {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'work_shifts'),
          where('ranger_id', '==', rangerId),
          orderBy('work_date', 'desc'),
          fbLimit(limitCount),
        ),
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WorkShift)
    } catch {
      // Offline or unreachable — fall through to the local cache.
    }
  }
  const localDb = await getDB()
  const all = await localDb.getAllFromIndex('shifts', 'by-ranger', rangerId)
  return all.sort((a, b) => b.work_date.localeCompare(a.work_date)).slice(0, limitCount)
}

// ── Logbook ──────────────────────────────────────────────────────────────────

export async function addLogbookEntry(
  entry: Omit<LogbookEntry, 'id' | 'created_at'>,
): Promise<LogbookEntry> {
  const full: LogbookEntry = { ...entry, id: uuid(), created_at: new Date().toISOString() }
  const localDb = await getDB()
  await localDb.put('logbook', full)
  await enqueueSync('logbook', full)
  return full
}

export async function getLogbookEntries(rangerId: string): Promise<LogbookEntry[]> {
  if (db) {
    const snap = await getDocs(
      query(
        collection(db, 'logbook_entries'),
        where('ranger_id', '==', rangerId),
        orderBy('entry_date', 'desc'),
        orderBy('entry_time', 'desc'),
      ),
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LogbookEntry)
  }
  const localDb = await getDB()
  const all = await localDb.getAll('logbook')
  return all
    .filter((e) => e.ranger_id === rangerId)
    .sort((a, b) => `${b.entry_date}${b.entry_time}`.localeCompare(`${a.entry_date}${a.entry_time}`))
}

// ── Incidents ────────────────────────────────────────────────────────────────

export async function createIncident(
  incident: Omit<Incident, 'id' | 'created_at'>,
): Promise<Incident> {
  const full: Incident = { ...incident, id: uuid(), created_at: new Date().toISOString() }
  const localDb = await getDB()
  await localDb.put('incidents', full)
  await enqueueSync('incident', full)
  return full
}

export async function getIncidents(): Promise<Incident[]> {
  if (db) {
    try {
      const rows = await runScoped<Incident>(
        'incidents',
        [orderBy('created_at', 'desc')],
        (a, b) => b.created_at.localeCompare(a.created_at),
      )
      return await attachRangers(rows)
    } catch {
      // Offline or unreachable — fall through to the local cache.
    }
  }
  const localDb = await getDB()
  const all = await localDb.getAll('incidents')
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// ── Photos ───────────────────────────────────────────────────────────────────

export async function saveFieldPhoto(
  blob: Blob,
  meta: Omit<FieldPhoto, 'id' | 'url'>,
): Promise<string> {
  const id = uuid()
  const localDb = await getDB()
  await localDb.put('photos', { id, blob, meta: { ...meta, id } })
  await enqueueSync('photo', { photoId: id })
  return id
}

export async function getFieldPhotos(): Promise<FieldPhoto[]> {
  if (db) {
    try {
      const rows = await runScoped<FieldPhoto>(
        'field_photos',
        [orderBy('taken_at', 'desc')],
        (a, b) => b.taken_at.localeCompare(a.taken_at),
      )
      return await attachRangers(rows)
    } catch {
      // Offline or unreachable — fall through to the local cache.
    }
  }
  // Offline: expose local (not yet uploaded) photos via object URLs.
  const localDb = await getDB()
  const locals = await localDb.getAll('photos')
  return locals.map((l) => ({
    ...l.meta,
    url: URL.createObjectURL(l.blob),
  }))
}

// ── Admin: forestries / work units / users ───────────────────────────────────

export async function getForestries(): Promise<Forestry[]> {
  if (!db) return []
  const snap = await getDocs(query(collection(db, 'forestries'), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Forestry)
}

export async function createForestry(name: string): Promise<void> {
  if (!db) throw new Error('offline')
  const id = uuid()
  await setDoc(doc(db, 'forestries', id), { name, created_at: new Date().toISOString() })
}

export async function getWorkUnits(): Promise<WorkUnit[]> {
  if (!db) return []
  const snap = await getDocs(query(collection(db, 'work_units'), orderBy('name')))
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WorkUnit)
  const forestries = await fetchForestriesByIds(rows.map((r) => r.forestry_id))
  return rows.map((r) => ({ ...r, forestry: forestries.get(r.forestry_id) }))
}

async function fetchForestriesByIds(ids: string[]): Promise<Map<string, Forestry>> {
  const map = new Map<string, Forestry>()
  if (!db || ids.length === 0) return map
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30)
    const snap = await getDocs(
      query(collection(db, 'forestries'), where(documentId(), 'in', chunk)),
    )
    for (const d of snap.docs) map.set(d.id, { id: d.id, ...d.data() } as Forestry)
  }
  return map
}

export async function createWorkUnit(forestryId: string, name: string): Promise<void> {
  if (!db) throw new Error('offline')
  const id = uuid()
  await setDoc(doc(db, 'work_units', id), {
    forestry_id: forestryId,
    name,
    foreman_id: null,
    created_at: new Date().toISOString(),
  })
}

export async function getProfiles(): Promise<Profile[]> {
  if (!db) return []
  const snap = await getDocs(query(collection(db, 'profiles'), orderBy('full_name')))
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Profile)
  const workUnits = await fetchWorkUnitsByIds(rows.map((r) => r.work_unit_id).filter((id): id is string => !!id))
  return rows.map((r) => ({ ...r, work_unit: r.work_unit_id ? workUnits.get(r.work_unit_id) : undefined }))
}

async function fetchWorkUnitsByIds(ids: string[]): Promise<Map<string, WorkUnit>> {
  const map = new Map<string, WorkUnit>()
  if (!db || ids.length === 0) return map
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30)
    const snap = await getDocs(
      query(collection(db, 'work_units'), where(documentId(), 'in', chunk)),
    )
    for (const d of snap.docs) map.set(d.id, { id: d.id, ...d.data() } as WorkUnit)
  }
  const forestries = await fetchForestriesByIds([...map.values()].map((w) => w.forestry_id))
  for (const wu of map.values()) wu.forestry = forestries.get(wu.forestry_id)
  return map
}

export async function getRangersForSupervisor(supervisorId: string): Promise<Profile[]> {
  if (!db) return []
  const snap = await getDocs(
    query(
      collection(db, 'profiles'),
      where('supervisor_id', '==', supervisorId),
      where('role', '==', 'ranger'),
      where('active', '==', true),
      orderBy('full_name'),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Profile)
}

/** Active poslovođe — used for the admin's reassignment dropdown. */
export async function getForemen(): Promise<Profile[]> {
  if (!db) return []
  const snap = await getDocs(
    query(
      collection(db, 'profiles'),
      where('role', '==', 'foreman'),
      where('active', '==', true),
      orderBy('full_name'),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Profile)
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<void> {
  if (!db) throw new Error('offline')
  await updateDoc(doc(db, 'profiles', id), patch)
}

/** Poslovođa kreira nalog lugara (username + početna šifra) preko Cloud Function-a. */
export async function createRanger(input: {
  full_name: string
  username: string
  password: string
}): Promise<{ id: string; username: string }> {
  if (!functions) throw new Error('offline')
  const call = httpsCallable<
    typeof input,
    { id?: string; username?: string; error?: string }
  >(functions, 'createRanger')
  const { data } = await call(input)
  if (!data || data.error || !data.id || !data.username) {
    throw new Error(data?.error ?? 'Kreiranje naloga nije uspjelo')
  }
  return { id: data.id, username: data.username }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasksForRanger(rangerId: string): Promise<RangerTask[]> {
  if (!db) return []
  const snap = await getDocs(
    query(
      collection(db, 'ranger_tasks'),
      where('ranger_id', '==', rangerId),
      orderBy('created_at', 'desc'),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RangerTask)
}

export async function getTasksForForeman(foremanId: string): Promise<RangerTask[]> {
  if (!db) return []
  const snap = await getDocs(
    query(
      collection(db, 'ranger_tasks'),
      where('foreman_id', '==', foremanId),
      orderBy('created_at', 'desc'),
    ),
  )
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RangerTask)
  return attachRangers(rows)
}

export async function createTask(
  task: Omit<RangerTask, 'id' | 'created_at' | 'status' | 'completed_at' | 'completed_lat' | 'completed_lng'>,
): Promise<void> {
  if (!db) throw new Error('offline')
  const id = uuid()
  await setDoc(doc(db, 'ranger_tasks', id), {
    ...task,
    status: 'pending',
    completed_at: null,
    completed_lat: null,
    completed_lng: null,
    created_at: new Date().toISOString(),
  })
}

export async function completeTask(
  taskId: string,
  lat: number | null,
  lng: number | null,
): Promise<void> {
  await enqueueSync('task_completion', {
    taskId,
    lat,
    lng,
    completedAt: new Date().toISOString(),
  })
}

// ── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(recipientId: string): Promise<AppNotification[]> {
  if (!db) return []
  const snap = await getDocs(
    query(
      collection(db, 'notifications'),
      where('recipient_id', '==', recipientId),
      orderBy('created_at', 'desc'),
      fbLimit(50),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification)
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!db) return
  await updateDoc(doc(db, 'notifications', id), { read: true })
}

// ── Daily report helper ──────────────────────────────────────────────────────

export async function getTodayShiftForRanger(rangerId: string): Promise<WorkShift | null> {
  const date = todayISO()
  if (db) {
    const snap = await getDocs(
      query(
        collection(db, 'work_shifts'),
        where('ranger_id', '==', rangerId),
        where('work_date', '==', date),
        fbLimit(1),
      ),
    )
    if (!snap.empty) {
      const d = snap.docs[0]
      return { id: d.id, ...d.data() } as WorkShift
    }
  }
  const localDb = await getDB()
  const all = await localDb.getAllFromIndex('shifts', 'by-ranger', rangerId)
  return all.find((s) => s.work_date === date) ?? null
}
