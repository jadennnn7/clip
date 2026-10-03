'use client'

import { deleteLocalVideo } from '@/lib/local-media'
import { storageKey, useWorkspaceStore } from '@/stores/workspace-store'

/** Wohin es nach der Löschung geht — dieselbe Seite, die Meta als Anleitung verlinkt. */
export const ACCOUNT_DELETED_PATH = '/konto-loeschen?geloescht=1'

/**
 * Löscht das angemeldete Konto endgültig und danach, was dieser Browser noch
 * davon hält: den Workspace im localStorage und die Videos in der IndexedDB.
 * Dann ein voller Seitenwechsel, wie beim Abmelden — im Speicher des Tabs
 * soll nichts vom Konto bleiben.
 *
 * Wirft mit einer lesbaren Meldung, wenn der Server abgelehnt hat — dann
 * besteht das Konto noch.
 */
export async function deleteAccount(email: string): Promise<void> {
  const response = await fetch('/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: email }),
    cache: 'no-store',
  }).catch(() => null)
  if (!response) throw new Error('Der Server ist gerade nicht erreichbar. Dein Konto besteht noch.')
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: unknown } | null
    throw new Error(typeof data?.error === 'string' ? data.error : 'Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut.')
  }

  const { owner, projects } = useWorkspaceStore.getState()
  await Promise.allSettled(projects.map((project) => deleteLocalVideo(project.id)))
  try {
    if (owner) localStorage.removeItem(storageKey(owner))
    sessionStorage.clear()
  } catch { /* Speicher gesperrt — dann liegt dort auch nichts */ }
  window.location.replace(ACCOUNT_DELETED_PATH)
}
