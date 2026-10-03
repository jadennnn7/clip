# OmegaClip

Langform-Video rein, vertikale Kurzclips raus — und, wo die Plattformen es
zulassen, direkt veröffentlicht. Die Plattform transkribiert das Video auf
Wortebene, lässt Gemini die Segmente mit dem höchsten Viralitätspotenzial
bewerten, schneidet sie auf 9:16 mit animierten Untertiteln und plant sie für
YouTube Shorts, TikTok und Instagram Reels ein.

## Stand: Phase 1

Fundament und Editor stehen und laufen auf Mock-Daten. Die Verarbeitungskette
ist als typisierte Service-Schicht festgelegt, aber noch nicht verdrahtet.

| Bereich | Stand |
|---|---|
| Next.js 16, Tailwind 4, shadcn (Base UI) | fertig |
| Datenbankschema mit RLS (`supabase/schema.sql`) | fertig |
| Editor: Player, Timeline, Transkript, Untertitel-Styling, Undo/Redo, Shortcuts | fertig, auf Mock-Daten |
| Dashboard, Kanäle, Kalender, Abo | fertig, auf Mock-Daten |
| Link → Clips (YouTube, Google Drive), Sprechererkennung, MP4-Render | lokal getestet; Cloud-Modus über Trigger.dev + R2 gebaut, noch nicht gegen echte Accounts deployt |
| Social-Posting | Signaturen und Stubs, Implementierung offen |

## Start

```bash
npm install
npm run mock:video     # einmalig: Testvideo für den Editor (braucht ffmpeg)
npm run dev
```

Ohne `.env.local` läuft die App auf Mock-Daten; der Proxy überspringt dann die
Session-Prüfung und schreibt einen Hinweis ins Log. In Produktion ist dasselbe
ein harter Fehler — fehlende Credentials dürfen die Authentifizierung nicht
stillschweigend abschalten.

Für echte Daten `.env.example` nach `.env.local` kopieren und ausfüllen.

Erscheint **„Publishing noch nicht eingerichtet“**, zeigt `npm run publishing:check`
die fehlende Konfiguration an, ohne Zugangsschlüssel auszugeben. Die vollständigen
Schritte für Cloud-Verarbeitung und Kanäle stehen in
[Publishing einrichten](docs/publishing-setup.md). Lokales Rendering allein
richtet noch keine Kanal-Verbindungen oder Veröffentlichungen ein.

## Link einfügen → Clips

Einen YouTube- oder Drive-Link in das Feld auf der Übersicht einfügen (oder
irgendwo auf der Seite ⌘V drücken). Ist die Rechtebestätigung gesetzt, startet
die Verarbeitung sofort; das Projekt erscheint mit Fortschritt in der Liste,
und nach ein bis zwei Minuten liegen die Clips im Editor.

```
Link ─► yt-dlp (Metadaten, 720p H.264, Untertitel) ─► ffmpeg (Proxy, Wellenform)
     ─► Transkript: Deepgram, sonst YouTube-Untertitel mit Wortzeiten
     ─► Auswahl:    Gemini-Kandidatensuche → unabhängige redaktionelle Prüfung
     ─► Zuschnitt:  Gesichter + Mundbewegung → aktiver Sprecher → Kamerafahrt
     ─► Clips mit Wortzeiten, Titel, Hashtags, Score und Begründung
Editor ─► „Exportieren → Video rendern (MP4)" ─► Remotion, dieselbe Composition wie die Vorschau
```

| Schlüssel in `.env.local` | ohne | mit |
|---|---|---|
| `GEMINI_API_KEY` | Inhaltlich ungeprüfte, regelbasierte Schnittvorschläge, maximal 59 Punkte. Titel sind der erste Satz. | Gemini 3.8 Flash sucht alternative Momente und prüft danach den exakten Ausschnitt auf Hook, Flow und Value mit wörtlichen Belegen. |
| `DEEPGRAM_API_KEY` | Nur Videos mit YouTube-Untertiteln (fast alle mit Sprache). Drive-Videos brauchen Deepgram. | Eigene Transkription mit Satzzeichen und Sprechertrennung; die Sprecherwechsel beschleunigen auch den Kameraschnitt. |

