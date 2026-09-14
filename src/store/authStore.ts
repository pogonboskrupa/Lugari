import { create } from 'zustand'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { kvGet, kvSet, kvDelete } from '@/lib/db'
import { setDataViewer } from '@/services/dataService'
import type { Profile, WorkUnit, Forestry } from '@/types'

interface AuthState {
  profile: Profile | null
  loading: boolean
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Local demo login without a Firebase backend. */
  signInDemo: (role: Profile['role']) => Promise<void>
}

const PROFILE_CACHE_KEY = 'cachedProfile'

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!db) return null
  const snap = await getDoc(doc(db, 'profiles', userId))
  if (!snap.exists()) return null
  const profile = { id: snap.id, ...snap.data() } as Profile

  if (profile.work_unit_id) {
    const wuSnap = await getDoc(doc(db, 'work_units', profile.work_unit_id))
    if (wuSnap.exists()) {
      const workUnit = { id: wuSnap.id, ...wuSnap.data() } as WorkUnit
      if (workUnit.forestry_id) {
        const fSnap = await getDoc(doc(db, 'forestries', workUnit.forestry_id))
        if (fSnap.exists()) workUnit.forestry = { id: fSnap.id, ...fSnap.data() } as Forestry
      }
      profile.work_unit = workUnit
    }
  }
  return profile
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  loading: true,

  init: async () => {
    try {
      if (auth) {
        const firebaseAuth = auth
        const userId = await new Promise<string | null>((resolve) => {
          const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
            unsubscribe()
            resolve(user?.uid ?? null)
          })
        })
        if (userId) {
          const profile = await fetchProfile(userId)
          // An account awaiting approval (or since deactivated) must not slip in
          // through a restored session — signIn is not the only way in.
          if (profile && !profile.active) {
            await fbSignOut(auth)
            await kvDelete(PROFILE_CACHE_KEY)
            setDataViewer(null)
            set({ profile: null, loading: false })
            return
          }
          if (profile) {
            await kvSet(PROFILE_CACHE_KEY, profile)
            setDataViewer(profile)
            set({ profile, loading: false })
            return
          }
        }
      }
      // Offline or no session — use the cached profile so the ranger can keep working.
      const cached = await kvGet<Profile>(PROFILE_CACHE_KEY)
      setDataViewer(cached ?? null)
      set({ profile: cached ?? null, loading: false })
    } catch {
      const cached = await kvGet<Profile>(PROFILE_CACHE_KEY)
      setDataViewer(cached ?? null)
      set({ profile: cached ?? null, loading: false })
    }
  },

  signIn: async (email, password) => {
    if (!auth) throw new Error('Firebase nije konfigurisan')
    let userId: string
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      userId = credential.user.uid
    } catch {
      throw new Error('Pogrešan email ili lozinka')
    }
    const profile = await fetchProfile(userId)
    if (!profile) throw new Error('Korisnički profil ne postoji')
    if (!profile.active) {
      await fbSignOut(auth)
      throw new Error('Korisnički nalog čeka odobrenje ili je deaktiviran')
    }
    await kvSet(PROFILE_CACHE_KEY, profile)
    setDataViewer(profile)
    set({ profile })
  },

  signOut: async () => {
    if (auth) await fbSignOut(auth)
    await kvDelete(PROFILE_CACHE_KEY)
    setDataViewer(null)
    set({ profile: null })
  },

  signInDemo: async (role) => {
    const demo: Profile = {
      id: `demo-${role}`,
      full_name:
        role === 'admin'
          ? 'Demo Administrator'
          : role === 'foreman'
            ? 'Demo Poslovođa uzgoja'
            : 'Demo Lugar',
      role,
      work_unit_id: null,
      forestry_id: null,
      phone: null,
      active: true,
      created_at: new Date().toISOString(),
      username: role === 'ranger' ? 'demo.lugar' : null,
      supervisor_id: null,
    }
    await kvSet(PROFILE_CACHE_KEY, demo)
    setDataViewer(demo)
    set({ profile: demo })
  },
}))
