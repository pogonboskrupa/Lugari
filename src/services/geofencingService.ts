import { addLogbookEntry } from './dataService'
import type { LocationStatus } from '@/types'
import { kvGet, kvSet, kvDelete } from '@/lib/db'
import { todayISO } from '@/lib/utils'

/**
 * Geofencing: automatically records department enter/exit events into the
 * ranger's logbook while a shift is active.
 */

const LAST_DEPARTMENT_KEY = 'geofenceLastDepartment'

/** Mirrors the persisted value so the common "no change" path stays synchronous. */
let lastDepartment: string | null = null
let restored = false

export function resetGeofencing(): void {
  lastDepartment = null
  restored = true
  void kvDelete(LAST_DEPARTMENT_KEY)
}

export async function processGeofence(
  rangerId: string,
  status: LocationStatus,
): Promise<void> {
  // The app can be killed mid-shift; without restoring the last department the
  // exit entry is lost and re-entering logs a duplicate arrival.
  if (!restored) {
    lastDepartment = (await kvGet<string>(LAST_DEPARTMENT_KEY)) ?? null
    restored = true
  }

  const current = status.kind === 'department' ? status.label : null
  if (current === lastDepartment) return

  const time = new Date().toTimeString().slice(0, 5)

  if (lastDepartment) {
    await addLogbookEntry({
      ranger_id: rangerId,
      entry_date: todayISO(),
      entry_time: time,
      department: lastDepartment,
      activity: 'Obilazak odjela',
      description: `Automatski evidentiran izlazak iz odjela ${lastDepartment}`,
    })
  }
  if (current) {
    await addLogbookEntry({
      ranger_id: rangerId,
      entry_date: todayISO(),
      entry_time: time,
      department: current,
      activity: 'Obilazak odjela',
      description: `Automatski evidentiran ulazak u odjel ${current}`,
    })
  }

  lastDepartment = current
  if (current) await kvSet(LAST_DEPARTMENT_KEY, current)
  else await kvDelete(LAST_DEPARTMENT_KEY)
}