Bei wiederholter Überlastung wechselt die KI-Anfrage automatisch von Gemini 3.8
Flash der Reihe nach auf Gemini 3.6 Flash, 3.5 Flash und 3.1 Flash-Lite, mit
denselben Prüfkriterien. Die Modelle können optional über `GEMINI_MODEL` und
`GEMINI_FALLBACK_MODEL` (mehrere kommagetrennt) konfiguriert werden.
Insgesamt gibt es höchstens fünf Versuche pro Anfrage; ungültige API-Schlüssel
und fehlerhafte Anfragen werden nicht erneut versucht.

Antwortet Gemini trotzdem nicht, geht dieselbe Anfrage an einen Ersatzanbieter,
sofern `AI_FALLBACK_API_KEY` und `AI_FALLBACK_MODEL` gesetzt sind. Jeder Dienst
mit OpenAI-kompatiblem Chat-Endpunkt passt; `AI_FALLBACK_BASE_URL` wählt ihn aus
(Standard: OpenAI, Vorlage in `.env.example`: Mistral). Für den Rest einer Analyse
bleibt es dann beim Ersatz.

**Inhaltliche Auswahl:** Die Clipanzahl ist eine Obergrenze. Unterhaltung,
Spannung, Humor und Emotion zählen ebenso wie Wissensvermittlung. Bei
Spielshows genügt ein verständlicher lokaler Bogen mit Ergebnis oder Pointe.
Verwendbare Clips ab 60 Punkten werden sortiert; 75 Punkte sind keine
Mindestanforderung. Fehlt Einordnung oder Auflösung, wird der Kandidat
verworfen. Lange Videos werden in bis zu acht überlappenden Abschnitten
durchsucht. Die geprüften Treffer werden gemeinsam sortiert und dedupliziert.
Liegt die Auswahl unter dem Ziel (rund ein Clip pro zwei Minuten, maximal acht),
sucht die KI in einer zweiten Runde gezielt weitere Momente oder verbessert
abgelehnte Schnittgrenzen. Ein einzelner Treffer beendet die Suche nicht.
Fällt eine ergänzende Anfrage aus, bleiben bereits geprüfte Clips erhalten.
Die KI-Prüfung darf auch danach null Clips ergeben; dann wird nicht mit
regelbasierten Clips aufgefüllt. Nur bei fehlender oder fehlgeschlagener KI
entstehen ausdrücklich ungeprüfte Ersatzvorschläge. Bei Überschneidungen und
inhaltlichen Wiederholungen bleibt die stärkere Variante.

Die Clipansicht zeigt Hook, Flow und Value mit Einzelnoten und Textbelegen.
Der Gesamtscore gewichtet sie mit 40/30/30 Prozent und begrenzt hohe Werte bei
schwachen Einzelkriterien. Trend bleibt ohne aktuelle Plattformdaten unbewertet
und fließt nicht in den Score ein. Die Bewertung betrifft die Originalpassage
und ist keine Reichweitenprognose. Bestehende Clips werden nicht rückwirkend
bewertet; sie müssen neu analysiert werden. Bestehende Supabase-Installationen
übernehmen die optionalen Bewertungsfelder mit
`supabase/migrations/20260921000000_clip_editorial.sql`.

Regressionstests ohne API-Aufrufe:

```bash
node scripts/test-editorial-selection.mjs
node scripts/test-editorial-pipeline.mjs
node scripts/test-discovery-windows.mjs
node scripts/test-heuristic-selection.mjs
```

**Sprechererkennung** (`services/video/reframe.ts`): 5 Bilder pro Sekunde,
Gesichter und Lippenpunkte mit face-api (WebAssembly, Modelle im npm-Paket),
aktiver Sprecher über die Mundbewegung, harte Schnitte an Szenen- und
Sprecherwechseln, sonst ruhige Schwenks mit Vorlauf. Kostet rund eine Sekunde
Rechenzeit pro vier Sekunden Clip. Findet sie kein Gesicht, bleibt der
Mittelausschnitt.

**MP4-Render** (`services/render/`): Remotion bündelt `remotion/index.ts` einmal
pro Codestand und rendert die Props, mit denen der Player die Vorschau zeigt.
Beim allerersten Render lädt Remotion Chrome Headless Shell (~90 MB). Lokal
importierte Videos werden vorher einmal an den Server bzw. nach R2 geladen.

### Zwei Betriebsarten

**Lokal** (Standard): Pipeline und Render laufen im Node-Prozess von
`npm run dev`, Dateien liegen unter `.omegaclip-data/` (`OMEGACLIP_DATA_DIR`
überschreibt den Ort). Ein Neustart setzt laufende Jobs beim nächsten
Statusabruf fort. Voraussetzungen:

