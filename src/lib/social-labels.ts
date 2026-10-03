import type { AutomationMode, SocialPlatform } from '@/types/database'

/**
 * Beschriftungen der Plattformen und Automatikstufen.
 *
 * Bewusst ein eigenes Modul ohne `'use client'`: Die Karten lagen vorher in
 * `AccountCard.tsx`, und das ist eine Client-Komponente. Importiert eine
 * Server-Komponente einen Wert aus einem Client-Modul, bekommt sie keine Daten,
 * sondern eine Client-Referenz — `PLATFORM_LABEL[platform]` ergab dort still
 * `undefined`. Die Kalenderseite zeigte deshalb „undefined · Score 94".
 *
 * Nachschlagetabellen dieser Art gehören auf keine Seite der Grenze, also
 * stehen sie hier.
 */
export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  youtube: 'YouTube Shorts',
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
}

/** Label je Modus — der Select zeigt sonst den rohen Enum-Wert an. */
export const AUTOMATION_LABEL: Record<AutomationMode, string> = {
  auto_publish: 'Vollautomatisch',
  review_queue: 'Freigabe-Queue',
  manual: 'Nur rendern',
}
