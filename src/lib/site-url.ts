/**
 * Die öffentliche Adresse der App — Basis für absolute Links in Sitemap,
 * robots.txt und den Vorschaubildern geteilter Links. Ob sie für Produktion
 * taugt (kein Tunnel, kein localhost), prüft `npm run prod:check`.
 */
export function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
  } catch {
    return new URL('http://localhost:3000')
  }
}
