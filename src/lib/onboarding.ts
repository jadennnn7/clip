import type { User } from '@supabase/supabase-js'

/**
 * Erst-Einrichtung nach dem ersten Login.
 *
 * Der Abschluss steht in den `user_metadata` des Supabase-Nutzers statt in
 * einer eigenen Spalte: Der Proxy holt den Nutzer ohnehin bei jedem Request
 * (`auth.getUser()`), die Weiche kostet damit keine zusätzliche Abfrage. Der
 * Nutzer kann das Feld selbst schreiben — für einen reinen Hinweis-Schalter
 * ist das richtig so, Rechte hängen daran keine.
 */
export const ONBOARDING_PATH = '/onboarding'
export const ONBOARDING_METADATA_KEY = 'onboarding_completed_at'

export function hasCompletedOnboarding(user: Pick<User, 'user_metadata'>): boolean {
  return typeof user.user_metadata?.[ONBOARDING_METADATA_KEY] === 'string'
}

/** Nur die App selbst wird umgeleitet — API, Auth und Landingpage bleiben frei. */
export function requiresOnboarding(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
}
