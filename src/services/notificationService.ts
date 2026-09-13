import { addDoc, collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AppNotificationType } from '@/types'

/**
 * Notifications: docs in the `notifications` collection (delivered in-app via
 * a Firestore realtime listener) plus a local Web Notification when permitted.
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showLocalNotification(title: string, body: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icons/icon-192.png' })
    } catch {
      // Some Android WebViews only allow notifications through the SW registration.
    }
  }
}

export async function notifyUser(
  recipientId: string,
  type: AppNotificationType,
  title: string,
  body: string,
  refId: string | null = null,
): Promise<void> {
  if (!db) return
  await addDoc(collection(db, 'notifications'), {
    recipient_id: recipientId,
    type,
    title,
    body,
    ref_id: refId,
    read: false,
    created_at: new Date().toISOString(),
  })
}

/** Subscribes to realtime notifications for the given user. Returns unsubscribe fn. */
export function subscribeToNotifications(
  userId: string,
  onNotification: (title: string, body: string) => void,
): () => void {
  if (!db) return () => undefined
  const notificationsQuery = query(
    collection(db, 'notifications'),
    where('recipient_id', '==', userId),
    orderBy('created_at', 'desc'),
  )
  let first = true
  const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
    if (first) {
      // Skip the initial snapshot dump — only react to genuinely new inserts.
      first = false
      return
    }
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added') {
        const row = change.doc.data() as { title: string; body: string }
        onNotification(row.title, row.body)
        showLocalNotification(row.title, row.body)
      }
    }
  })
  return unsubscribe
}
