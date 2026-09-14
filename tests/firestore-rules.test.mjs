/**
 * Firestore security-rules tests.
 *
 * Run with: npm run test:rules   (starts the Firestore emulator, needs Java)
 *
 * The "scoped queries" block is the important one: Firestore rules are not
 * filters, so a collection-wide read that could return one forbidden document
 * fails outright. Every such read in dataService.ts must stay narrowed to the
 * rangers the viewer may see — these tests pin that down.
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
} from 'firebase/firestore'

const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url))

const testEnv = await initializeTestEnvironment({
  projectId: 'lugari-rules-test',
  firestore: {
    rules: readFileSync(rulesPath, 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
})

const ADMIN = 'admin1'
const FOREMAN_A = 'foremanA'
const FOREMAN_B = 'foremanB'
const RANGER_A1 = 'rangerA1'
const RANGER_A2 = 'rangerA2'
const RANGER_B1 = 'rangerB1'

function profile(over) {
  return {
    full_name: 'X',
    role: 'ranger',
    work_unit_id: null,
    forestry_id: null,
    phone: null,
    active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    username: null,
    supervisor_id: null,
    ...over,
  }
}

function shift(rangerId, date = '2026-09-14') {
  return {
    ranger_id: rangerId,
    work_date: date,
    started_at: '2026-09-14T06:00:00.000Z',
    ended_at: null,
    status: 'active',
    distance_m: 0,
    duration_ms: 0,
    avg_speed_kmh: 0,
    max_speed_kmh: 0,
    points: [],
    departments_visited: [],
    time_in_departments_ms: 0,
    time_at_landing_ms: 0,
    time_outside_ms: 0,
  }
}

// ── Seed data bypassing rules ───────────────────────────────────────────────
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  await setDoc(doc(db, 'profiles', ADMIN), profile({ role: 'admin', full_name: 'Admin' }))
  await setDoc(doc(db, 'profiles', FOREMAN_A), profile({ role: 'foreman', full_name: 'Foreman A' }))
  await setDoc(doc(db, 'profiles', FOREMAN_B), profile({ role: 'foreman', full_name: 'Foreman B' }))
  await setDoc(doc(db, 'profiles', RANGER_A1), profile({ supervisor_id: FOREMAN_A, full_name: 'A1' }))
  await setDoc(doc(db, 'profiles', RANGER_A2), profile({ supervisor_id: FOREMAN_A, full_name: 'A2' }))
  await setDoc(doc(db, 'profiles', RANGER_B1), profile({ supervisor_id: FOREMAN_B, full_name: 'B1' }))

  await setDoc(doc(db, 'work_shifts', 's-a1'), shift(RANGER_A1))
  await setDoc(doc(db, 'work_shifts', 's-a2'), shift(RANGER_A2))
  await setDoc(doc(db, 'work_shifts', 's-b1'), shift(RANGER_B1))

  await setDoc(doc(db, 'incidents', 'i-a1'), {
    ranger_id: RANGER_A1,
    type: 'Požar',
    description: 'x',
    created_at: '2026-09-14T07:00:00.000Z',
  })
  await setDoc(doc(db, 'incidents', 'i-b1'), {
    ranger_id: RANGER_B1,
    type: 'Požar',
    description: 'x',
    created_at: '2026-09-14T07:00:00.000Z',
  })

  await setDoc(doc(db, 'ranger_tasks', 't-a1'), {
    foreman_id: FOREMAN_A,
    ranger_id: RANGER_A1,
    title: 'Obići odjel',
    description: null,
    department: null,
    due_date: null,
    status: 'pending',
    completed_at: null,
    completed_lat: null,
    completed_lng: null,
    created_at: '2026-09-14T05:00:00.000Z',
  })

  await setDoc(doc(db, 'notifications', 'n-a'), {
    recipient_id: FOREMAN_A,
    type: 'incident',
    title: 'x',
    body: 'y',
    read: false,
    ref_id: null,
    created_at: '2026-09-14T07:00:00.000Z',
  })
})

const as = (uid) => testEnv.authenticatedContext(uid).firestore()
const anon = () => testEnv.unauthenticatedContext().firestore()

let passed = 0
let failed = 0
async function check(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err) {
    failed++
    console.log(`  FAIL ${name}\n       ${err.message?.split('\n')[0]}`)
  }
}

console.log('\nProfiles')
await check('ranger reads own profile', () =>
  assertSucceeds(getDoc(doc(as(RANGER_A1), 'profiles', RANGER_A1))))
await check('ranger cannot read another ranger profile', () =>
  assertFails(getDoc(doc(as(RANGER_A1), 'profiles', RANGER_B1))))
await check('foreman reads own ranger profile', () =>
  assertSucceeds(getDoc(doc(as(FOREMAN_A), 'profiles', RANGER_A1))))
await check('foreman cannot read other foreman ranger', () =>
  assertFails(getDoc(doc(as(FOREMAN_A), 'profiles', RANGER_B1))))
await check('admin reads any profile', () =>
  assertSucceeds(getDoc(doc(as(ADMIN), 'profiles', RANGER_B1))))
await check('anonymous cannot read profiles', () =>
  assertFails(getDoc(doc(anon(), 'profiles', RANGER_A1))))
await check('ranger cannot escalate own role', () =>
  assertFails(updateDoc(doc(as(RANGER_A1), 'profiles', RANGER_A1), { role: 'admin' })))
await check('admin can update a profile', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'profiles', RANGER_A1), { active: false })))

console.log('\nScoped queries (rules are not filters)')
await check('foreman scoped shift query by ranger_id in [...] succeeds', () =>
  assertSucceeds(getDocs(query(
    collection(as(FOREMAN_A), 'work_shifts'),
    where('ranger_id', 'in', [RANGER_A1, RANGER_A2]),
    where('work_date', '==', '2026-09-14'),
  ))))
await check('foreman UNSCOPED shift query is denied', () =>
  assertFails(getDocs(query(
    collection(as(FOREMAN_A), 'work_shifts'),
    where('work_date', '==', '2026-09-14'),
  ))))
await check('ranger scoped shift query succeeds', () =>
  assertSucceeds(getDocs(query(
    collection(as(RANGER_A1), 'work_shifts'),
    where('ranger_id', 'in', [RANGER_A1]),
    where('work_date', '==', '2026-09-14'),
  ))))
await check('ranger UNSCOPED incident query is denied', () =>
  assertFails(getDocs(query(
    collection(as(RANGER_A1), 'incidents'),
    orderBy('created_at', 'desc'),
  ))))
await check('ranger scoped incident query succeeds', () =>
  assertSucceeds(getDocs(query(
    collection(as(RANGER_A1), 'incidents'),
    where('ranger_id', 'in', [RANGER_A1]),
    orderBy('created_at', 'desc'),
  ))))
await check('admin unscoped shift query succeeds', () =>
  assertSucceeds(getDocs(query(
    collection(as(ADMIN), 'work_shifts'),
    where('work_date', '==', '2026-09-14'),
  ))))
await check('foreman cannot scope to another foreman ranger', () =>
  assertFails(getDocs(query(
    collection(as(FOREMAN_A), 'work_shifts'),
    where('ranger_id', 'in', [RANGER_B1]),
  ))))

console.log('\nShift writes')
await check('ranger publishes own live shift', () =>
  assertSucceeds(setDoc(doc(as(RANGER_A1), 'work_shifts', 's-a1'), shift(RANGER_A1))))
await check('ranger cannot write a shift for someone else', () =>
  assertFails(setDoc(doc(as(RANGER_A1), 'work_shifts', 's-new'), shift(RANGER_B1))))
await check('ranger cannot seize another ranger shift document', () =>
  assertFails(setDoc(doc(as(RANGER_A1), 'work_shifts', 's-b1'), shift(RANGER_A1))))
await check('foreman cannot write a shift', () =>
  assertFails(setDoc(doc(as(FOREMAN_A), 'work_shifts', 's-f'), shift(RANGER_A1))))

console.log('\nTasks')
await check('foreman creates task for own ranger', () =>
  assertSucceeds(setDoc(doc(as(FOREMAN_A), 'ranger_tasks', 't-new'), {
    foreman_id: FOREMAN_A, ranger_id: RANGER_A1, title: 'T', description: null,
    department: null, due_date: null, status: 'pending', completed_at: null,
    completed_lat: null, completed_lng: null, created_at: '2026-09-14T05:00:00.000Z',
  })))
await check('ranger cannot create a task', () =>
  assertFails(setDoc(doc(as(RANGER_A1), 'ranger_tasks', 't-x'), {
    foreman_id: FOREMAN_A, ranger_id: RANGER_A1, title: 'T', status: 'pending',
  })))
await check('ranger completes own task', () =>
  assertSucceeds(updateDoc(doc(as(RANGER_A1), 'ranger_tasks', 't-a1'), {
    status: 'done', completed_at: '2026-09-14T09:00:00.000Z',
    completed_lat: 44.8, completed_lng: 16.1,
  })))
await check('ranger cannot reassign a task', () =>
  assertFails(updateDoc(doc(as(RANGER_A1), 'ranger_tasks', 't-a1'), { ranger_id: RANGER_A2 })))
await check('unrelated ranger cannot read task', () =>
  assertFails(getDoc(doc(as(RANGER_B1), 'ranger_tasks', 't-a1'))))

console.log('\nNotifications')
await check('recipient reads own notification', () =>
  assertSucceeds(getDocs(query(
    collection(as(FOREMAN_A), 'notifications'),
    where('recipient_id', '==', FOREMAN_A),
    orderBy('created_at', 'desc'),
  ))))
await check('other user cannot read it', () =>
  assertFails(getDoc(doc(as(FOREMAN_B), 'notifications', 'n-a'))))
await check('recipient marks it read', () =>
  assertSucceeds(updateDoc(doc(as(FOREMAN_A), 'notifications', 'n-a'), { read: true })))
await check('client cannot create notifications', () =>
  assertFails(setDoc(doc(as(RANGER_A1), 'notifications', 'n-spam'), {
    recipient_id: FOREMAN_B, type: 'alert', title: 'spam', body: 'spam',
    read: false, ref_id: null, created_at: '2026-09-14T07:00:00.000Z',
  })))

console.log('\nRegistration')
await check('foreman self-registers as inactive', () =>
  assertSucceeds(setDoc(doc(as('newForeman'), 'profiles', 'newForeman'),
    profile({ role: 'foreman', active: false }))))
await check('cannot self-register already active', () =>
  assertFails(setDoc(doc(as('newForeman2'), 'profiles', 'newForeman2'),
    profile({ role: 'foreman', active: true }))))
await check('cannot self-register as admin', () =>
  assertFails(setDoc(doc(as('newAdmin'), 'profiles', 'newAdmin'),
    profile({ role: 'admin', active: false }))))
await check('cannot create a profile for someone else', () =>
  assertFails(setDoc(doc(as('newForeman3'), 'profiles', 'victim'),
    profile({ role: 'foreman', active: false }))))

console.log('\nOrganisation')
await check('signed-in user reads forestries', () =>
  assertSucceeds(getDocs(collection(as(RANGER_A1), 'forestries'))))
await check('non-admin cannot create forestry', () =>
  assertFails(setDoc(doc(as(FOREMAN_A), 'forestries', 'f-x'), { name: 'X', created_at: 'now' })))
await check('admin creates forestry', () =>
  assertSucceeds(setDoc(doc(as(ADMIN), 'forestries', 'f-y'), { name: 'Y', created_at: 'now' })))

console.log(`\n${passed} passed, ${failed} failed\n`)
await testEnv.cleanup()
process.exit(failed > 0 ? 1 : 0)
