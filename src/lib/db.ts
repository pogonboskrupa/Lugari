import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  LogbookEntry,
  Incident,
  FieldPhoto,
  SyncQueueItem,
  TrackPoint,
  WorkShift,
} from '@/types'

/** Locally stored photo blob waiting for upload. */
export interface LocalPhotoBlob {
  id: string
  blob: Blob
  meta: Omit<FieldPhoto, 'url'>
}

interface LugariDB extends DBSchema {
  shifts: {
    key: string
    value: WorkShift
    indexes: { 'by-date': string; 'by-ranger': string }
  }
  /** Points of the currently active shift — appended incrementally for crash safety. */
  activeTrack: {
    key: number
    value: TrackPoint & { shiftId: string }
  }
  logbook: {
    key: string
    value: LogbookEntry
    indexes: { 'by-date': string }
  }
  incidents: {
    key: string
    value: Incident
  }
  photos: {
    key: string
    value: LocalPhotoBlob
  }
  syncQueue: {
    key: string
    value: SyncQueueItem
    indexes: { 'by-created': number }
  }
  kv: {
    key: string
    value: unknown
  }
}

let dbPromise: Promise<IDBPDatabase<LugariDB>> | null = null

export function getDB(): Promise<IDBPDatabase<LugariDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LugariDB>('lugari', 1, {
      upgrade(db) {
        const shifts = db.createObjectStore('shifts', { keyPath: 'id' })
        shifts.createIndex('by-date', 'work_date')
        shifts.createIndex('by-ranger', 'ranger_id')

        db.createObjectStore('activeTrack', { autoIncrement: true })

        const logbook = db.createObjectStore('logbook', { keyPath: 'id' })
        logbook.createIndex('by-date', 'entry_date')

        db.createObjectStore('incidents', { keyPath: 'id' })
        db.createObjectStore('photos', { keyPath: 'id' })

        const queue = db.createObjectStore('syncQueue', { keyPath: 'id' })
        queue.createIndex('by-created', 'created_at')

        db.createObjectStore('kv')
      },
    })
  }
  return dbPromise
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB()
  return (await db.get('kv', key)) as T | undefined
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDB()
  await db.put('kv', value, key)
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getDB()
  await db.delete('kv', key)
}
