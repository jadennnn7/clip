/**
 * Eingeklappt oder nicht — unter einem Namen in localStorage und Cookie.
 *
 * localStorage hält mehrere Tabs im Gleichschritt, das Cookie liest der
 * Server: Ohne es rendert er die Leiste immer eingeklappt, und wer sie
 * ausgeklappt nutzt, sah sie nach jedem Neuladen erst aufspringen.
 *
 * Eine eigene Datei, weil Werte aus `'use client'`-Modulen auf dem Server
 * nur als Client-Referenz ankommen.
 */
export const SIDEBAR_STATE_KEY = 'omegaclip-sidebar'

/** Ohne gespeicherten Wert: eingeklappt — mehr Platz für den Inhalt. */
export function isSidebarCollapsed(stored: string | null | undefined) {
  return stored ? stored === 'collapsed' : true
}
