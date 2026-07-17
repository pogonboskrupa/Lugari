import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Supabase client. When env vars are missing (local demo without a backend),
 * `supabase` is null and services fall back to offline/IndexedDB-only mode.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase nije konfigurisan. Postavite VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY u .env datoteci.',
    )
  }
  return supabase
}
