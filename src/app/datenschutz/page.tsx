import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/legal/LegalPage'
import { OPERATOR, PRIVACY_UPDATED } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung — Clyp',
  description: 'Welche Daten Clyp verarbeitet, wofür, bei welchen Dienstleistern — und welche Rechte du hast.',
}

/**
 * Datenschutzerklärung nach Art. 13 DSGVO.
 *
 * Nennt nur Dienste, die der Code tatsächlich anspricht. Kommt ein Dienst
 * dazu oder fällt einer weg (siehe `.env.example`), gehört er hier nach —
 * und `PRIVACY_UPDATED` in `lib/legal.ts` auf das neue Datum.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Datenschutzerklärung"
      intro={
        <>
          <p>
            Hier steht, welche Daten Clyp verarbeitet, wofür, bei welchen Dienstleistern und welche Rechte du hast. Kurz:
            Wir verarbeiten nur, was Clyp zum Funktionieren braucht. Es gibt kein Tracking, keine Werbung und keine
            Analyse-Tools.
          </p>
          <p className="mt-2 text-sm">Stand: {PRIVACY_UPDATED}</p>
        </>
      }
    >
      <LegalSection title="Verantwortlicher">
        <p>
          {OPERATOR.name}
          <br />
          {OPERATOR.street}, {OPERATOR.city}, {OPERATOR.country}
          <br />
          E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        </p>
        <p>
          Weitere Angaben stehen im <Link href="/impressum">Impressum</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Aufruf der Website">
        <p>
          Clyp wird bei Vercel Inc. (USA) gehostet. Beim Aufruf jeder Seite verarbeitet Vercel technisch nötige Daten:
          IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse sowie Browser und Betriebssystem. Ohne diese Daten lässt
          sich die Seite nicht ausliefern und nicht vor Angriffen schützen. Die Protokolle werden nur kurz gespeichert.
        </p>
        <p>Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).</p>
      </LegalSection>

      <LegalSection title="Konto und Anmeldung">
        <p>
          Für dein Konto speichern wir deine E-Mail-Adresse und, wenn du sie angibst, deinen Namen und ein Profilbild.
          Angemeldet wirst du über einen Link, den wir dir per E-Mail schicken. Konto und Datenbank liegen bei Supabase
          Inc. (USA); die Anmelde-E-Mails verschickt Supabase über einen E-Mail-Versanddienst.
        </p>
        <p>
          Rechtsgrundlage ist der Vertrag mit dir (Art. 6 Abs. 1 lit. b DSGVO). Ohne E-Mail-Adresse können wir kein Konto
          anlegen. Die Daten bleiben gespeichert, bis du dein Konto löschst.
        </p>
      </LegalSection>

      <LegalSection title="Videos, Transkripte und Clips">
        <p>
          Wenn du ein Video hochlädst oder einen Link einfügst, verarbeiten wir das Video, seinen Ton und das daraus
          erstellte Transkript, um Clips zu erzeugen. Dafür setzen wir diese Dienstleister ein:
        </p>
        <ul>
          <li>
            <strong>Cloudflare, Inc. (USA)</strong> speichert Videos, Vorschaubilder und fertige Clips. Für die
            Veröffentlichung auf Instagram und TikTok liegt ein fertiger Clip unter einer nicht verlinkten Adresse, von
            der die Plattform ihn abholt.
          </li>
          <li>
            <strong>Trigger.dev</strong> führt die Verarbeitung im Hintergrund aus: Herunterladen, Schneiden und Rendern
            der Clips.
          </li>
          <li>
            <strong>Deepgram, Inc. (USA)</strong> schreibt die Tonspur als Text mit.
          </li>
          <li>
            <strong>Google (Gemini API)</strong> wertet das Transkript aus: welche Momente sich eignen, Titel und Score.
            Ist Gemini nicht erreichbar, übernimmt <strong>Mistral AI (Frankreich)</strong>.
          </li>
          <li>
            Fügst du einen Link ein, lädt Clyp das Video von <strong>YouTube</strong> bzw. <strong>Google Drive</strong>{' '}
            herunter.
          </li>
        </ul>
        <p>
          Rechtsgrundlage ist der Vertrag mit dir (Art. 6 Abs. 1 lit. b DSGVO). Videos, Transkripte und Clips bleiben
          gespeichert, bis du sie oder dein Konto löschst. Lade nur Videos hoch, an denen du die Rechte hast. Sind darin
          andere Personen zu sehen oder zu hören, bist du dafür verantwortlich, dass du sie verwenden darfst.
        </p>
      </LegalSection>

      <LegalSection title="Verbundene Kanäle: YouTube, Instagram, TikTok">
        <p>
          Verbindest du einen Kanal, erhalten wir von der Plattform einen Zugangsschlüssel und Basisdaten des Kanals
          (Name, Bild, Kennung). Den Schlüssel speichern wir verschlüsselt. Damit veröffentlichen wir Clips in deinem
          Auftrag und lesen Kennzahlen deiner veröffentlichten Clips, etwa Aufrufe.
        </p>
        <ul>
          <li>YouTube: Google Ireland Limited (Irland)</li>
          <li>Instagram: Meta Platforms Ireland Limited (Irland), angebunden über Facebook Login</li>
          <li>TikTok: TikTok Technology Limited (Irland)</li>
        </ul>
        <p>
          Für die veröffentlichten Clips gelten ab dann zusätzlich die Datenschutzbestimmungen der jeweiligen Plattform.
          Rechtsgrundlage ist der Vertrag mit dir (Art. 6 Abs. 1 lit. b DSGVO). Du kannst einen Kanal in Clyp unter
          „Kanäle“ jederzeit trennen; der Zugangsschlüssel wird dann gelöscht.
        </p>
      </LegalSection>

      <LegalSection title="Bezahlung">
        <p>
          Abos und Credit-Pakete wickelt Stripe Payments Europe, Ltd. (Irland) ab. Deine Zahlungsdaten gibst du direkt
          bei Stripe ein; wir erhalten sie nicht, nur den Zahlungsstatus und die Angaben für die Rechnung.
        </p>
        <p>
          Rechtsgrundlage ist der Vertrag mit dir (Art. 6 Abs. 1 lit. b DSGVO). Rechnungen und Zahlungsbelege bewahren
          wir so lange auf, wie Steuer- und Handelsrecht es verlangen, in der Regel bis zu zehn Jahre (Art. 6 Abs. 1
          lit. c DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="Hilfe-Assistent">
        <p>
          Stellst du dem Assistenten in der App eine Frage, geht sie zusammen mit der Seite, auf der du gerade bist, an
          Google (Gemini API) oder ersatzweise an Mistral AI, damit eine Antwort entsteht. Gib dort keine sensiblen Daten
          ein. Rechtsgrundlage ist der Vertrag mit dir (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="Cookies und Speicher im Browser">
        <p>
          Clyp setzt nur technisch notwendige Cookies: die Anmelde-Cookies von Supabase, damit du angemeldet bleibst.
          Außerdem speichert dein Browser deinen Arbeitsstand und hochgeladene Videos lokal auf deinem Gerät
          (localStorage und IndexedDB). Das ist für den Dienst unbedingt nötig (§ 25 Abs. 2 Nr. 2 TDDDG); eine
          Einwilligung braucht es dafür nicht. Tracking-, Analyse- oder Werbe-Cookies setzen wir nicht.
        </p>
      </LegalSection>

      <LegalSection title="Schriften und Bilder von Dritten">
        <p>
          Im Editor und in der Clip-Vorschau lädt dein Browser die Schriften der Untertitel-Vorlagen von Google Fonts
          (Google). Auf einigen Seiten, etwa der Startseite und der Anmeldung, lädt er Beispielbilder von Unsplash. Dabei
          erfahren Google bzw. Unsplash deine IP-Adresse. Rechtsgrundlage ist unser berechtigtes Interesse an einer
          einheitlichen Darstellung (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="Kontakt per E-Mail">
        <p>
          Schreibst du uns, verarbeiten wir deine Nachricht und deine Kontaktdaten, um dir zu antworten (Art. 6 Abs. 1
          lit. b oder f DSGVO). Wir löschen sie, wenn die Anfrage erledigt ist und keine Aufbewahrungspflicht besteht.
        </p>
      </LegalSection>

      <LegalSection title="Übermittlung in Drittländer">
        <p>
          Einige Dienstleister sitzen in den USA. Die Übermittlung dorthin stützt sich auf einen Angemessenheitsbeschluss
          der EU-Kommission (EU-US Data Privacy Framework), soweit der Anbieter danach zertifiziert ist, und sonst auf die
          Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="Automatisierte Bewertung">
        <p>
          Der Score bewertet Clips, nicht dich. Es gibt keine automatisierte Entscheidung, die dir gegenüber rechtliche
          Wirkung entfaltet (Art. 22 DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="Deine Rechte">
        <p>Du hast gegenüber uns das Recht auf</p>
        <ul>
          <li>Auskunft über deine Daten (Art. 15 DSGVO),</li>
          <li>Berichtigung (Art. 16 DSGVO) und Löschung (Art. 17 DSGVO),</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO),</li>
          <li>
            Widerspruch gegen Verarbeitungen, die auf berechtigtem Interesse beruhen (Art. 21 DSGVO), sowie den Widerruf
            einer Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO).
          </li>
        </ul>
        <p>
          Schreib uns dazu an <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. Dein Konto mit allen Daten
          kannst du auch selbst löschen — wie das geht, steht unter <Link href="/konto-loeschen">Konto löschen</Link>.
        </p>
        <p>
          Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), etwa bei der
          Behörde deines Bundeslandes.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
