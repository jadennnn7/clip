# OmegaClip

Langform-Video rein, vertikale Kurzclips raus — und, wo die Plattformen es
zulassen, direkt veröffentlicht. Die Plattform transkribiert das Video auf
Wortebene, lässt Claude die Segmente mit dem höchsten Viralitätspotenzial
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
| Ingest, Deepgram, Claude, Remotion Lambda, Social-Posting | Signaturen und Stubs, Implementierung offen |

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

Direkt zum Editor: <http://localhost:3000/dashboard/projects/mock>

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build inkl. Typprüfung |
| `npm run typecheck` | Nur TypeScript |
| `npm run lint` | ESLint |
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

## Architektur

```
src/
  app/                    Routen (App Router)
  components/editor/      Player, Timeline, Transkript, Untertitel-Panel
  lib/supabase/           Browser-, Server-, Admin-Client, Proxy-Session
  lib/storage/r2.ts       Cloudflare R2 (Zero Egress)
  services/ai/            Deepgram (Transkript), Claude (Analyse)
  services/video/         ffmpeg, Reframing, Remotion Lambda
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
