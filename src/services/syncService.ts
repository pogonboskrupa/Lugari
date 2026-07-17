import { getDB } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { uuid } from '@/lib/utils'
import type { Incident, LogbookEntry, SyncEntity, SyncQueueItem, WorkShift } from '@/types'

/**
 * Offline-first sync queue. Every write goes through IndexedDB first;
 * when the network is available the queue is drained to Supabase.
 */

const MAX_ATTEMPTS = 10

type SyncListener = (pending: number) => void
const listeners = new Set<SyncListener>()

export function onSyncStateChange(listener: SyncListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function notifyListeners() {
  const db = await getDB()
  const pending = await db.count('syncQueue')
  for (const l of listeners) l(pending)
}

export async function enqueueSync(entity: SyncEntity, payload: unknown): Promise<void> {
  const db = await getDB()
  const item: SyncQueueItem = {
    id: uuid(),
    entity,
    payload,
    created_at: Date.now(),
    attempts: 0,
  }
  await db.put('syncQueue', item)
  await notifyListeners()
  if (navigator.onLine) void drainQueue()
}

export async function pendingCount(): Promise<number> {
  const db = await getDB()
  return db.count('syncQueue')
}

let draining = false

export async function drainQueue(): Promise<void> {
  if (draining || !supabase) return
  draining = true
  try {
    const db = await getDB()
    const items = await db.getAllFromIndex('syncQueue', 'by-created')
    for (const item of items) {
      try {
        await pushItem(item)
        await db.delete('syncQueue', item.id)
      } catch {
        item.attempts += 1
        if (item.attempts >= MAX_ATTEMPTS) {
          // Keep the item but stop hot-looping on it; it will retry on next drain.
        }
        await db.put('syncQueue', item)
        break // Stop on first failure (likely offline again).
      }
    }
  } finally {
    draining = false
    await notifyListeners()
  }
}

async function pushItem(item: SyncQueueItem): Promise<void> {
  if (!supabase) throw new Error('offline')
  switch (item.entity) {
    case 'shift': {
      const shift = item.payload as WorkShift
      const { error } = await supabase.from('work_shifts').upsert({
        id: shift.id,
        ranger_id: shift.ranger_id,
        work_date: shift.work_date,
        started_at: shift.started_at,
        ended_at: shift.ended_at,
        status: shift.status,
        distance_m: shift.distance_m,
        duration_ms: shift.duration_ms,
        avg_speed_kmh: shift.avg_speed_kmh,
        max_speed_kmh: shift.max_speed_kmh,
        points: shift.points,
        departments_visited: shift.departments_visited,
        time_in_departments_ms: shift.time_in_departments_ms,
        time_at_landing_ms: shift.time_at_landing_ms,
        time_outside_ms: shift.time_outside_ms,
      })
      if (error) throw error
      break
    }
    case 'logbook': {
      const entry = item.payload as LogbookEntry
      const { error } = await supabase.from('logbook_entries').upsert(entry)
      if (error) throw error
      break
    }
    case 'incident': {
      const incident = item.payload as Incident
      const { ranger: _ranger, ...row } = incident
      const { error } = await supabase.from('incidents').upsert(row)
      if (error) throw error
      break
    }
    case 'photo': {
      const { photoId } = item.payload as { photoId: string }
      await uploadLocalPhoto(photoId)
      break
    }
    case 'task_completion': {
      const { taskId, lat, lng, completedAt } = item.payload as {
        taskId: string
        lat: number | null
        lng: number | null
        completedAt: string
      }
      const { error } = await supabase
        .from('ranger_tasks')
        .update({ status: 'done', completed_at: completedAt, completed_lat: lat, completed_lng: lng })
        .eq('id', taskId)
      if (error) throw error
      break
    }
  }
}

async function uploadLocalPhoto(photoId: string): Promise<void> {
  if (!supabase) throw new Error('offline')
  const db = await getDB()
  const local = await db.get('photos', photoId)
  if (!local) return // Already uploaded and cleaned up.

  const path = `${local.meta.ranger_id}/${photoId}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('field-photos')
    .upload(path, local.blob, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('field-photos').getPublicUrl(path)
  const { error } = await supabase.from('field_photos').upsert({
    ...local.meta,
    url: data.publicUrl,
  })
  if (error) throw error

  await db.delete('photos', photoId)
}

/** Wire automatic sync on connectivity changes. Call once at app start. */
export function initSync(): void {
  window.addEventListener('online', () => void drainQueue())
  if (navigator.onLine) void drainQueue()
  // Periodic safety-net drain (covers flaky connections that never fire 'online').
  setInterval(() => {
    if (navigator.onLine) void drainQueue()
  }, 60_000)
}
