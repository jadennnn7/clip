# Pipeline-Tasks (Trigger.dev v4)

Warum Trigger.dev und nicht Inngest: Inngest führt Funktionen in der eigenen
Infrastruktur des Nutzers aus und erbt damit deren Zeitlimits — auf Vercel Pro
sind das 300 Sekunden. Für das Transkodieren eines einstündigen Videos ist das
disqualifizierend. Trigger.dev v4 führt Tasks auf eigenen Maschinen ohne
Zeitlimit aus.

## Ablauf

```
project.ingest      Quelle holen → ffprobe → Audio 16 kHz → Proxy 720p
                    → Wellenform-Peaks → alles nach R2
      ↓
project.transcribe  Deepgram Nova-3 (Wort-Timestamps + Diarization)
      ↓
project.analyze     Claude Opus 5 → 3–5 Segmente mit Score und Metadaten
      ↓
clip.reframe        (fan-out) Szenenerkennung + Active-Speaker → Crop-Keyframes
      ↓
clip.render         (fan-out) renderMediaOnLambda → S3 → Transfer nach R2
      ↓
clip.schedule       posting_schedules je verbundenem Kanal anlegen
      ↓
post.publish        Cron alle 5 Minuten: fällige Einträge veröffentlichen
```

## Idempotenz

Jeder Task bekommt einen deterministischen `idempotencyKey` nach dem Muster
`<entity>:<id>:<schritt>`. Ein doppelt ausgelöster Lauf — etwa durch einen
Retry der auslösenden Instanz — erzeugt damit keinen zweiten Deepgram-Aufruf
und keinen zweiten Lambda-Render.

Beim Publishing kommt eine zweite Ebene dazu, weil ein Doppel-Post öffentlich
sichtbar und nicht rückgängig zu machen ist:

1. `posting_schedules.idempotency_key` ist UNIQUE — kein doppelter Queue-Eintrag.
2. `claim_posting_schedule()` setzt den Status in einem einzigen UPDATE mit
   Bedingung auf den Ausgangsstatus. Greifen zwei Worker dieselbe Zeile, gewinnt
   genau einer; der andere bekommt kein Ergebnis zurück.

## Fehlerklassifikation

Siehe `services/social/base.ts` → `PublishErrorKind`:

| Klasse      | Auslöser              | Reaktion                                          |
|-------------|-----------------------|---------------------------------------------------|
| `retryable` | 429, 5xx, Netzwerk    | Exponentielles Backoff mit Jitter, bis 5 Versuche |
| `auth`      | 401, 403              | Account auf `needs_reauth`, Nutzer benachrichtigen, KEIN Retry |
| `quota`     | Tageslimit erschöpft  | Auf den nächsten Tag umplanen                     |
| `terminal`  | 400 (Format, Länge)   | Clip als fehlerhaft markieren, Fehler anzeigen    |

Der Jitter im Backoff ist nicht optional: ohne ihn laufen nach einem
Plattform-Ausfall alle fehlgeschlagenen Posts synchron in denselben Retry und
lösen dasselbe Rate-Limit erneut aus.

## Guthaben

`reserve_render_minutes()` wird VOR dem Enqueue aufgerufen und prüft und
erhöht in einem atomaren UPDATE. Ein nachgelagertes "erst prüfen, dann
erhöhen" würde bei zwei gleichzeitigen Jobs beide durchlassen.
Schlägt der Render fehl, bucht `refund_render_minutes()` zurück.
