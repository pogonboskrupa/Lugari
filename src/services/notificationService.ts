import { supabase } from '@/lib/supabase'
import type { AppNotificationType } from '@/types'

/**
 * Notifications: rows in the `notifications` table (delivered in-app via
 * realtime subscription) plus a local Web Notification when permitted.
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
  if (!supabase) return
  await supabase.from('notifications').insert({
    recipient_id: recipientId,
    type,
    title,
    body,
    ref_id: refId,
    read: false,
  })
}

/** Subscribes to realtime notifications for the given user. Returns unsubscribe fn. */
export function subscribeToNotifications(
  userId: string,
  onNotification: (title: string, body: string) => void,
): () => void {
  if (!supabase) return () => undefined
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as { title: string; body: string }
        onNotification(row.title, row.body)
        showLocalNotification(row.title, row.body)
      },
    )
    .subscribe()
  return () => {
    void supabase?.removeChannel(channel)
  }
}
