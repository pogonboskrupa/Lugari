import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'

initializeApp()
const db = getFirestore()
const auth = getAuth()

const USERNAME_DOMAIN = 'lugari.local'
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

// ── createRanger ─────────────────────────────────────────────────────────────
// Poslovođa uzgoja kreira nalog lugara (username + početna šifra).
// Zamjena za Supabase Edge funkciju `create-ranger`.

export const createRanger = onCall<{
  full_name?: string
  username?: string
  password?: string
}>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Nevažeća sesija')
  }

  const callerSnap = await db.collection('profiles').doc(request.auth.uid).get()
  const caller = callerSnap.data()
  if (!caller || caller.role !== 'foreman' || !caller.active) {
    throw new HttpsError('permission-denied', 'Samo aktivni poslovođa uzgoja može dodavati lugare')
  }

  const fullName = (request.data.full_name ?? '').trim()
  const username = (request.data.username ?? '').trim().toLowerCase()
  const password = request.data.password ?? ''

  if (!fullName || !username || password.length < 6) {
    throw new HttpsError(
      'invalid-argument',
      'Potrebno je ime, korisničko ime i šifra (min. 6 znakova)',
    )
  }
  if (!USERNAME_RE.test(username)) {
    throw new HttpsError(
      'invalid-argument',
      'Korisničko ime smije sadržati samo slova, brojeve, tačku, crtu i donju crtu',
    )
  }

  const existing = await db
    .collection('profiles')
    .where('username', '==', username)
    .limit(1)
    .get()
  if (!existing.empty) {
    throw new HttpsError('already-exists', 'Korisničko ime je već zauzeto')
  }

  let userRecord
  try {
    userRecord = await auth.createUser({
      email: `${username}@${USERNAME_DOMAIN}`,
      password,
      emailVerified: true,
    })
  } catch (err) {
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Kreiranje naloga nije uspjelo')
  }

  await db.collection('profiles').doc(userRecord.uid).set({
    full_name: fullName,
    role: 'ranger',
    work_unit_id: null,
    forestry_id: null,
    phone: null,
    active: true,
    created_at: new Date().toISOString(),
    username,
    supervisor_id: request.auth.uid,
  })

  return { id: userRecord.uid, username }
})

// ── resolveLoginEmail ────────────────────────────────────────────────────────
// Rezolvira login identifikator (email ili korisničko ime lugara) u email
// koji Firebase Auth očekuje. Poziva se prije prijave (klijent još nije
// autentifikovan), pa mora biti callable bez zahtjeva za auth.

export const resolveLoginEmail = onCall<{ identifier?: string }>(async (request) => {
  const identifier = (request.data.identifier ?? '').trim()
  if (!identifier) return { email: null }
  if (identifier.includes('@')) return { email: identifier }

  const snap = await db
    .collection('profiles')
    .where('username', '==', identifier.toLowerCase())
    .where('role', '==', 'ranger')
    .limit(1)
    .get()
  if (snap.empty) return { email: null }

  const username = snap.docs[0].data().username as string
  return { email: `${username}@${USERNAME_DOMAIN}` }
})

// ── Automatske obavijesti poslovođi za nove prijave, fotografije i kraj smjene ─
// Zamjena za Postgres trigere iz 00001_schema.sql / 00002_user_management.sql.

async function supervisorOf(rangerId: string): Promise<string | null> {
  const snap = await db.collection('profiles').doc(rangerId).get()
  return (snap.data()?.supervisor_id as string | undefined) ?? null
}

async function rangerName(rangerId: string): Promise<string> {
  const snap = await db.collection('profiles').doc(rangerId).get()
  return (snap.data()?.full_name as string | undefined) ?? ''
}

export const onIncidentCreated = onDocumentCreated('incidents/{incidentId}', async (event) => {
  const incident = event.data?.data()
  if (!incident) return
  const fid = await supervisorOf(incident.ranger_id)
  if (!fid) return
  const name = await rangerName(incident.ranger_id)
  await db.collection('notifications').add({
    recipient_id: fid,
    type: 'incident',
    title: 'Nova prijava',
    body: `${name}: ${incident.type}`,
    ref_id: event.params.incidentId,
    read: false,
    created_at: new Date().toISOString(),
  })
})

export const onFieldPhotoCreated = onDocumentCreated('field_photos/{photoId}', async (event) => {
  const photo = event.data?.data()
  if (!photo) return
  const fid = await supervisorOf(photo.ranger_id)
  if (!fid) return
  const name = await rangerName(photo.ranger_id)
  await db.collection('notifications').add({
    recipient_id: fid,
    type: 'photo',
    title: 'Nova fotografija',
    body: photo.department ? `${name} · ${photo.department}` : name,
    ref_id: event.params.photoId,
    read: false,
    created_at: new Date().toISOString(),
  })
})

export const onWorkShiftWritten = onDocumentWritten('work_shifts/{shiftId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!after || after.status !== 'finished') return
  if (before?.status === 'finished') return // Already notified.

  const fid = await supervisorOf(after.ranger_id)
  if (!fid) return
  const name = await rangerName(after.ranger_id)
  const km = Math.round((after.distance_m / 1000) * 10) / 10
  await db.collection('notifications').add({
    recipient_id: fid,
    type: 'shift_end',
    title: 'Završen radni dan',
    body: `${name} je završio radni dan (${km} km).`,
    ref_id: event.params.shiftId,
    read: false,
    created_at: new Date().toISOString(),
  })
})
