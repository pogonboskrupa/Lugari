import { httpsCallable } from 'firebase/functions'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import { requireAuth, requireFunctions } from '@/lib/firebase'

/**
 * Resolves a login identifier (email or ranger username) to the email
 * Firebase Auth expects. Rangers log in with just a username; foreman/admin
 * use their real email. Runs as a Cloud Function since the profiles
 * collection isn't publicly readable and the caller isn't signed in yet.
 */
export async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const functions = requireFunctions()
  const call = httpsCallable<{ identifier: string }, { email: string | null }>(
    functions,
    'resolveLoginEmail',
  )
  const { data } = await call({ identifier: identifier.trim() })
  return data.email
}

/** Changes the current user's password after re-confirming the current one. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const auth = requireAuth()
  const user = auth.currentUser
  if (!user?.email) throw new Error('Nema aktivne sesije')

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword)
    await reauthenticateWithCredential(user, credential)
  } catch {
    throw new Error('Trenutna šifra nije tačna')
  }

  await updatePassword(user, newPassword)
}
