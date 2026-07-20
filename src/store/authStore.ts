import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { kvGet, kvSet, kvDelete } from '@/lib/db'
import type { Profile } from '@/types'

interface AuthState {
  profile: Profile | null
  loading: boolean
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Local demo login without a Supabase backend. */
  signInDemo: (role: Profile['role']) => Promise<void>
}

const PROFILE_CACHE_KEY = 'cachedProfile'

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('profiles')
    .select('*, work_unit:work_units(*, forestry:forestries(*))')
    .eq('id', userId)
    .maybeSingle()
  return (data as Profile | null) ?? null
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  loading: true,

  init: async () => {
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        const userId = data.session?.user.id
        if (userId) {
          const profile = await fetchProfile(userId)
          if (profile) {
            await kvSet(PROFILE_CACHE_KEY, profile)
            set({ profile, loading: false })
            return
          }
        }
      }
      // Offline or no session — use the cached profile so the ranger can keep working.
      const cached = await kvGet<Profile>(PROFILE_CACHE_KEY)
      set({ profile: cached ?? null, loading: false })
    } catch {
      const cached = await kvGet<Profile>(PROFILE_CACHE_KEY)
      set({ profile: cached ?? null, loading: false })
    }
  },

  signIn: async (email, password) => {
    if (!supabase) throw new Error('Supabase nije konfigurisan')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('Pogrešan email ili lozinka')
    const profile = await fetchProfile(data.user.id)
    if (!profile) throw new Error('Korisnički profil ne postoji')
    if (!profile.active) throw new Error('Korisnički nalog je deaktiviran')
    await kvSet(PROFILE_CACHE_KEY, profile)
    set({ profile })
  },

  signOut: async () => {
    await supabase?.auth.signOut()
    await kvDelete(PROFILE_CACHE_KEY)
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
    set({ profile: demo })
  },
}))
