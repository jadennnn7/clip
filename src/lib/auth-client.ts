'use client'

import { clearPendingVideo } from '@/lib/pending-video'

/**
 * Meldet dieses Gerät ab und lädt die Anmeldeseite komplett neu.
 *
 * Der volle Seitenwechsel ist Absicht: Workspace, Editor und Guthaben liegen
 * im Speicher des Tabs. Ein normaler Seitenwechsel ließe sie für die nächste
 * Person am selben Browser stehen. Aus demselben Grund fällt der Verlauf des
 * Hilfe-Chats (sessionStorage) weg.
 *
 * Wirft mit einer lesbaren Meldung, wenn die Abmeldung nicht geklappt hat —
 * dann ist man noch angemeldet.
 */
export async function signOut(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => null)
  if (!response) throw new Error('Der Server ist gerade nicht erreichbar. Du bist noch angemeldet.')
  // 401: Die Session war schon abgelaufen — das Ziel ist erreicht.
  if (!response.ok && response.status !== 401) {
    const data = await response.json().catch(() => null) as { error?: unknown } | null
    throw new Error(typeof data?.error === 'string' ? data.error : 'Die Abmeldung hat nicht geklappt. Bitte versuche es erneut.')
  }
  clearPendingVideo()
  try { sessionStorage.clear() } catch { /* blockiert — dann gibt es auch nichts zu löschen */ }
  window.location.replace('/login?signed_out=1')
}