```bash
brew install ffmpeg
pip3 install -U "yt-dlp[default]"   # YouTube bricht ältere Versionen regelmäßig
```

Sperrt YouTube die IP mit „Sign in to confirm you're not a bot", betrifft das
alle Videos und hält oft Stunden an. Dann `YTDLP_COOKIES_FROM_BROWSER="chrome"`
(oder `YTDLP_COOKIES` mit einer cookies.txt) in `.env.local` setzen, siehe
`.env.example`.

**Cloud** (sobald `TRIGGER_SECRET_KEY` gesetzt ist — für Vercel): Dieselben
Schritte laufen als Trigger.dev-Tasks (`src/trigger/link-to-clips.ts`,
`src/trigger/render-clip.ts`), Videos und Renders liegen in R2. Der Next-Server
stößt nur an, fragt Status ab und signiert Download-URLs. Einrichtung:

1. Trigger.dev-Projekt anlegen; `TRIGGER_SECRET_KEY` und `TRIGGER_PROJECT_ID`
   in `.env.local` und bei Vercel eintragen.
2. R2-Bucket mit `R2_*`-Schlüsseln. Für Renders lokal importierter Videos lädt
   der Browser direkt nach R2 hoch — dafür braucht der Bucket eine CORS-Regel,
   die `PUT` von der App-Domain erlaubt.
3. Worker deployen. Die Worker-Variablen kommen aus `.env.production`, nie aus
   `.env.local` (Liste `WORKER_ENV` in `trigger.config.ts`). Tunnel- oder
   Platzhalter-URLs brechen den Deploy ab:

   ```bash
   npx trigger.dev@4.6.3 login
   npm run trigger:deploy   # erst npm run prod:check, dann deploy nach prod
   ```

Das Worker-Image bringt ffmpeg, yt-dlp und Chromes Systembibliotheken mit;
Remotion bündelt die Composition beim ersten Render pro Maschine. Von
Rechenzentrums-IPs sperrt YouTube meist als Bot; dafür gibt es `YTDLP_PROXY`
und `YTDLP_COOKIES_BASE64`. Ob der Worker durchkommt, zeigt der Task
`youtube-access-check`.

Der ganze Weg zur Produktion (Hosting, R2-Domain, SMTP, OAuth-Redirects):
[`docs/production-setup.md`](docs/production-setup.md).

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build inkl. Typprüfung |
| `npm run typecheck` | Nur TypeScript |
| `npm run lint` | ESLint |
| `npm run prod:check` | `.env.production` vor dem Go-live prüfen (URLs, Schlüssel, R2-Domain, Supabase) |
| `npm run trigger:deploy` | Prüfung, dann Worker nach Trigger.dev prod deployen |
| `npm run remotion` | Remotion Studio für die Clip-Composition |
| `npm run test:schema` | Schema + RLS gegen ein frisches Postgres prüfen (braucht Docker) |
| `npm run mock:video` | Testvideo neu erzeugen |

## Datenbank

```bash
supabase start
psql "$DATABASE_URL" -f supabase/schema.sql

npm run test:schema   # Mandantentrennung, Rechte und Constraints prüfen
```

`npm run test:schema` spielt das Schema in ein frisches Postgres im Container
ein und prüft 17 Zusicherungen: dass Nutzer B nichts von Nutzer A sieht, dass
die Token-Tabelle für `authenticated` unerreichbar ist, dass die
Guthaben-Funktionen nicht per RPC aufrufbar sind, dass zwei Worker nicht
denselben Queue-Eintrag greifen können, und dass die Check-Constraints greifen.

Zwei Punkte, die das Schema trägt:

**RLS auf jeder Tabelle.** Die Mandantentrennung läuft ausschließlich über
`auth.uid()`. Kein Query im Anwendungscode filtert selbst nach `user_id` —
damit kann es auch niemand vergessen.

**Tokens außerhalb von `public`.** OAuth-Tokens liegen in
`private.social_account_tokens`. Das Schema wird nicht über PostgREST
exponiert, ist für `anon` und `authenticated` also nicht erreichbar. In
`public` wären die Tokens nur durch RLS geschützt — ein einziger
Policy-Fehler gäbe fremde Social-Media-Kanäle frei.

