'use client'

import { useCallback, useSyncExternalStore } from 'react'
import type { Layout } from 'react-resizable-panels'

/**
 * Merkt sich die Panel-Aufteilung des Editors über Reloads hinweg.
 *
 * react-resizable-panels v4 hat `autoSaveId` entfernt, also übernimmt das hier
 * `defaultLayout` + `onLayoutChanged`. Ein Editor, der bei jedem Reload sein
 * Layout vergisst, fühlt sich wie ein Spielzeug an.
 *
 * Gelesen wird über `useSyncExternalStore` statt über einen Effekt mit
 * setState: Auf dem Server gibt es keinen localStorage, und ein im ersten
 * Render abweichender Wert wäre ein Hydration-Mismatch. useSyncExternalStore
 * ist genau für diesen Fall gebaut — es rendert Server und Hydration mit dem
 * Server-Snapshot und wechselt erst danach auf den Client-Wert.
 */

/** Der Wert ändert sich nur, wenn diese Seite selbst schreibt. */
const NO_OP_SUBSCRIBE = () => () => {}

/**
 * Cache pro Schlüssel.
 *
 * `getSnapshot` MUSS bei unverändertem Speicher dieselbe Referenz liefern —
 * sonst hält React den Store für ständig verändert und rendert endlos.
 * Deshalb wird der zuletzt gelesene Rohstring mitgeführt und nur bei echter
 * Änderung neu geparst.
 */
const cache = new Map<string, { raw: string | null; value: Layout | undefined }>()

function readLayout(key: string): Layout | undefined {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    // Privater Modus oder blockierter Speicher — dann eben die Standardgrößen.
    raw = null
  }

  const cached = cache.get(key)
  if (cached && cached.raw === raw) return cached.value

  let value: Layout | undefined
  try {
    value = raw ? (JSON.parse(raw) as Layout) : undefined
  } catch {
    value = undefined
  }

  cache.set(key, { raw, value })
  return value
}

export function useStoredLayout(key: string) {
  const defaultLayout = useSyncExternalStore(
    NO_OP_SUBSCRIBE,
    () => readLayout(key),
    () => undefined,
  )

  const onLayoutChanged = useCallback(
    (next: Layout) => {
      try {
        const raw = JSON.stringify(next)
        window.localStorage.setItem(key, raw)
        cache.set(key, { raw, value: next })
      } catch {
        // siehe oben
      }
    },
    [key],
  )

  return { defaultLayout, onLayoutChanged }
}
