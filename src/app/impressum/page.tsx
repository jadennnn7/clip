import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/legal/LegalPage'
import { OPERATOR } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Impressum — Ocuris',
  description: 'Anbieterkennzeichnung von Ocuris nach § 5 DDG.',
}

/**
 * Impressum nach § 5 Digitale-Dienste-Gesetz (früher § 5 TMG). Die Angaben
 * kommen aus `OPERATOR` in `lib/legal.ts`.
 */
export default function ImprintPage() {
  return (
    <LegalPage title="Impressum">
      <LegalSection title="Angaben gemäß § 5 DDG">
        <p>
          {OPERATOR.name}
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.city}
          <br />
          {OPERATOR.country}
        </p>
        {OPERATOR.representative ? <p>Vertreten durch: {OPERATOR.representative}</p> : null}
        {OPERATOR.register ? <p>Registereintrag: {OPERATOR.register}</p> : null}
      </LegalSection>

      <LegalSection title="Kontakt">
        <p>
          Telefon: {OPERATOR.phone}
          <br />
          E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        </p>
      </LegalSection>

      {OPERATOR.vatId ? (
        <LegalSection title="Umsatzsteuer">
          <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: {OPERATOR.vatId}</p>
        </LegalSection>
      ) : null}

      <LegalSection title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <p>
          {OPERATOR.name}
          <br />
          {OPERATOR.street}, {OPERATOR.city}
        </p>
      </LegalSection>

      <LegalSection title="Verbraucherstreitbeilegung">
        <p>
          Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
