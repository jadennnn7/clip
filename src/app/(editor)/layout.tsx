import React from 'react'

/**
 * Eigenes Layout für den Editor.
 *
 * Zwei Gründe, warum der Editor nicht im Dashboard-Layout bleibt:
 *
 * 1. **Dauerhaft dunkel.** Jedes professionelle Schnittprogramm ist dunkel —
 *    Premiere, Resolve, CapCut. Das hat einen sachlichen Grund: Eine helle
 *    Oberfläche um ein Videobild herum verschiebt die Wahrnehmung von dessen
 *    Helligkeit und Farbe. Genutzt werden ausschließlich die bereits
 *    definierten `.dark`-Tokens, kein neuer Farbwert.
 *
 * 2. **Volle Höhe.** Die App-Navigation kostete 56 px, die dem Schnittfenster
 *    fehlten. Ihre Funktionen — zurück zu den Projekten, Guthaben — sitzen
 *    jetzt in der Editor-Kopfzeile, die es ohnehin gab.
 *
 * Die Route-Gruppe ändert die URL nicht: `/dashboard/projects/[id]` bleibt
 * unverändert.
 */
export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark h-dvh overflow-hidden bg-background text-foreground">{children}</div>
  )
}
