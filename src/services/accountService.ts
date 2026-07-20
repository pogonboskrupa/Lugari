import { requireSupabase } from '@/lib/supabase'

/**
 * Resolves a login identifier (email or ranger username) to the email
 * Supabase Auth expects. Rangers log in with just a username; foreman/admin
 * use their real email.
 */
export async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('resolve_login_email', {
    p_identifier: identifier.trim(),
  })
  if (error) throw error
  return (data as string | null) ?? null
}

/** Changes the current user's password after re-confirming the current one. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const supabase = requireSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Nema aktivne sesije')

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (reauthError) throw new Error('Trenutna šifra nije tačna')

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
