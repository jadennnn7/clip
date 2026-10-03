# Publishing einrichten

Die Meldung „Publishing noch nicht eingerichtet“ bedeutet, dass die
Serverkonfiguration unvollständig ist. Der aktuelle Workflow benötigt Supabase,
Trigger.dev, R2 und anschließend OAuth-Zugangsdaten für jede gewünschte Plattform.
Die vorhandenen Werte prüfen, ohne Geheimnisse auszugeben:

```bash
npm run publishing:check
```

Der Check prüft Konfigurationswerte, keine Verbindung zu externen Diensten,
Datenbankschemata oder ausgerollte Worker. Ein vorhandener Schlüssel allein
bestätigt daher noch keinen funktionierenden Upload.

## 1. App und Datenbank

Falls noch keine `.env.local` im Projektverzeichnis existiert, `.env.example`
dorthin kopieren. Eine bestehende Datei ergänzen, nicht überschreiben.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` und
  `SUPABASE_SERVICE_ROLE_KEY` aus demselben Supabase-Projekt eintragen.
- Für eine neue Datenbank `supabase/schema.sql` im Supabase SQL Editor ausführen.
  Bei bestehenden Installationen die noch fehlenden Migrationen aus
  `supabase/migrations/` in zeitlicher Reihenfolge anwenden. Für Publishing ist
  insbesondere `20260922000000_publishing.sql` erforderlich; Link-Importe
  benötigen auch die nachfolgenden Token-/Abrechnungs-Migrationen.
  `20260929000000_workspace.sql` legt Projekte, Clips und Brand Kits in der
  Datenbank ab. Fehlt sie, bleibt der Workspace jedes Kontos nur in seinem
  Browser; beim ersten Laden danach übernimmt die App ihn einmalig.
- `NEXT_PUBLIC_APP_URL` auf die tatsächlich verwendete App-Adresse setzen,
  lokal beispielsweise `http://localhost:3000`, produktiv eine HTTPS-Adresse.
  In Supabase Auth die Site URL und den Anmelde-Callback
  `<APP-ORIGIN>/auth/callback` entsprechend freigeben.
- Falls `TOKEN_ENCRYPTION_KEY` noch fehlt, einmal mit `openssl rand -hex 32`
  erzeugen und als Wert speichern. **Ein vorhandener Schlüssel bleibt erhalten.**
  App und Worker müssen denselben Schlüssel verwenden; ein Austausch ohne
  Token-Migration macht vorhandene Kanalverbindungen unlesbar.

Secrets bleiben in `.env.local` beziehungsweise in den Umgebungsvariablen des
Hosters und Workers. Sie erhalten keinen `NEXT_PUBLIC_`-Präfix. Die vorhandenen
öffentlichen Supabase-Werte und die App-Adresse sind davon ausgenommen.

## 2. Videospeicher

Einen R2-Bucket erstellen und `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` sowie `R2_BUCKET` eintragen. Ohne expliziten Bucketnamen
verwendet die App `omegaclip`. Der R2-Zugriff muss Lesen, Schreiben und Löschen
in diesem Bucket erlauben.

Für Instagram und TikTok zusätzlich `R2_PUBLIC_BASE_URL` auf eine öffentlich
erreichbare HTTPS-Video-Domain setzen. Beide Adapter lassen die Plattform das
Video abholen; TikTok verwendet `PULL_FROM_URL` und erwartet eine dort
verifizierte Domain beziehungsweise einen verifizierten URL-Präfix. YouTube
verwendet die signierte R2-Download-Adresse.

Für den Browser-Upload lokal importierter Videos im Bucket eine CORS-Regel mit
der exakten App-Origin, Methode `PUT` und erlaubtem Header `Content-Type`
hinterlegen. Lokale und produktive App-Origin bei Bedarf separat erlauben.

## 3. Worker

Im Trigger.dev-Projekt `TRIGGER_PROJECT_ID` ermitteln und den zur Umgebung
passenden `TRIGGER_SECRET_KEY` setzen. Die Projekt-ID wird zum Starten und
Deployen der Worker benötigt; API-Aufrufe der App verwenden den Secret Key.
**Sobald der Secret Key gesetzt ist, wechseln auch Link-Importe und Render in
den Cloud-Modus.** R2 und die zugehörigen Worker müssen dann bereitstehen.

Für lokale Entwicklung den Development-Key verwenden und neben `npm run dev`
einen Worker starten:

```bash
npx trigger.dev@4.6.3 login
npx trigger.dev@4.6.3 dev --env-file .env.local
```

Der lokale Worker braucht ffmpeg und yt-dlp auf dem Rechner. Remotion lädt beim
ersten Render Chrome Headless Shell. Für Produktion die Konfiguration der
Produktionsumgebung verwenden und deployen:

```bash
npx trigger.dev@4.6.3 deploy --env-file .env.local
```

Im Next-Hosting denselben Supabase-/R2-/OAuth-Kontext, dieselbe App-Adresse,
denselben Verschlüsselungsschlüssel und den passenden Production-Key von
Trigger.dev setzen. `trigger.config.ts` synchronisiert beim Deploy die Werte
aus `WORKER_ENV`, darunter Supabase, R2, OAuth, Audit-Flags und den
Verschlüsselungsschlüssel. Diese Werte im Worker-Dashboard kontrollieren.

Die Tasks `link-to-clips`, `render-clip`, `publish-clip` und der Zeitplan
`publishing-sweep` müssen in der passenden Umgebung verfügbar sein. Der
Zeitplan stößt fällige beziehungsweise unterbrochene Aufträge alle fünf Minuten
erneut an. Das Produktions-Image installiert ffmpeg, yt-dlp und die
Chrome-Systembibliotheken; separate Remotion-Lambda-/AWS-Zugangsdaten werden
für diesen Rendering-Pfad nicht verwendet.

