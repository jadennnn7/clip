'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

/** Auf dem Server ist die Einstellung unbekannt — dort gilt „keine Reduktion". */
function getServerSnapshot() {
  return false
}

/**
 * Systemeinstellung „Bewegung reduzieren".
 *
 * Über `useSyncExternalStore` statt über einen Effekt mit setState: Der Wert
 * kommt von außerhalb React, und der Server kennt ihn nicht. Genau dafür ist
 * das Primitive gebaut — es rendert Server und Hydration mit dem
 * Server-Snapshot und wechselt erst danach auf den echten Wert.
 *
 * Der Rückgabewert ist ein Boolean und damit referenzstabil; ein Objekt würde
 * hier eine Endlosschleife erzeugen.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
