import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { getDB } from '@/lib/db'
import { db, storage } from '@/lib/firebase'
import { uuid } from '@/lib/utils'
import type { Incident, LogbookEntry, SyncEntity, SyncQueueItem, WorkShift } from '@/types'

/**
 * Offline-first sync queue. Every write goes through IndexedDB first;
 * when the network is available the queue is drained to Firestore.
 */

const MAX_ATTEMPTS = 10

type SyncListener = (pending: number) => void
const listeners = new Set<SyncListener>()

export function onSyncStateChange(listener: SyncListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function notifyListeners() {
  const localDb = await getDB()
  const pending = await localDb.count('syncQueue')
  for (const l of listeners) l(pending)
}

export async function enqueueSync(entity: SyncEntity, payload: unknown): Promise<void> {
  const localDb = await getDB()
  const item: SyncQueueItem = {
    id: uuid(),
    entity,
    payload,
    created_at: Date.now(),
    attempts: 0,
  }
  await localDb.put('syncQueue', item)
  await notifyListeners()
  if (navigator.onLine) void drainQueue()
}

export async function pendingCount(): Promise<number> {
  const localDb = await getDB()
  return localDb.count('syncQueue')
}

let draining = false

export async function drainQueue(): Promise<void> {
  if (draining || !db) return
  draining = true
  try {
    const localDb = await getDB()
    const items = await localDb.getAllFromIndex('syncQueue', 'by-created')
    for (const item of items) {
      try {
        await pushItem(item)
        await localDb.delete('syncQueue', item.id)
      } catch {
        item.attempts += 1
        if (item.attempts >= MAX_ATTEMPTS) {
          // Keep the item but stop hot-looping on it; it will retry on next drain.
        }
        await localDb.put('syncQueue', item)
        break // Stop on first failure (likely offline again).
      }
    }
  } finally {
    draining = false
    await notifyListeners()
  }
}

/** The Firestore representation of a shift (drops the joined `ranger` profile). */
function shiftDoc(shift: WorkShift) {
  return {
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
  }
}

/**
 * Best-effort upload of an in-progress shift so the foreman's live map sees it.
 * Deliberately bypasses the durable queue: each snapshot supersedes the last and
 * the authoritative write still happens through the queue when the shift ends.
 */
export async function publishActiveShift(shift: WorkShift): Promise<void> {
  if (!db || !navigator.onLine) return
  try {
    await setDoc(doc(db, 'work_shifts', shift.id), shiftDoc(shift))
  } catch {
    // Live position is disposable — the end-of-shift write carries the real data.
  }
}

async function pushItem(item: SyncQueueItem): Promise<void> {
  if (!db) throw new Error('offline')
  switch (item.entity) {
    case 'shift': {
      const shift = item.payload as WorkShift
      await setDoc(doc(db, 'work_shifts', shift.id), shiftDoc(shift))
      break
    }
    case 'logbook': {
      const entry = item.payload as LogbookEntry
      const { id, ...row } = entry
      await setDoc(doc(db, 'logbook_entries', id), row)
      break
    }
    case 'incident': {
      const incident = item.payload as Incident
      const { id, ranger: _ranger, ...row } = incident
      await setDoc(doc(db, 'incidents', id), row)
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
      await updateDoc(doc(db, 'ranger_tasks', taskId), {
        status: 'done',
        completed_at: completedAt,
        completed_lat: lat,
        completed_lng: lng,
      })
      break
    }
  }
}

async function uploadLocalPhoto(photoId: string): Promise<void> {
  if (!db || !storage) throw new Error('offline')
  const localDb = await getDB()
  const local = await localDb.get('photos', photoId)
  if (!local) return // Already uploaded and cleaned up.

  const path = `field-photos/${local.meta.ranger_id}/${photoId}.jpg`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, local.blob, { contentType: 'image/jpeg' })
  const url = await getDownloadURL(storageRef)

  const { id, ranger: _ranger, ...row } = local.meta
  await setDoc(doc(db, 'field_photos', id), { ...row, url })

  await localDb.delete('photos', photoId)
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
