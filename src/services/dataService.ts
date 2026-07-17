import { getDB } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { uuid, todayISO } from '@/lib/utils'
import type {
  AppNotification,
  FieldPhoto,
  Forestry,
  Incident,
  LogbookEntry,
  Profile,
  RangerTask,
  WorkShift,
  WorkUnit,
} from '@/types'
import { enqueueSync } from './syncService'

/**
 * Data access layer. Reads prefer Supabase and fall back to IndexedDB;
 * writes always land in IndexedDB first and are synced via the queue.
 */

// ── Shifts ───────────────────────────────────────────────────────────────────

export async function getShiftsForDate(date: string): Promise<WorkShift[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('work_shifts')
      .select('*, ranger:profiles(*)')
      .eq('work_date', date)
    if (!error && data) return data as WorkShift[]
  }
  const db = await getDB()
  return db.getAllFromIndex('shifts', 'by-date', date)
}

export async function getShiftsInRange(from: string, to: string): Promise<WorkShift[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('work_shifts')
      .select('*, ranger:profiles(*)')
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: false })
    if (!error && data) return data as WorkShift[]
  }
  const db = await getDB()
  const all = await db.getAll('shifts')
  return all
    .filter((s) => s.work_date >= from && s.work_date <= to)
    .sort((a, b) => b.work_date.localeCompare(a.work_date))
}

export async function getShiftsForRanger(rangerId: string, limit = 30): Promise<WorkShift[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('work_shifts')
      .select('*')
      .eq('ranger_id', rangerId)
      .order('work_date', { ascending: false })
      .limit(limit)
    if (!error && data) return data as WorkShift[]
  }
  const db = await getDB()
  const all = await db.getAllFromIndex('shifts', 'by-ranger', rangerId)
  return all.sort((a, b) => b.work_date.localeCompare(a.work_date)).slice(0, limit)
}

// ── Logbook ──────────────────────────────────────────────────────────────────

export async function addLogbookEntry(
  entry: Omit<LogbookEntry, 'id' | 'created_at'>,
): Promise<LogbookEntry> {
  const full: LogbookEntry = { ...entry, id: uuid(), created_at: new Date().toISOString() }
  const db = await getDB()
  await db.put('logbook', full)
  await enqueueSync('logbook', full)
  return full
}

export async function getLogbookEntries(rangerId: string): Promise<LogbookEntry[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('logbook_entries')
      .select('*')
      .eq('ranger_id', rangerId)
      .order('entry_date', { ascending: false })
      .order('entry_time', { ascending: false })
    if (!error && data) return data as LogbookEntry[]
  }
  const db = await getDB()
  const all = await db.getAll('logbook')
  return all
    .filter((e) => e.ranger_id === rangerId)
    .sort((a, b) => `${b.entry_date}${b.entry_time}`.localeCompare(`${a.entry_date}${a.entry_time}`))
}

// ── Incidents ────────────────────────────────────────────────────────────────

export async function createIncident(
  incident: Omit<Incident, 'id' | 'created_at'>,
): Promise<Incident> {
  const full: Incident = { ...incident, id: uuid(), created_at: new Date().toISOString() }
  const db = await getDB()
  await db.put('incidents', full)
  await enqueueSync('incident', full)
  return full
}

export async function getIncidents(): Promise<Incident[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('incidents')
      .select('*, ranger:profiles(*)')
      .order('created_at', { ascending: false })
    if (!error && data) return data as Incident[]
  }
  const db = await getDB()
  const all = await db.getAll('incidents')
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// ── Photos ───────────────────────────────────────────────────────────────────

export async function saveFieldPhoto(
  blob: Blob,
  meta: Omit<FieldPhoto, 'id' | 'url'>,
): Promise<string> {
  const id = uuid()
  const db = await getDB()
  await db.put('photos', { id, blob, meta: { ...meta, id } })
  await enqueueSync('photo', { photoId: id })
  return id
}

export async function getFieldPhotos(): Promise<FieldPhoto[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('field_photos')
      .select('*, ranger:profiles(*)')
      .order('taken_at', { ascending: false })
    if (!error && data) return data as FieldPhoto[]
  }
  // Offline: expose local (not yet uploaded) photos via object URLs.
  const db = await getDB()
  const locals = await db.getAll('photos')
  return locals.map((l) => ({
    ...l.meta,
    url: URL.createObjectURL(l.blob),
  }))
}

// ── Admin: forestries / work units / users ───────────────────────────────────

export async function getForestries(): Promise<Forestry[]> {
  if (!supabase) return []
  const { data } = await supabase.from('forestries').select('*').order('name')
  return (data ?? []) as Forestry[]
}

export async function createForestry(name: string): Promise<void> {
  if (!supabase) throw new Error('offline')
  const { error } = await supabase.from('forestries').insert({ name })
  if (error) throw error
}

export async function getWorkUnits(): Promise<WorkUnit[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('work_units')
    .select('*, forestry:forestries(*)')
    .order('name')
  return (data ?? []) as WorkUnit[]
}

export async function createWorkUnit(forestryId: string, name: string): Promise<void> {
  if (!supabase) throw new Error('offline')
  const { error } = await supabase.from('work_units').insert({ forestry_id: forestryId, name })
  if (error) throw error
}

export async function getProfiles(): Promise<Profile[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('profiles')
    .select('*, work_unit:work_units(*, forestry:forestries(*))')
    .order('full_name')
  return (data ?? []) as Profile[]
}

export async function getRangersInWorkUnit(workUnitId: string): Promise<Profile[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('work_unit_id', workUnitId)
    .eq('role', 'ranger')
    .eq('active', true)
    .order('full_name')
  return (data ?? []) as Profile[]
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<void> {
  if (!supabase) throw new Error('offline')
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) throw error
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasksForRanger(rangerId: string): Promise<RangerTask[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('ranger_tasks')
    .select('*')
    .eq('ranger_id', rangerId)
    .order('created_at', { ascending: false })
  return (data ?? []) as RangerTask[]
}

export async function getTasksForForeman(foremanId: string): Promise<RangerTask[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('ranger_tasks')
    .select('*, ranger:profiles!ranger_tasks_ranger_id_fkey(*)')
    .eq('foreman_id', foremanId)
    .order('created_at', { ascending: false })
  return (data ?? []) as RangerTask[]
}

export async function createTask(
  task: Omit<RangerTask, 'id' | 'created_at' | 'status' | 'completed_at' | 'completed_lat' | 'completed_lng'>,
): Promise<void> {
  if (!supabase) throw new Error('offline')
  const { error } = await supabase.from('ranger_tasks').insert({ ...task, status: 'pending' })
  if (error) throw error
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
  if (!supabase) return []
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as AppNotification[]
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('notifications').update({ read: true }).eq('id', id)
}

// ── Daily report helper ──────────────────────────────────────────────────────

export async function getTodayShiftForRanger(rangerId: string): Promise<WorkShift | null> {
  const date = todayISO()
  if (supabase) {
    const { data } = await supabase
      .from('work_shifts')
      .select('*')
      .eq('ranger_id', rangerId)
      .eq('work_date', date)
      .maybeSingle()
    if (data) return data as WorkShift
  }
  const db = await getDB()
  const all = await db.getAllFromIndex('shifts', 'by-ranger', rangerId)
  return all.find((s) => s.work_date === date) ?? null
}
