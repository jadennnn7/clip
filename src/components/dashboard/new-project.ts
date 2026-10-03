'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * „Neues Projekt" gibt es in der Sidebar und in der Befehlspalette, das
 * Importfeld aber nur auf der Übersicht.
 *
 * Auf der Übersicht selbst hilft der Anker allein nicht: Ein Client-Wechsel
 * auf denselben Pfad feuert kein `hashchange`, das Feld bekäme also beim
 * zweiten Klick keinen Fokus mehr. Deshalb dort ein eigenes Ereignis, von
 * anderen Seiten aus der Anker, den die `IntakeBar` beim Einhängen prüft.
 */
export const NEW_PROJECT_EVENT = 'omegaclip:new-project'
export const NEW_PROJECT_ANCHOR = 'neu'

export function useStartNewProject() {
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(() => {
    if (pathname === '/dashboard') window.dispatchEvent(new Event(NEW_PROJECT_EVENT))
    else router.push(`/dashboard#${NEW_PROJECT_ANCHOR}`)
  }, [pathname, router])
}
