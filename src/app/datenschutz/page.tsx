import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal/LegalPage'
import { OPERATOR, PRIVACY_UPDATED } from '@/lib/legal'
import { PARTNER, REFERRAL_COOKIE } from '@/lib/partner'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung — Ocuris',
  description: 'Datenschutzerklärung von Ocuris nach DSGVO und BDSG.',
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Datenschutzerklärung"
      containerClassName="max-w-3xl"
      intro={
        <>
          <p>
            Mit der folgenden Datenschutzerklärung möchten wir Sie darüber aufklären, welche Arten Ihrer
            personenbezogenen Daten wir zu welchen Zwecken und in welchem Umfang verarbeiten.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Stand: {PRIVACY_UPDATED}</p>
        </>
      }
    >
      <div className="privacy-content mt-8 space-y-6 text-[15px] leading-relaxed text-pretty [&_h2]:mt-12 [&_h2]:border-t [&_h2]:border-foreground/10 [&_h2]:pt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:scroll-mt-20 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:no-underline [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_strong]:text-foreground">
        
        {/* Präambel */}
        <section id="m716">
          <h2 id="m716">Präambel</h2>
          <p className="mt-3">
            Mit der folgenden Datenschutzerklärung möchten wir Sie darüber aufklären, welche Arten Ihrer
            personenbezogenen Daten (nachfolgend auch kurz als &quot;Daten&quot; bezeichnet) wir zu welchen Zwecken und
            in welchem Umfang verarbeiten. Die Datenschutzerklärung gilt für alle von uns durchgeführten Verarbeitungen
            personenbezogener Daten, sowohl im Rahmen der Erbringung unserer Leistungen als auch insbesondere auf
            unseren Webseiten, in mobilen Applikationen sowie innerhalb externer Onlinepräsenzen, wie z.&nbsp;B. unserer
            Social-Media-Profile (nachfolgend zusammenfassend bezeichnet als &quot;Onlineangebot&quot;).
          </p>
          <p className="mt-3">Die verwendeten Begriffe sind nicht geschlechtsspezifisch.</p>
          <p className="mt-3">Stand: {PRIVACY_UPDATED}</p>
        </section>

        {/* Inhaltsübersicht */}
        <section className="mt-10 rounded-2xl bg-muted/40 p-6 ring-1 ring-foreground/10">
          <h2 className="!mt-0 !border-t-0 !pt-0 text-lg font-semibold text-foreground">Inhaltsübersicht</h2>
          <ul className="index mt-4 grid grid-cols-1 gap-x-6 gap-y-2 !list-none !pl-0 text-sm sm:grid-cols-2">
            <li><a href="#m716" className="text-muted-foreground hover:text-foreground">Präambel</a></li>
            <li><a href="#m3" className="text-muted-foreground hover:text-foreground">Verantwortlicher</a></li>
            <li><a href="#mOverview" className="text-muted-foreground hover:text-foreground">Übersicht der Verarbeitungen</a></li>
            <li><a href="#m2427" className="text-muted-foreground hover:text-foreground">Maßgebliche Rechtsgrundlagen</a></li>
            <li><a href="#m27" className="text-muted-foreground hover:text-foreground">Sicherheitsmaßnahmen</a></li>
            <li><a href="#m25" className="text-muted-foreground hover:text-foreground">Übermittlung von Daten</a></li>
            <li><a href="#m24" className="text-muted-foreground hover:text-foreground">Internationale Datentransfers</a></li>
            <li><a href="#m12" className="text-muted-foreground hover:text-foreground">Datenspeicherung und Löschung</a></li>
            <li><a href="#m10" className="text-muted-foreground hover:text-foreground">Rechte der betroffenen Personen</a></li>
            <li><a href="#mPlatform" className="text-brand font-medium hover:text-brand/80">Plattform &amp; KI-Verarbeitung (Ocuris)</a></li>
            <li><a href="#m317" className="text-muted-foreground hover:text-foreground">Geschäftliche Leistungen</a></li>
            <li><a href="#m225" className="text-muted-foreground hover:text-foreground">Bereitstellung &amp; Webhosting</a></li>
            <li><a href="#m134" className="text-muted-foreground hover:text-foreground">Einsatz von Cookies</a></li>
            <li><a href="#m182" className="text-muted-foreground hover:text-foreground">Kontakt- und Anfrageverwaltung</a></li>
            <li><a href="#m17" className="text-muted-foreground hover:text-foreground">Newsletter &amp; Benachrichtigungen</a></li>
            <li><a href="#m264" className="text-muted-foreground hover:text-foreground">Onlinemarketing</a></li>
            <li><a href="#m135" className="text-muted-foreground hover:text-foreground">Affiliate-Programme &amp; Links</a></li>
            <li><a href="#m299" className="text-muted-foreground hover:text-foreground">Kundenrezensionen &amp; Feedback</a></li>
            <li><a href="#m136" className="text-muted-foreground hover:text-foreground">Präsenzen in sozialen Netzwerken</a></li>
            <li><a href="#m328" className="text-muted-foreground hover:text-foreground">Plug-ins &amp; eingebettete Inhalte</a></li>
            <li><a href="#m2324" className="text-muted-foreground hover:text-foreground">Hinweisgeberschutz</a></li>
            <li><a href="#m15" className="text-muted-foreground hover:text-foreground">Änderung und Aktualisierung</a></li>
            <li><a href="#m42" className="text-muted-foreground hover:text-foreground">Begriffsdefinitionen</a></li>
          </ul>
        </section>

        {/* Verantwortlicher */}
        <section id="m3">
          <h2 id="m3">Verantwortlicher</h2>
          <p className="mt-3">
            {OPERATOR.name}
            {OPERATOR.street ? (
              <>
                <br />
                {OPERATOR.street}
              </>
            ) : null}
            <br />
            {OPERATOR.city}, {OPERATOR.country}
          </p>
          <p className="mt-2">
            E-Mail-Adresse: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
          </p>
          <p className="mt-2">
            Weitere Angaben finden Sie in unserem <Link href="/impressum">Impressum</Link>.
          </p>
        </section>

        {/* Übersicht der Verarbeitungen */}
        <section id="mOverview">
          <h2 id="mOverview">Übersicht der Verarbeitungen</h2>
          <p className="mt-3">
            Die nachfolgende Übersicht fasst die Arten der verarbeiteten Daten und die Zwecke ihrer Verarbeitung
            zusammen und verweist auf die betroffenen Personen.
          </p>

          <h3>Arten der verarbeiteten Daten</h3>
          <ul className="mt-2">
            <li>Bestandsdaten.</li>
            <li>Beschäftigtendaten.</li>
            <li>Zahlungsdaten.</li>
            <li>Kontaktdaten.</li>
            <li>Inhaltsdaten.</li>
            <li>Vertragsdaten.</li>
            <li>Nutzungsdaten.</li>
            <li>Meta-, Kommunikations- und Verfahrensdaten.</li>
            <li>Protokolldaten.</li>
          </ul>

          <h3>Kategorien betroffener Personen</h3>
          <ul className="mt-2">
            <li>Leistungsempfänger und Auftraggeber.</li>
            <li>Beschäftigte.</li>
            <li>Interessenten.</li>
            <li>Kommunikationspartner.</li>
            <li>Nutzer.</li>
            <li>Geschäfts- und Vertragspartner.</li>
            <li>Dritte Personen.</li>
            <li>Hinweisgeber.</li>
          </ul>

          <h3>Zwecke der Verarbeitung</h3>
          <ul className="mt-2">
            <li>Erbringung vertraglicher Leistungen und Erfüllung vertraglicher Pflichten.</li>
            <li>Kommunikation.</li>
            <li>Sicherheitsmaßnahmen.</li>
            <li>Direktmarketing.</li>
            <li>Reichweitenmessung.</li>
            <li>Tracking.</li>
            <li>Büro- und Organisationsverfahren.</li>
            <li>Zielgruppenbildung.</li>
            <li>Affiliate-Nachverfolgung.</li>
            <li>Organisations- und Verwaltungsverfahren.</li>
            <li>Feedback.</li>
            <li>Marketing.</li>
            <li>Profile mit nutzerbezogenen Informationen.</li>
            <li>Bereitstellung unseres Onlineangebotes und Nutzerfreundlichkeit.</li>
            <li>Informationstechnische Infrastruktur.</li>
            <li>Hinweisgeberschutz.</li>
            <li>Öffentlichkeitsarbeit.</li>
            <li>Geschäftsprozesse und betriebswirtschaftliche Verfahren.</li>
          </ul>
        </section>

        {/* Maßgebliche Rechtsgrundlagen */}
        <section id="m2427">
          <h2 id="m2427">Maßgebliche Rechtsgrundlagen</h2>
          <p className="mt-3">
            <strong>Maßgebliche Rechtsgrundlagen nach der DSGVO: </strong>Im Folgenden erhalten Sie eine Übersicht
            der Rechtsgrundlagen der DSGVO, auf deren Basis wir personenbezogene Daten verarbeiten. Bitte nehmen Sie
            zur Kenntnis, dass neben den Regelungen der DSGVO nationale Datenschutzvorgaben in Ihrem bzw. unserem Wohn-
            oder Sitzland gelten können. Sollten ferner im Einzelfall speziellere Rechtsgrundlagen maßgeblich sein,
            teilen wir Ihnen diese in der Datenschutzerklärung mit.
          </p>
          <ul className="mt-3">
            <li>
              <strong>Einwilligung (Art. 6 Abs. 1 S. 1 lit. a) DSGVO)</strong> — Die betroffene Person hat ihre
              Einwilligung in die Verarbeitung der sie betreffenden personenbezogenen Daten für einen spezifischen
              Zweck oder mehrere bestimmte Zwecke gegeben.
            </li>
            <li>
              <strong>Vertragserfüllung und vorvertragliche Anfragen (Art. 6 Abs. 1 S. 1 lit. b) DSGVO)</strong> — Die
              Verarbeitung ist für die Erfüllung eines Vertrags, dessen Vertragspartei die betroffene Person ist, oder
              zur Durchführung vorvertraglicher Maßnahmen erforderlich, die auf Anfrage der betroffenen Person erfolgen.
            </li>
            <li>
              <strong>Rechtliche Verpflichtung (Art. 6 Abs. 1 S. 1 lit. c) DSGVO)</strong> — Die Verarbeitung ist zur
              Erfüllung einer rechtlichen Verpflichtung erforderlich, der der Verantwortliche unterliegt.
            </li>
            <li>
              <strong>Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO)</strong> — Die Verarbeitung ist zur
              Wahrung der berechtigten Interessen des Verantwortlichen oder eines Dritten notwendig, vorausgesetzt,
              dass die Interessen, Grundrechte und Grundfreiheiten der betroffenen Person, die den Schutz
              personenbezogener Daten verlangen, nicht überwiegen.
            </li>
          </ul>
          <p className="mt-3">
            <strong>Nationale Datenschutzregelungen in Deutschland: </strong>Zusätzlich zu den Datenschutzregelungen
            der DSGVO gelten nationale Regelungen zum Datenschutz in Deutschland. Hierzu gehört insbesondere das
            Bundesdatenschutzgesetz (BDSG). Das BDSG enthält insbesondere Spezialregelungen zum Recht auf Auskunft, zum
            Recht auf Löschung, zum Widerspruchsrecht, zur Verarbeitung besonderer Kategorien personenbezogener Daten,
            zur Verarbeitung für andere Zwecke und zur Übermittlung sowie automatisierten Entscheidungsfindung im
            Einzelfall einschließlich Profiling. Ferner können Landesdatenschutzgesetze der einzelnen Bundesländer zur
            Anwendung gelangen.
          </p>
          <p className="mt-3">
            <strong>Hinweis auf Geltung DSGVO und Schweizer DSG: </strong>Diese Datenschutzhinweise dienen sowohl der
            Informationserteilung nach dem Schweizer DSG als auch nach der Datenschutzgrundverordnung (DSGVO). Aus
            diesem Grund bitten wir Sie zu beachten, dass aufgrund der breiteren räumlichen Anwendung und
            Verständlichkeit die Begriffe der DSGVO verwendet werden. Insbesondere statt der im Schweizer DSG
            verwendeten Begriffe „Bearbeitung“ von „Personendaten“, „überwiegendes Interesse“ und „besonders
            schützenswerte Personendaten“ werden die in der DSGVO verwendeten Begriffe „Verarbeitung“ von
            „personenbezogenen Daten“ sowie „berechtigtes Interesse“ und „besondere Kategorien von Daten“ verwendet.
            Die gesetzliche Bedeutung der Begriffe wird jedoch im Rahmen der Geltung des Schweizer DSG weiterhin nach
            dem Schweizer DSG bestimmt.
          </p>
          <p className="mt-3">
            <strong>Geltung der Datenschutzvorgaben im Sitzland: </strong>In dem Land, in dem der Verantwortliche
            seinen Sitz hat, gelten neben der Datenschutz-Grundverordnung (DSGVO) auch nationale
            Datenschutzvorschriften.
          </p>
        </section>

        {/* Sicherheitsmaßnahmen */}
        <section id="m27">
          <h2 id="m27">Sicherheitsmaßnahmen</h2>
          <p className="mt-3">
            Wir treffen nach Maßgabe der gesetzlichen Vorgaben unter Berücksichtigung des Stands der Technik, der
            Implementierungskosten und der Art, des Umfangs, der Umstände und der Zwecke der Verarbeitung sowie der
            unterschiedlichen Eintrittswahrscheinlichkeiten und des Ausmaßes der Bedrohung der Rechte und Freiheiten
            natürlicher Personen geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes
            Schutzniveau zu gewährleisten.
          </p>
          <p className="mt-3">
            Zu den Maßnahmen gehören insbesondere die Sicherung der Vertraulichkeit, Integrität und Verfügbarkeit von
            Daten durch Kontrolle des physischen und elektronischen Zugangs zu den Daten als auch des sie betreffenden
            Zugriffs, der Eingabe, der Weitergabe, der Sicherung der Verfügbarkeit und ihrer Trennung. Des Weiteren haben
            wir Verfahren eingerichtet, die eine Wahrnehmung von Betroffenenrechten, die Löschung von Daten und
            Reaktionen auf die Gefährdung der Daten gewährleisten. Ferner berücksichtigen wir den Schutz
            personenbezogener Daten bereits bei der Entwicklung bzw. Auswahl von Hardware, Software sowie Verfahren
            entsprechend dem Prinzip des Datenschutzes, durch Technikgestaltung und durch datenschutzfreundliche
            Voreinstellungen.
          </p>
          <p className="mt-3">
            <strong>Sicherung von Online-Verbindungen durch TLS-/SSL-Verschlüsselungstechnologie (HTTPS): </strong>
            Um die Daten der Nutzer, die über unsere Online-Dienste übertragen werden, vor unerlaubten Zugriffen zu
            schützen, setzen wir auf die TLS-/SSL-Verschlüsselungstechnologie. Secure Sockets Layer (SSL) und Transport
            Layer Security (TLS) sind die Eckpfeiler der sicheren Datenübertragung im Internet. Diese Technologien
            verschlüsseln die Informationen, die zwischen der Website oder App und dem Browser des Nutzers (oder
            zwischen zwei Servern) übertragen werden, wodurch die Daten vor unbefugtem Zugriff geschützt sind. TLS, als
            die weiterentwickelte und sicherere Version von SSL, gewährleistet, dass alle Datenübertragungen den
            höchsten Sicherheitsstandards entsprechen.
          </p>
        </section>

        {/* Übermittlung von personenbezogenen Daten */}
        <section id="m25">
          <h2 id="m25">Übermittlung von personenbezogenen Daten</h2>
          <p className="mt-3">
            Im Rahmen unserer Verarbeitung von personenbezogenen Daten kommt es vor, dass diese an andere Stellen,
            Unternehmen, rechtlich selbstständige Organisationseinheiten oder Personen übermittelt beziehungsweise ihnen
            gegenüber offengelegt werden. Zu den Empfängern dieser Daten können z.&nbsp;B. mit IT-Aufgaben beauftragte
            Dienstleister gehören oder Anbieter von Diensten und Inhalten, die in eine Website eingebunden sind. In
            solchen Fällen beachten wir die gesetzlichen Vorgaben und schließen insbesondere entsprechende Verträge bzw.
            Vereinbarungen, die dem Schutz Ihrer Daten dienen, mit den Empfängern Ihrer Daten ab.
          </p>
        </section>

        {/* Internationale Datentransfers */}
        <section id="m24">
          <h2 id="m24">Internationale Datentransfers</h2>
          <p className="mt-3">
            <strong>Datenverarbeitung in Drittländern: </strong>Sofern wir Daten in ein Drittland (d.&nbsp;h. außerhalb
            der Europäischen Union (EU) oder des Europäischen Wirtschaftsraums (EWR)) übermitteln oder dies im Rahmen der
            Nutzung von Diensten Dritter oder der Offenlegung bzw. Übermittlung von Daten an andere Personen, Stellen
            oder Unternehmen geschieht, erfolgt dies stets im Einklang mit den gesetzlichen Vorgaben.
          </p>
          <p className="mt-3">
            Für Datenübermittlungen in die USA stützen wir uns vorrangig auf das Data Privacy Framework (DPF), welches
            durch einen Angemessenheitsbeschluss der EU-Kommission vom 10.07.2023 als sicherer Rechtsrahmen anerkannt
            wurde. Zusätzlich haben wir mit den jeweiligen Anbietern Standardvertragsklauseln abgeschlossen, die den
            Vorgaben der EU-Kommission entsprechen und vertragliche Verpflichtungen zum Schutz Ihrer Daten festlegen.
          </p>
          <p className="mt-3">
            Diese zweifache Absicherung gewährleistet einen umfassenden Schutz Ihrer Daten: Das DPF bildet die primäre
            Schutzebene, während die Standardvertragsklauseln als zusätzliche Sicherheit dienen. Sollten sich Änderungen
            im Rahmen des DPF ergeben, greifen die Standardvertragsklauseln als zuverlässige Rückfalloption ein. So
            stellen wir sicher, dass Ihre Daten auch bei etwaigen politischen oder rechtlichen Veränderungen stets
            angemessen geschützt bleiben.
          </p>
          <p className="mt-3">
            Bei den einzelnen Diensteanbietern informieren wir Sie darüber, ob sie nach dem DPF zertifiziert sind und
            ob Standardvertragsklauseln vorliegen. Weitere Informationen zum DPF und eine Liste der zertifizierten
            Unternehmen finden Sie auf der Website des US-Handelsministeriums unter{' '}
            <a href="https://www.dataprivacyframework.gov/" target="_blank" rel="noopener noreferrer">
              https://www.dataprivacyframework.gov/
            </a>.
          </p>
          <p className="mt-3">
            Für Datenübermittlungen in andere Drittländer gelten entsprechende Sicherheitsmaßnahmen, insbesondere
            Standardvertragsklauseln, ausdrückliche Einwilligungen oder gesetzlich erforderliche Übermittlungen.
          </p>
        </section>

        {/* Allgemeine Informationen zur Datenspeicherung und Löschung */}
        <section id="m12">
          <h2 id="m12">Allgemeine Informationen zur Datenspeicherung und Löschung</h2>
          <p className="mt-3">
            Wir löschen personenbezogene Daten, die wir verarbeiten, gemäß den gesetzlichen Bestimmungen, sobald die
            zugrundeliegenden Einwilligungen widerrufen werden oder keine weiteren rechtlichen Grundlagen für die
            Verarbeitung bestehen. Dies betrifft Fälle, in denen der ursprüngliche Verarbeitungszweck entfällt oder die
            Daten nicht mehr benötigt werden. Ausnahmen von dieser Regelung bestehen, wenn gesetzliche Pflichten oder
            besondere Interessen eine längere Aufbewahrung oder Archivierung der Daten erfordern.
          </p>
          <p className="mt-3">
            Insbesondere müssen Daten, die aus handels- oder steuerrechtlichen Gründen aufbewahrt werden müssen oder
            deren Speicherung notwendig ist zur Rechtsverfolgung oder zum Schutz der Rechte anderer natürlicher oder
            juristischer Personen, entsprechend archiviert werden.
          </p>
          <p className="mt-3">
            Fristbeginn mit Ablauf des Jahres: Beginnt eine Frist nicht ausdrücklich zu einem bestimmten Datum und
            beträgt sie mindestens ein Jahr, so startet sie automatisch am Ende des Kalenderjahres, in dem das
            fristauslösende Ereignis eingetreten ist. Im Fall laufender Vertragsverhältnisse, in deren Rahmen Daten
            gespeichert werden, ist das fristauslösende Ereignis der Zeitpunkt des Wirksamwerdens der Kündigung oder
            sonstige Beendigung des Rechtsverhältnisses.
          </p>
        </section>

        {/* Rechte der betroffenen Personen */}
        <section id="m10">
          <h2 id="m10">Rechte der betroffenen Personen</h2>
          <p className="mt-3">
            Ihnen stehen als Betroffene nach der DSGVO verschiedene Rechte zu, die sich insbesondere aus Art. 15 bis 21
            DSGVO ergeben:
          </p>
          <ul className="mt-3 space-y-2">
            <li>
              <strong>
                Widerspruchsrecht: Sie haben das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben,
                jederzeit gegen die Verarbeitung der Sie betreffenden personenbezogenen Daten, die aufgrund von Art. 6
                Abs. 1 lit. e oder f DSGVO erfolgt, Widerspruch einzulegen; dies gilt auch für ein auf diese
                Bestimmungen gestütztes Profiling. Werden die Sie betreffenden personenbezogenen Daten verarbeitet, um
                Direktwerbung zu betreiben, haben Sie das Recht, jederzeit Widerspruch gegen die Verarbeitung der Sie
                betreffenden personenbezogenen Daten zum Zwecke derartiger Werbung einzulegen.
              </strong>
            </li>
            <li>
              <strong>Widerrufsrecht bei Einwilligungen:</strong> Sie haben das Recht, erteilte Einwilligungen jederzeit
              zu widerrufen.
            </li>
            <li>
              <strong>Auskunftsrecht:</strong> Sie haben das Recht, eine Bestätigung darüber zu verlangen, ob betreffende
              Daten verarbeitet werden und auf Auskunft über diese Daten sowie auf weitere Informationen und Kopie der
              Daten entsprechend den gesetzlichen Vorgaben.
            </li>
            <li>
              <strong>Recht auf Berichtigung:</strong> Sie haben entsprechend den gesetzlichen Vorgaben das Recht, die
              Vervollständigung der Sie betreffenden Daten oder die Berichtigung der Sie betreffenden unrichtigen Daten zu
              verlangen.
            </li>
            <li>
              <strong>Recht auf Löschung und Einschränkung der Verarbeitung:</strong> Sie haben nach Maßgabe der
              gesetzlichen Vorgaben das Recht, zu verlangen, dass Sie betreffende Daten unverzüglich gelöscht werden,
              bzw. alternativ eine Einschränkung der Verarbeitung der Daten zu verlangen.
            </li>
            <li>
              <strong>Recht auf Datenübertragbarkeit:</strong> Sie haben das Recht, Sie betreffende Daten, die Sie uns
              bereitgestellt haben, nach Maßgabe der gesetzlichen Vorgaben in einem strukturierten, gängigen und
              maschinenlesbaren Format zu erhalten oder deren Übermittlung an einen anderen Verantwortlichen zu fordern.
            </li>
            <li>
              <strong>Beschwerde bei Aufsichtsbehörde:</strong> Unbeschadet eines anderweitigen verwaltungsrechtlichen
              oder gerichtlichen Rechtsbehelfs haben Sie das Recht auf Beschwerde bei einer Datenschutzaufsichtsbehörde,
              wenn Sie der Ansicht sind, dass die Verarbeitung Ihrer personenbezogenen Daten gegen die DSGVO verstößt.
            </li>
          </ul>
        </section>

        {/* Ocuris spezifische Video-, Audio- & KI-Dienste */}
        <section id="mPlatform" className="rounded-2xl border border-brand/20 bg-brand/[0.03] p-6">
          <h2 id="mPlatform" className="!mt-0 !border-t-0 !pt-0 text-brand">
            Spezifische Verarbeitungen der Ocuris-Plattform (Video-, Audio- und KI-Verarbeitung)
          </h2>
          <p className="mt-3">
            Zur Bereitstellung unserer Kernfunktion — der automatisierten Erstellung von Kurzvideos aus Langform-Material —
            setzen wir spezialisierte technische Dienstleister ein. Rechtsgrundlage für diese Verarbeitungen ist Art. 6
            Abs. 1 lit. b DSGVO (Vertragserfüllung zur Bereitstellung der Videoschnitte):
          </p>
          <ul className="mt-3 space-y-2">
            <li>
              <strong>Cloudflare, Inc. (USA / R2 Storage):</strong> Speicherung von hochgeladenen Videos, temporären
              Verarbeitungsdaten, Vorschaubildern und fertigen Video-Clips. Cloudflare ist unter dem Data Privacy Framework
              zertifiziert.
            </li>
            <li>
              <strong>Trigger.dev (Trigger.dev Inc., USA):</strong> Hintergrundverarbeitung und Orchestrierung der
              Schnitt-, Rendering- und Download-Prozesse.
            </li>
            <li>
              <strong>Deepgram, Inc. (USA):</strong> Audio-Transkription und Worterkennung zur sekundengenauen Untertitelung
              und Erkennung von Sprecherwechseln.
            </li>
            <li>
              <strong>Google Ireland Limited / Google LLC (Gemini API):</strong> Analyse der Transkripte zur Identifikation
              von Kernaussagen, Hooks und Bewertungs-Scores. Ist die API nicht erreichbar, greift als Ausfalloption Mistral AI
              (Frankreich, EU).
            </li>
            <li>
              <strong>Stripe Payments Europe, Ltd. (Irland):</strong> Zahlungsabwicklung für Abonnements und Guthaben-Pakete.
              Wir selbst speichern keine Zahlungsdaten wie Kreditkartennummern.
            </li>
            <li>
              <strong>Social-Media-Schnittstellen (YouTube, TikTok, Instagram):</strong> Wenn Sie Ihre Social-Media-Kanäle
              verbinden, speichern wir die von den Plattformen ausgestellten OAuth-Zugriffstoken in einem getrennten,
              gesicherten Datenbankschema zur automatischen Veröffentlichung Ihrer freigegebenen Clips. Sie können Kanäle
              jederzeit trennen, wodurch die Zugriffstoken sofort unwiderruflich gelöscht werden.
            </li>
            <li>
              <strong>Selbstständige Kontolöschung nach Art. 17 DSGVO:</strong> Sie können Ihr Konto samt allen Projekten,
              Clips, Dateien und hinterlegten Tokens jederzeit eigenständig unter{' '}
              <Link href="/konto-loeschen" className="underline hover:no-underline">
                Konto löschen
              </Link>{' '}
              vollständig entfernen.
            </li>
          </ul>
        </section>

        {/* Geschäftliche Leistungen */}
        <section id="m317">
          <h2 id="m317">Geschäftliche Leistungen</h2>
          <p className="mt-3">
            Wir verarbeiten personenbezogene Daten unserer Vertrags- und Geschäftspartner, etwa Kunden, Auftraggeber,
            Interessenten, Lieferanten und sonstige Kooperationspartner (zusammenfassend „Vertragspartner“), zur
            Anbahnung, Durchführung und Abwicklung von Vertragsverhältnissen sowie vergleichbaren Rechtsverhältnissen.
            Dies umfasst auch vorvertragliche Maßnahmen, die auf Anfrage erfolgen, sowie die Kommunikation im
            Zusammenhang mit dem jeweiligen Vertragsverhältnis.
          </p>
          <p className="mt-3">
            Die Verarbeitung dient insbesondere der Erfüllung unserer vertraglichen Haupt- und Nebenpflichten. Hierzu
            zählen die Erbringung der vereinbarten Leistungen, etwaige Aktualisierungs- und Informationspflichten, die
            Bearbeitung von Gewährleistungs- und sonstigen Leistungsstörungen, die Abwicklung von Widerrufen, Kündigungen
            von Dauerschuldverhältnissen, Rückabwicklungen, Erstattungen sowie die Bearbeitung sonstiger vertragsbezogener
            Erklärungen und Anfragen.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Verarbeitete Datenarten:</strong> Bestandsdaten; Zahlungsdaten; Kontaktdaten; Vertragsdaten.</li>
            <li><strong>Betroffene Personen:</strong> Leistungsempfänger und Auftraggeber; Interessenten; Geschäfts- und Vertragspartner.</li>
            <li><strong>Zwecke der Verarbeitung:</strong> Erbringung vertraglicher Leistungen und Erfüllung vertraglicher Pflichten; Kommunikation; Büro- und Organisationsverfahren.</li>
            <li><strong>Rechtsgrundlagen:</strong> Vertragserfüllung und vorvertragliche Anfragen (Art. 6 Abs. 1 S. 1 lit. b) DSGVO); Rechtliche Verpflichtung (Art. 6 Abs. 1 S. 1 lit. c) DSGVO); Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO).</li>
          </ul>
        </section>

        {/* Bereitstellung des Onlineangebots und Webhosting */}
        <section id="m225">
          <h2 id="m225">Bereitstellung des Onlineangebots und Webhosting</h2>
          <p className="mt-3">
            Wir verarbeiten die Daten der Nutzer, um ihnen unsere Online-Dienste zur Verfügung stellen zu können. Zu
            diesem Zweck verarbeiten wir die IP-Adresse des Nutzers, die notwendig ist, um die Inhalte und Funktionen
            unserer Online-Dienste an den Browser oder das Endgerät der Nutzer zu übermitteln.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Verarbeitete Datenarten:</strong> Nutzungsdaten; Meta-, Kommunikations- und Verfahrensdaten; Protokolldaten.</li>
            <li><strong>Betroffene Personen:</strong> Nutzer (Webseitenbesucher, Nutzer von Onlinediensten).</li>
            <li><strong>Zwecke der Verarbeitung:</strong> Bereitstellung unseres Onlineangebotes und Nutzerfreundlichkeit; Informationstechnische Infrastruktur; Sicherheitsmaßnahmen.</li>
            <li><strong>Rechtsgrundlagen:</strong> Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO).</li>
          </ul>
          <p className="mt-3">
            <strong>Erhebung von Zugriffsdaten und Logfiles: </strong>Der Zugriff auf unser Onlineangebot wird in Form
            von sogenannten &quot;Server-Logfiles&quot; protokolliert. Zu den Serverlogfiles können die Adresse und der
            Name der abgerufenen Webseiten und Dateien, Datum und Uhrzeit des Abrufs, übertragene Datenmengen, Meldung
            über erfolgreichen Abruf, Browsertyp nebst Version, das Betriebssystem des Nutzers, Referrer URL und IP-Adressen
            gehören. Logfile-Informationen werden für die Dauer von maximal 30 Tagen gespeichert und danach gelöscht
            oder anonymisiert.
          </p>
        </section>

        {/* Einsatz von Cookies */}
        <section id="m134">
          <h2 id="m134">Einsatz von Cookies</h2>
          <p className="mt-3">
            Unter dem Begriff „Cookies“ werden Funktionen, die Informationen auf Endgeräten der Nutzer speichern und aus
            ihnen auslesen, verstanden. Cookies können in Bezug auf unterschiedliche Anliegen Einsatz finden, etwa zu
            Zwecken der Funktionsfähigkeit, der Sicherheit und des Komforts von Onlineangeboten sowie der Erstellung von
            Analysen der Besucherströme. Wir verwenden Cookies gemäß den gesetzlichen Vorschriften.
          </p>
          <ul className="mt-3 space-y-1">
            <li>
              <strong>Temporäre Cookies (Session-Cookies):</strong> Werden spätestens gelöscht, nachdem ein Nutzer ein
              Onlineangebot verlassen und sein Endgerät bzw. Browser geschlossen hat.
            </li>
            <li>
              <strong>Permanente Cookies:</strong> Bleiben auch nach dem Schließen des Endgeräts gespeichert (z.&nbsp;B.
              zur Aufrechterhaltung des Login-Status).
            </li>
          </ul>
          <p className="mt-3">
            <strong>Rechtsgrundlagen: </strong>Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO) für technisch
            notwendige Cookies bzw. Einwilligung (Art. 6 Abs. 1 S. 1 lit. a) DSGVO), sofern eine Einwilligung abgefragt wird.
          </p>
        </section>

        {/* Kontakt- und Anfrageverwaltung */}
        <section id="m182">
          <h2 id="m182">Kontakt- und Anfrageverwaltung</h2>
          <p className="mt-3">
            Bei der Kontaktaufnahme mit uns (z.&nbsp;B. per E-Mail, Kontaktformular oder soziale Medien) werden die
            Angaben der anfragenden Personen verarbeitet, soweit dies zur Beantwortung der Kontaktanfragen und etwaiger
            angefragter Maßnahmen erforderlich ist.
          </p>
          <p className="mt-3">
            <strong>Nachricht an das Team aus dem Hilfe-Fenster: </strong>Schreiben Sie uns über das Hilfe-Fenster in der
            App, speichern wir Ihre Nachricht zusammen mit der E-Mail-Adresse Ihres Kontos, der Seite, auf der Sie waren,
            und – wenn Sie das Häkchen gesetzt lassen – dem bisherigen Chatverlauf mit dem KI-Assistenten. Wir leiten die
            Nachricht per E-Mail an unser Support-Postfach weiter; für den Versand nutzen wir den Dienst Resend (Resend,
            Inc., USA). Die Anfrage löschen wir mit Ihrem Konto, spätestens wenn sie erledigt ist und keine
            Aufbewahrungspflicht mehr besteht.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Verarbeitete Datenarten:</strong> Kontaktdaten, Inhaltsdaten, Meta- und Kommunikationsdaten.</li>
            <li><strong>Betroffene Personen:</strong> Kommunikationspartner.</li>
            <li><strong>Rechtsgrundlagen:</strong> Vertragserfüllung und vorvertragliche Anfragen (Art. 6 Abs. 1 S. 1 lit. b) DSGVO), Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO).</li>
          </ul>
        </section>

        {/* Newsletter und elektronische Benachrichtigungen */}
        <section id="m17">
          <h2 id="m17">Newsletter und elektronische Benachrichtigungen</h2>
          <p className="mt-3">
            Wir versenden Newsletter, E-Mails und weitere elektronische Benachrichtigungen ausschließlich mit der
            Einwilligung der Empfänger oder aufgrund einer gesetzlichen Grundlage. Für die Anmeldung zu unserem
            Newsletter ist die Angabe Ihrer E-Mail-Adresse ausreichend.
          </p>
          <p className="mt-3">
            <strong>Widerspruchsmöglichkeit (Opt-Out): </strong>Sie können den Empfang unseres Newsletters jederzeit
            kündigen, d.&nbsp;h. Ihre Einwilligungen widerrufen bzw. dem weiteren Empfang widersprechen. Einen Link zur
            Kündigung finden Sie am Ende eines jeden Newsletters.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Verarbeitete Datenarten:</strong> Bestandsdaten, Kontaktdaten, Nutzungsdaten.</li>
            <li><strong>Rechtsgrundlagen:</strong> Einwilligung (Art. 6 Abs. 1 S. 1 lit. a) DSGVO).</li>
          </ul>
        </section>

        {/* Onlinemarketing */}
        <section id="m264">
          <h2 id="m264">Onlinemarketing</h2>
          <p className="mt-3">
            Wir verarbeiten personenbezogene Daten zum Zweck des Onlinemarketings, worunter insbesondere die Vermarktung
            von Werbeflächen oder die Darstellung von werbenden Inhalten anhand potenzieller Interessen der Nutzer sowie
            die Messung ihrer Effektivität fallen können.
          </p>
          <p className="mt-3">
            Zu diesen Zwecken werden sogenannte Nutzerprofile angelegt. Wir nutzen IP-Masking-Verfahren
            (Pseudonymisierung der IP-Adresse) zum Nutzerschutz.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Verarbeitete Datenarten:</strong> Nutzungsdaten, Meta- und Kommunikationsdaten.</li>
            <li><strong>Zwecke:</strong> Reichweitenmessung, Tracking, Zielgruppenbildung, Marketing.</li>
            <li><strong>Rechtsgrundlagen:</strong> Einwilligung (Art. 6 Abs. 1 S. 1 lit. a) DSGVO); Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO).</li>
          </ul>
        </section>

        {/* Affiliate-Programme und Affiliate-Links */}
        <section id="m135">
          <h2 id="m135">Affiliate-Programme und Affiliate-Links</h2>
          <p className="mt-3">
            In unser Onlineangebot binden wir sogenannte Affiliate-Links oder andere Verweise auf Angebote von
            Drittanbietern ein. Wenn Nutzer diesen Links folgen, können wir eine Provision erhalten. Die Zuordnung dient
            alleine dem Zweck der Provisionsabrechnung.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Rechtsgrundlagen:</strong> Einwilligung (Art. 6 Abs. 1 S. 1 lit. a) DSGVO); Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO).</li>
          </ul>
          <p className="mt-3">
            <strong>Eigenes Partnerprogramm: </strong>Nutzer können Ocuris über einen persönlichen Link weiterempfehlen.
            Rufen Sie unsere Website über einen solchen Link auf, speichern wir den Partnercode für {PARTNER.cookieDays}{' '}
            Tage in einem Cookie („{REFERRAL_COOKIE}“). Legen Sie in dieser Zeit ein Konto an, ordnen wir es dem Partner
            zu und löschen das Cookie. Der Partner erhält eine Provision auf Ihre Zahlungen; er sieht dabei nur Beträge
            und Zahlungsdaten, nicht Ihren Namen, Ihre E-Mail-Adresse oder Ihre Inhalte. Die Zuordnung speichern wir,
            solange Ihr Konto besteht, Provisionsbuchungen im Rahmen der gesetzlichen Aufbewahrungspflichten.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Verarbeitete Datenarten:</strong> Partnercode, Zeitpunkt der Zuordnung, Zahlungsbeträge.</li>
            <li><strong>Rechtsgrundlagen:</strong> Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO) an der Abrechnung der Provisionen.</li>
          </ul>
        </section>

        {/* Kundenrezensionen und Bewertungsverfahren */}
        <section id="m299">
          <h2 id="m299">Kundenrezensionen und Bewertungsverfahren</h2>
          <p className="mt-3">
            Wir nehmen an Rezensions- und Bewertungsverfahren teil, um unsere Leistungen zu evaluieren, zu optimieren
            und zu bewerben.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Rechtsgrundlagen:</strong> Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO).</li>
          </ul>
        </section>

        {/* Präsenzen in sozialen Netzwerken (Social Media) */}
        <section id="m136">
          <h2 id="m136">Präsenzen in sozialen Netzwerken (Social Media)</h2>
          <p className="mt-3">
            Wir unterhalten Onlinepräsenzen innerhalb sozialer Netzwerke und verarbeiten in diesem Rahmen Nutzerdaten,
            um mit den dort aktiven Nutzern zu kommunizieren oder Informationen über uns anzubieten.
          </p>
          <ul className="mt-3 space-y-2">
            <li>
              <strong>Instagram: </strong>Meta Platforms Ireland Limited, Merrion Road, Dublin 4, Irland;{' '}
              <a href="https://privacycenter.instagram.com/policy/" target="_blank" rel="noopener noreferrer">
                Datenschutzerklärung von Instagram
              </a>.
            </li>
            <li>
              <strong>Facebook-Seiten: </strong>Meta Platforms Ireland Limited, Merrion Road, Dublin 4, Irland;{' '}
              <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">
                Facebook-Datenrichtlinie
              </a>{' '}
              und Vereinbarung über gemeinsame Verantwortlichkeit (Page Insights).
            </li>
            <li>
              <strong>LinkedIn: </strong>LinkedIn Ireland Unlimited Company, Wilton Plaza, Dublin 2, Irland;{' '}
              <a href="https://www.linkedin.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
                Datenschutzerklärung von LinkedIn
              </a>.
            </li>
            <li>
              <strong>Pinterest: </strong>Pinterest Europe Limited, Palmerston House, Fenian Street, Dublin 2, Irland;{' '}
              <a href="https://policy.pinterest.com/de/privacy-policy" target="_blank" rel="noopener noreferrer">
                Datenschutzerklärung von Pinterest
              </a>.
            </li>
            <li>
              <strong>X: </strong>X Internet Unlimited Company, One Cumberland Place, Fenian Street, Dublin 2, Irland;{' '}
              <a href="https://x.com/de/privacy" target="_blank" rel="noopener noreferrer">
                Datenschutzerklärung von X
              </a>.
            </li>
            <li>
              <strong>Xing: </strong>New Work SE, Am Strandkai 1, 20457 Hamburg, Deutschland;{' '}
              <a href="https://privacy.xing.com/de/datenschutzerklaerung" target="_blank" rel="noopener noreferrer">
                Datenschutzerklärung von Xing
              </a>.
            </li>
          </ul>
        </section>

        {/* Plug-ins und eingebettete Funktionen sowie Inhalte */}
        <section id="m328">
          <h2 id="m328">Plug-ins und eingebettete Funktionen sowie Inhalte</h2>
          <p className="mt-3">
            Wir binden Funktions- und Inhaltselemente in unser Onlineangebot ein, die von den Servern ihrer jeweiligen
            Anbieter bezogen werden (z.&nbsp;B. Schriftarten oder Videos).
          </p>
          <ul className="mt-3 space-y-2">
            <li>
              <strong>Google Fonts (Bezug vom Google Server): </strong>Google Ireland Limited, Gordon House, Barrow
              Street, Dublin 4, Irland;{' '}
              <a href="https://business.safety.google/privacy/" target="_blank" rel="noopener noreferrer">
                Google Datenschutzerklärung
              </a>. Grundlage für Datenübermittlungen ist das Data Privacy Framework (DPF).
            </li>
            <li>
              <strong>YouTube-Videos: </strong>Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland;{' '}
              <a href="https://business.safety.google/privacy/" target="_blank" rel="noopener noreferrer">
                Datenschutzerklärung von YouTube
              </a>.
            </li>
          </ul>
        </section>

        {/* Datenschutzinformationen für Hinweisgeber */}
        <section id="m2324">
          <h2 id="m2324">Datenschutzinformationen für Hinweisgeber</h2>
          <p className="mt-3">
            In diesem Abschnitt finden Sie Informationen darüber, wie wir Daten von Personen, die Hinweise geben
            (Hinweisgeber), sowie von betroffenen und beteiligten Parteien im Rahmen unseres Hinweisgeberverfahrens
            nach dem Hinweisgeberschutzgesetz (HinSchG) handhaben.
          </p>
          <ul className="mt-3 space-y-1">
            <li><strong>Verarbeitete Datenarten:</strong> Bestandsdaten, Beschäftigtendaten, Kontaktdaten, Inhaltsdaten, Nutzungsdaten.</li>
            <li><strong>Betroffene Personen:</strong> Hinweisgeber, Betroffene Personen, Zeugen und Dritte.</li>
            <li><strong>Zwecke:</strong> Erfüllung gesetzlicher Verpflichtungen zum Hinweisgeberschutz (HinSchG).</li>
            <li><strong>Rechtsgrundlagen:</strong> Rechtliche Verpflichtung (Art. 6 Abs. 1 S. 1 lit. c) DSGVO i.V.m. § 10 HinSchG); Berechtigte Interessen (Art. 6 Abs. 1 S. 1 lit. f) DSGVO).</li>
          </ul>
        </section>

        {/* Änderung und Aktualisierung */}
        <section id="m15">
          <h2 id="m15">Änderung und Aktualisierung</h2>
          <p className="mt-3">
            Wir bitten Sie, sich regelmäßig über den Inhalt unserer Datenschutzerklärung zu informieren. Wir passen die
            Datenschutzerklärung an, sobald die Änderungen der von uns durchgeführten Datenverarbeitungen dies
            erforderlich machen. Wir informieren Sie, sobald durch die Änderungen eine Mitwirkungshandlung Ihrerseits
            (z.&nbsp;B. Einwilligung) oder eine sonstige individuelle Benachrichtigung erforderlich wird.
          </p>
        </section>

        {/* Begriffsdefinitionen */}
        <section id="m42">
          <h2 id="m42">Begriffsdefinitionen</h2>
          <p className="mt-3">
            In diesem Abschnitt erhalten Sie eine Übersicht über die in dieser Datenschutzerklärung verwendeten
            Begrifflichkeiten:
          </p>
          <ul className="glossary mt-4 space-y-3">
            <li>
              <strong>Affiliate-Nachverfolgung:</strong> Protokollierung von Weiterleitungen über Partnerlinks zur
              Provisionsabrechnung.
            </li>
            <li>
              <strong>Beschäftigte:</strong> Personen in einem Beschäftigungsverhältnis sowie Bewerber.
            </li>
            <li>
              <strong>Bestandsdaten:</strong> Wesentliche Informationen zur Identifikation und Verwaltung von
              Vertragspartnern und Konten.
            </li>
            <li>
              <strong>Inhaltsdaten:</strong> Daten und Medien (Texte, Videos, Audio), die im Zuge der Nutzung erstellt
              oder hochgeladen werden.
            </li>
            <li>
              <strong>Kontaktdaten:</strong> Informationen zur Kommunikation (E-Mail, Telefonnummer, Anschrift).
            </li>
            <li>
              <strong>Meta-, Kommunikations- und Verfahrensdaten:</strong> Kontext- und Transaktionsdaten (z.&nbsp;B.
              IP-Adressen, Zeitstempel, Systeminformationen).
            </li>
            <li>
              <strong>Nutzungsdaten:</strong> Daten über die Interaktion mit digitalen Angeboten (Zugriffszeiten,
              verwendete Funktionen, Klickpfade).
            </li>
            <li>
              <strong>Personenbezogene Daten:</strong> Alle Informationen, die sich auf eine identifizierte oder
              identifizierbare natürliche Person beziehen.
            </li>
            <li>
              <strong>Profile mit nutzerbezogenen Informationen:</strong> Automatisierte Datenverarbeitung zur Analyse
              persönlicher Aspekte (Profiling).
            </li>
            <li>
              <strong>Protokolldaten:</strong> Zeitstempel, Server-Logfiles und technische Aktivitätsprotokolle.
            </li>
            <li>
              <strong>Reichweitenmessung:</strong> Statistische Auswertung von Besucherströmen zur Optimierung des
              Angebots.
            </li>
            <li>
              <strong>Tracking:</strong> Nachvollziehen des Nutzerverhaltens über mehrere Onlineangebote hinweg.
            </li>
            <li>
              <strong>Verantwortlicher:</strong> Die Person oder Stelle, die über die Zwecke und Mittel der
              Datenverarbeitung entscheidet.
            </li>
            <li>
              <strong>Verarbeitung:</strong> Jeder Vorgang im Zusammenhang mit personenbezogenen Daten (Erheben,
              Speichern, Verändern, Löschen etc.).
            </li>
            <li>
              <strong>Vertragsdaten:</strong> Angaben zur Formalisierung und Erfüllung von Vereinbarungen
              (Laufzeiten, Konditionen).
            </li>
            <li>
              <strong>Zahlungsdaten:</strong> Bankverbindungen, Rechnungsdaten und Transaktionsnachweise.
            </li>
            <li>
              <strong>Zielgruppenbildung:</strong> Bestimmung von Nutzergruppen für zielgerichtete Anzeigen (Custom /
              Lookalike Audiences).
            </li>
          </ul>
        </section>

        {/* Generator Siegel / Attribution */}
        <p className="seal mt-12 border-t border-foreground/10 pt-6 text-xs text-muted-foreground">
          <a
            href="https://datenschutz-generator.de/"
            title="Rechtstext von Dr. Schwenke - für weitere Informationen bitte anklicken."
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline hover:no-underline"
          >
            Erstellt mit kostenlosem Datenschutz-Generator.de von Dr. Thomas Schwenke
          </a>
        </p>

      </div>
    </LegalPage>
  )
}
