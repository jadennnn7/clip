/**
 * Der Editor ist vorübergehend abgeschaltet (2026-10-04, auf Wunsch).
 *
 * Der Code bleibt vollständig erhalten. Solange der Schalter aus ist:
 * - leitet `src/proxy.ts` jede Editor-Adresse um (`editorRedirect`),
 * - zeigen Übersicht, Bibliothek, Clip-Seiten und Analytics keine Knöpfe
 *   oder Menüpunkte, die in den Editor führen,
 * - fällt der Datei-Upload weg — eigene Dateien landen nur im Editor.
 *
 * Zurückholen: auf `true` setzen.
 */
export const EDITOR_ENABLED = false

/**
 * Wohin eine Editor-Adresse umleitet, solange der Editor aus ist — `null`
 * für alles andere.
 */
export function editorRedirect(pathname: string): string | null {
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return '/'
  if (pathname === '/dashboard/editor' || pathname.startsWith('/dashboard/editor/')) return '/dashboard'
  if (pathname.startsWith('/dashboard/projects/')) return '/dashboard/clips'
  return null
}