`GEMINI_API_KEY` ist für inhaltlich geprüfte KI-Clips nötig. Ohne ihn entstehen
nur ungeprüfte Ersatzvorschläge, die nicht automatisch veröffentlicht werden.
`DEEPGRAM_API_KEY` wird für Quellen ohne verwendbare YouTube-Untertitel benötigt,
insbesondere Drive-Videos. Beide Werte werden bei gesetzter Konfiguration an
den Worker synchronisiert.

## 4. Kanäle autorisieren

Nur die gewünschten Plattformen konfigurieren. Die Callback-Adresse ergibt
sich aus der Origin von `NEXT_PUBLIC_APP_URL` und dem jeweiligen Pfad:

| Plattform | Zugangsdaten | Callback-Pfad |
| --- | --- | --- |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/oauth/youtube/callback` |
| Instagram | `META_APP_ID`, `META_APP_SECRET` | `/api/oauth/instagram/callback` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `/api/oauth/tiktok/callback` |

Die vollständige Adresse, beispielsweise
`http://localhost:3000/api/oauth/youtube/callback`, in der jeweiligen
Plattform-App registrieren. Die `*_REDIRECT_URI`-Werte in `.env.example` sind
Registrierungshilfen; der Code liest sie nicht. Meta verwendet zusätzlich
`META_GRAPH_VERSION` und erwartet die Freigabe einer Facebook-Seite mit
verknüpftem Instagram-Professional-Konto.

Die App verwendet `YOUTUBE_AUDIT_PASSED=true` beziehungsweise
`META_APP_REVIEW_PASSED=true` zur Freigabe von Auto-Publish. Diese Flags erst nach
der tatsächlichen Plattformfreigabe setzen. Ohne YouTube-Flag fordert der
Adapter private Uploads an. TikTok bleibt unabhängig von Audit-Flags beim
Inbox-Upload mit anschließender Veröffentlichung in TikTok. Wie die Freigaben
beantragt werden, samt Begründungstexten: [Plattform-Freigaben](plattform-freigaben.md).

## 5. Konfiguration übernehmen

`npm run publishing:check` erneut ausführen, lokale App und Worker neu starten
und produktive Worker bei Änderungen erneut deployen. Änderungen an
`NEXT_PUBLIC_*` erfordern auch einen neuen Next-Build beziehungsweise ein neues
Deployment. Anschließend in OmegaClip anmelden, unter „Verbundene Kanäle“ die
Konfiguration erneut prüfen und den gewünschten Kanal autorisieren. Neue
Verbindungen starten ohne Auto-Publish; den gewünschten Modus ausdrücklich
in den Kanaleinstellungen auswählen.

## 6. Vom Link zur Veröffentlichung

Unter „Verbundene Kanäle“ den gewünschten Modus auswählen und speichern.
„Vollautomatisch“ veröffentlicht geeignete neue Clips ohne weitere Freigabe.
Clips unter dem eingestellten Mindest-Score und Clips aus einer regelbasierten
Ersatzanalyse warten auf Prüfung. Mit Mindest-Score 0 werden alle mit KI
analysierten Clips berücksichtigt. Der erste geeignete Clip wird zum geplanten
Zeitpunkt verarbeitet, weitere Clips aus demselben Import folgen im Abstand
von acht Stunden. Rendering, Plattformverarbeitung und Wiederholungen können
den tatsächlichen Veröffentlichungszeitpunkt verzögern.

Vor dem Einfügen eines Links zeigt das Dashboard, welche Kanäle automatisch
veröffentlichen und wo eine Freigabe nötig ist. Nach dem Import zeigen die
Clip-Karten und die Veröffentlichungs-Queue den echten Serverstatus. Die
Freigabe in der Queue startet den gespeicherten Veröffentlichungsauftrag;
„Veröffentlicht“ wird erst nach Bestätigung der Plattform angezeigt. Eine
private YouTube-Datei oder ein TikTok-Inbox-Upload gilt weiterhin als
erforderlicher manueller Schritt. Neue Kanaleinstellungen gelten für neue
Importe, nicht rückwirkend für vorhandene Clips. Lokale Dateiuploads bleiben
im manuellen Editor-Ablauf.

### Wenn YouTube-Vollautomatik noch nicht verfügbar ist

Diese Freigabe betrifft das API-Projekt des SaaS-Betreibers, nicht die
Kanalverbindung eines einzelnen Nutzers. Der Betreiber muss das
[YouTube API Compliance Audit](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)
abschließen. Google beschränkt Uploads aus betroffenen ungeprüften Projekten
auf private Sichtbarkeit; ein erneutes Verbinden des Kanals hebt das nicht auf.
Erst nach bestätigter Freigabe `YOUTUBE_AUDIT_PASSED=true` für **Web-App und
Trigger.dev-Worker** setzen und beide neu starten beziehungsweise deployen.
Danach kann der Nutzer die Vollautomatik in seinen Kanaleinstellungen
aktivieren. Ein gesetztes Flag allein ersetzt keine Freigabe durch Google.

Zur Funktionsprüfung einen eigenen Testclip verwenden und in der Queue
kontrollieren: eingeplant → Video wird vorbereitet → Veröffentlichung läuft →
veröffentlicht. Anschließend den Plattform-Link öffnen und die öffentliche
Sichtbarkeit prüfen. Diese Prüfung erzeugt einen echten Beitrag und gehört
bewusst zur Inbetriebnahme, nicht zu den automatisierten Tests.
