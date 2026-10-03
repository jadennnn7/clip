'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { SocialPlatform } from '@/types/database'
import { PLATFORM_LABEL } from '@/lib/social-labels'

const PLATFORMS: SocialPlatform[] = ['youtube', 'instagram', 'tiktok']

const OAUTH_ERRORS: Record<string, string> = {
  oauth_session_expired: 'Deine Clyp-Anmeldung fehlt oder ist abgelaufen. Melde dich auf dieser Adresse an und verbinde den Kanal erneut.',
  connection_failed: 'Die Kanalverbindung ist fehlgeschlagen. Bitte starte sie erneut.',
  token_exchange_failed: 'Die Plattform hat die Anmeldung nicht bestätigt. Bitte prüfe die OAuth-Zugangsdaten, die registrierte Callback-Adresse und den Zugriff deines Kontos auf die Plattform-App.',
  missing_permissions: 'Nicht alle nötigen Berechtigungen wurden freigegeben. Verbinde den Kanal erneut und bestätige alle Berechtigungen. Bei Instagram müssen sie außerdem in der Login-Konfiguration der Meta-App enthalten sein.',
  no_page_shared: 'Im Meta-Dialog wurde keine Facebook-Seite freigegeben. Verbinde erneut und wähle die Facebook-Seite aus, die mit deinem Instagram-Konto verknüpft ist.',
  no_linked_page: 'Die freigegebene Facebook-Seite hat kein verknüpftes Instagram-Business- oder Creator-Konto. Verknüpfe dein Instagram-Konto mit dieser Seite und verbinde erneut.',
  multiple_pages: 'Im Meta-Dialog waren mehrere Facebook-Seiten ausgewählt. Verbinde erneut und wähle genau die Seite, die mit deinem Instagram-Konto verknüpft ist.',
  account_lookup_failed: 'Die Anmeldung war erfolgreich, aber das Kanalprofil konnte nicht gelesen werden. Bitte prüfe die freigegebenen Berechtigungen.',
  connection_save_failed: 'Der Kanal wurde autorisiert, konnte aber nicht gespeichert werden. Bitte prüfe die Einrichtung der Datenbank.',
  setup_required: 'Die Plattform-Verbindung ist noch nicht vollständig eingerichtet.',
  channel_limit: 'Dein Tarif umfasst keine weiteren Kanäle. Trenne einen Kanal oder wechsle unter „Abo & Verbrauch“ in einen größeren Tarif.',
  missing_code: 'Die Plattform hat keinen Anmeldecode zurückgegeben. Bitte starte die Verbindung erneut.',
  access_denied: 'Die Verbindung wurde bei der Plattform abgebrochen.',
  oauth_denied: 'Die Verbindung wurde bei der Plattform abgebrochen.',
  invalid_state: 'Die Verbindungsanfrage ist abgelaufen. Bitte starte die Verbindung erneut.',
  oauth_failed: 'Der Kanal konnte nicht verbunden werden. Bitte versuche es erneut.',
  not_configured: 'Die Plattform-Verbindung ist noch nicht eingerichtet.',
  unauthorized: 'Bitte melde dich an und verbinde den Kanal danach erneut.',
}

/**
 * Meldet das Ergebnis des OAuth-Callbacks (`?connected=` / `?error=`) einmal
 * als Toast und räumt die Parameter aus der Adresse — sonst käme die Meldung
 * bei jedem Neuladen wieder.
 */
export function useOAuthCallbackToast(successDescription: string) {
  const handled = useRef(false)
  const description = useRef(successDescription)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const params = new URLSearchParams(window.location.search)
    const platform = params.get('connected') as SocialPlatform | null
    const callbackError = params.get('error')
    if (platform && PLATFORMS.includes(platform)) {
      toast.success(`${PLATFORM_LABEL[platform]} verbunden`, { description: description.current })
    } else if (callbackError) {
      const message = callbackError === 'oauth_origin_mismatch' ? originMismatchMessage() : OAUTH_ERRORS[callbackError]
      toast.error('Kanal nicht verbunden', { description: message ?? 'Die Verbindung konnte nicht abgeschlossen werden. Bitte versuche es erneut.', duration: 15000 })
    }
    if (platform || callbackError) {
      params.delete('connected')
      params.delete('error')
      const query = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
  }, [])
}

/**
 * Kanäle lassen sich nur über die Adresse verbinden, die bei YouTube, Meta und
 * TikTok als Rückkehr-Adresse eingetragen ist (`NEXT_PUBLIC_APP_URL`). Die
 * Adresse kommt aus der Konfiguration, nie aus der URL — sonst könnte ein
 * präparierter Link eine fremde Domain als „richtige“ Adresse anzeigen.
 */
function originMismatchMessage(): string {
  let host: string | null = null
  try { host = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : null } catch { /* ungültig */ }
  const where = host ? `über ${host}` : 'über die eingerichtete App-Adresse'
  const base = `Kanäle lassen sich nur ${where} verbinden. Öffne Clyp unter dieser Adresse, melde dich dort an und verbinde den Kanal erneut.`
  return process.env.NODE_ENV === 'development'
    ? `${base} Ist die Adresse nicht mehr erreichbar (etwa ein beendeter Tunnel), NEXT_PUBLIC_APP_URL in .env.local anpassen, die Rückkehr-Adressen bei den Plattformen nachtragen und den Dev-Server neu starten.`
    : base
}
