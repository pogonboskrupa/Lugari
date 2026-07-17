import { addLogbookEntry } from './dataService'
import type { LocationStatus } from '@/types'
import { todayISO } from '@/lib/utils'

/**
 * Geofencing: automatically records department enter/exit events into the
 * ranger's logbook while a shift is active.
 */

let lastDepartment: string | null = null

export function resetGeofencing(): void {
  lastDepartment = null
}

export async function processGeofence(
  rangerId: string,
  status: LocationStatus,
): Promise<void> {
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
}
