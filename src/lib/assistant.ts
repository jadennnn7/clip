/**
 * Gemeinsame Typen des Hilfe-Assistenten — ohne `'use client'` und ohne
 * `server-only`, weil Widget und Route beide darauf zugreifen.
 */

/** Die einzigen Ziele, auf die der Assistent verlinken darf. */
export const ASSISTANT_LINKS = {
  '/dashboard': 'Übersicht',
  '/dashboard/clips': 'Clip-Bibliothek',
  '/dashboard/brand': 'Brand-Kits',
  '/dashboard/calendar': 'Kalender',
  '/dashboard/connections': 'Kanäle',
  '/dashboard/billing': 'Abo & Verbrauch',
} as const

export type AssistantLink = keyof typeof ASSISTANT_LINKS

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
  links?: AssistantLink[]
  /** Der Assistent kann nicht helfen — das Widget bietet die Nachricht an das Team an. */
  handoff?: boolean
}

/** So viel Verlauf geht an das Modell — genug für Rückfragen, nicht mehr. */
export const ASSISTANT_HISTORY_LIMIT = 10
export const ASSISTANT_MESSAGE_MAX_LENGTH = 1000