## Plattform-Einschränkungen

Vollautomatisches Veröffentlichen ist nicht überall erlaubt. Das ist kein
Implementierungsdetail, sondern bestimmt das Datenmodell: jeder verbundene
Kanal hat einen eigenen `automation_mode`
(`auto_publish` | `review_queue` | `manual`).

| Plattform | Einschränkung |
|---|---|
| **TikTok** | Un-auditierte API-Clients posten ausschließlich mit Sichtbarkeit `SELF_ONLY`, und nur 5 Konten dürfen die App pro 24 h autorisieren. Bis zum bestandenen Content-Posting-Audit läuft TikTok im Entwurfs-Modus: der Clip landet in der Inbox, der Nutzer tippt einmal auf „Posten". |
| **YouTube** | Ohne bestandenes Compliance-Audit lädt die API nur mit `privacyStatus: private` hoch. `videos.insert` hat außerdem ein eigenes Kontingent von **100 Uploads pro Tag pro GCP-Projekt** — über alle Kunden hinweg. Das ist die erste Skalierungsgrenze. |
| **Instagram** | Professional Account, verknüpfte Facebook-Page und App Review für `instagram_content_publish` (2–4 Wochen). 100 Posts pro rollendem 24-h-Fenster, abfragbar über `content_publishing_limit`. Tokens laufen nach 60 Tagen ab und müssen vorher erneuert werden — ein abgelaufenes Token lässt sich nicht mehr auffrischen. |

Diese Grenzen stehen auch im UI an der jeweiligen Verbindung. Ein Nutzer, der
„Set it and forget it" kauft und dann feststellt, dass TikTok nur Entwürfe
bekommt, fühlt sich getäuscht.

## Kontolöschung

Unter **Konto & Daten** (`/dashboard/account`) löscht man sein Konto selbst
(Art. 17 DSGVO). `DELETE /api/account` stoppt offene Veröffentlichungen,
löscht Läufe und Dateien in R2, den Stripe-Kunden (beendet das Abo sofort) und
zuletzt den Auth-Nutzer — die Datenbank folgt per `ON DELETE CASCADE`
(`npm run test:schema` prüft, dass keine Zeile übrig bleibt).

`/konto-loeschen` ist die öffentliche Anleitung dazu. Im Meta-App-Dashboard
unter *Einstellungen → Allgemein → Datenlöschung für Nutzer* als
„Anleitungs-URL für die Datenlöschung" eintragen:
`https://<domain>/konto-loeschen`.

## Architektur

```
src/
  app/                    Routen (App Router)
  components/editor/      Player, Timeline, Transkript, Untertitel-Panel
  lib/supabase/           Browser-, Server-, Admin-Client, Proxy-Session
  lib/storage/r2.ts       Cloudflare R2 (Zero Egress)
  services/ai/            Deepgram (Transkript), Gemini (Analyse)
  services/video/         yt-dlp, ffmpeg, Sprechererkennung
  services/pipeline/      Link → Clips, lokal oder als Trigger.dev-Run
  services/render/        MP4-Render mit Remotion, lokal oder als Trigger.dev-Run
  services/social/        Plattform-Adapter hinter einem gemeinsamen Interface
  stores/editor-store.ts  Zustand + zundo (Undo/Redo)
  trigger/                Pipeline-Tasks (siehe src/trigger/README.md)
remotion/                 Die Clip-Composition
supabase/schema.sql
```

Drei Entscheidungen, die den Rest erklären:

**Der Remotion Player ist die Vorschau.** Browser und Lambda rendern dieselbe
`ClipComposition`. Es gibt keinen zweiten Rendering-Pfad, der abweichen könnte
— und eine Änderung am Untertitel-Styling ist ein Props-Wechsel, kein
Server-Roundtrip.

**Die Computer Vision läuft nicht im Renderpfad.** Die Sprechererkennung
erzeugt beim Ingest nur ein Keyframe-Array; Remotion interpoliert es. Dadurch
bleibt der Render deterministisch, die Kameraposition ist im Editor
korrigierbar, und ein erneuter Render nach einer Styling-Änderung wiederholt
die Analyse nicht.

**R2 statt Supabase Storage für Dateien.** Bei Video dominiert der Egress die
Rechnung: Supabase verlangt ~0,09 $/GB, R2 null. Supabase bleibt für Postgres,
Auth und Metadaten zuständig.
