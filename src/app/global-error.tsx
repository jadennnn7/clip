'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/report-error'

/**
 * Fehler im Root-Layout selbst. Diese Seite ersetzt das ganze Dokument — ohne
 * globale Styles, Schriften und Theme —, deshalb stehen die Farben hier inline
 * und folgen dem Farbschema des Systems.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { reportError(error) }, [error])
  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', colorScheme: 'light dark' }}>
        <title>Fehler — Ocuris</title>
        <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 14, color: '#1670d6' }}>Fehler</p>
          <h1 style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>Ocuris konnte nicht geladen werden</h1>
          <p style={{ margin: '12px 0 0', maxWidth: 420, fontSize: 14, lineHeight: 1.6, opacity: 0.7 }}>
            Versuch es gleich noch einmal. Bleibt der Fehler, nenne dem Support die Fehler-ID.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 32, padding: '8px 16px', borderRadius: 10, border: 'none', background: '#1670d6', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            Erneut versuchen
          </button>
          {error.digest ? <p style={{ marginTop: 32, fontFamily: 'ui-monospace, monospace', fontSize: 11, opacity: 0.5 }}>Fehler-ID {error.digest}</p> : null}
        </main>
      </body>
    </html>
  )
}
