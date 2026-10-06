/**
 * Wer Ocuris betreibt — für Impressum (`/impressum`) und Datenschutzerklärung
 * (`/datenschutz`), an genau einer Stelle.
 *
 * Werte in eckigen Klammern sind Platzhalter. Vor dem Livegang ersetzen:
 * `npm run prod:check` bricht ab, solange noch einer drinsteht.
 */
export const OPERATOR = {
  /** Vor- und Nachname — bei einer Firma der volle Name mit Rechtsform, z. B. „Ocuris UG (haftungsbeschränkt)“. */
  name: 'Jaden Tomic',
  /** Nur bei einer Firma, z. B. „Geschäftsführer: Max Mustermann“ — sonst `null`. */
  representative: null as string | null,
  /** Ladungsfähige Anschrift; ein Postfach genügt nicht. */
  street: 'Salzstraße 11',
  city: '90763 Fürth',
  country: 'Deutschland',
  email: 'info@ocuris.app',
  phone: '175445526',
  /** Umsatzsteuer-Identifikationsnummer nach § 27a UStG, falls vorhanden — sonst `null`. */
  vatId: null as string | null,
  /** Nur bei Eintragung, z. B. „Amtsgericht Berlin, HRB 123456“ — sonst `null`. */
  register: null as string | null,
}

/** Stand der Datenschutzerklärung; bei jeder inhaltlichen Änderung anpassen. */
export const PRIVACY_UPDATED = '6. Oktober 2026'

/** Felder von `OPERATOR`, die noch Platzhalter sind. */
export function legalPlaceholders(): string[] {
  return Object.entries(OPERATOR)
    .filter(([, value]) => typeof value === 'string' && /^\[.*\]$/.test(value))
    .map(([key]) => key)
}
