import type { AutomationMode, Clip, ScheduleStatus, SocialAccount } from '@/types/database'

/**
 * Entscheidet, ob und in welchem Zustand ein Clip für einen Kanal eingeplant wird.
 *
 * Hier sitzt der Kern des USP-Kompromisses. Die Plattformen erlauben
 * Vollautomatik nicht durchgängig, also wird pro Kanal entschieden statt global:
 *
 *   auto_publish  → `pending`, der Worker postet ohne Rückfrage
 *   review_queue  → `needs_review`, wartet auf einen Klick des Nutzers
 *   manual        → gar kein Eintrag
 *
 * TikTok läuft bis zum bestandenen Content-Posting-Audit zwangsweise in
 * `review_queue` (un-auditierte Clients dürfen nur SELF_ONLY posten).
 */
export function resolveScheduleStatus(
  clip: Clip,
  account: SocialAccount,
): ScheduleStatus | null {
  if (account.status !== 'active') return null

  const mode: AutomationMode = account.automation_mode

  if (mode === 'manual') return null
  if (mode === 'review_queue') return 'needs_review'

  // auto_publish: die Score-Schwelle entscheidet. Ein Clip unterhalb der
  // Schwelle wird nicht verworfen, sondern zur Freigabe vorgelegt — der Nutzer
  // soll ihn sehen und selbst entscheiden können.
  return clip.virality_score >= account.auto_publish_min_score ? 'pending' : 'needs_review'
}

/**
 * Verteilt Clips über die Zeit statt sie alle gleichzeitig zu posten.
 *
 * Drei Gründe: Plattformen drosseln Bursts, die Reichweite leidet, wenn ein
 * Kanal fünf Videos in einer Minute veröffentlicht, und ein gleichmäßiger
 * Rhythmus ist genau das, wofür Nutzer dieses Produkt kaufen.
 *
 * Die stärksten Clips (höchster Score) kommen zuerst — sie bekommen die
 * besten Slots.
 */
export function distributePublishTimes(
  clips: Clip[],
  options: {
    startAt?: Date
    /** Abstand zwischen zwei Veröffentlichungen. */
    intervalHours?: number
    /** Tageszeitfenster in Stunden (lokale Zeit des Nutzers). */
    windowStartHour?: number
    windowEndHour?: number
  } = {},
): Map<string, Date> {
  const {
    startAt = new Date(),
    intervalHours = 8,
    windowStartHour = 9,
    windowEndHour = 21,
  } = options

  const sorted = [...clips].sort((a, b) => b.virality_score - a.virality_score)
  const times = new Map<string, Date>()

  const cursor = new Date(startAt)
  cursor.setMinutes(0, 0, 0)
  cursor.setHours(cursor.getHours() + 1)

  for (const clip of sorted) {
    // In die nächste erlaubte Tageszeit schieben — niemand will einen Post
    // um 4 Uhr morgens.
    while (cursor.getHours() < windowStartHour || cursor.getHours() >= windowEndHour) {
      if (cursor.getHours() >= windowEndHour) {
        cursor.setDate(cursor.getDate() + 1)
        cursor.setHours(windowStartHour)
      } else {
        cursor.setHours(windowStartHour)
      }
    }

    times.set(clip.id, new Date(cursor))
    cursor.setHours(cursor.getHours() + intervalHours)
  }

  return times
}
