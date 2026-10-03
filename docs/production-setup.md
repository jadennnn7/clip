# Produktion einrichten

Von „läuft lokal über einen Tunnel“ zu „läuft für Kunden“. Die Reihenfolge ist
wichtig: Die App-Domain muss feststehen, bevor Worker, R2, Supabase und die
OAuth-Konsolen darauf zeigen können.

Alle Produktionswerte stehen in **`.env.production`** (gitignored). Aus ihr
lesen der Worker-Deploy und die Prüfung; `.env.local` bleibt für die
Entwicklung. Nach jeder Änderung prüfen:

```bash
npm run prod:check
```

Die Prüfung meldet Tunnel-, localhost- und Platzhalter-URLs, den falschen
Trigger-Schlüssel und Cookie-/Proxy-Fehler. Sie lädt ein Probe-Objekt nach R2
und liest es über die öffentliche Domain zurück, so wie Instagram und TikTok
es tun. Mit `SUPABASE_ACCESS_TOKEN` prüft sie außerdem SMTP und die
Redirect-URLs von Supabase. Werte gibt sie nie aus. Derselbe Offline-Teil
läuft vor jedem `trigger deploy` und bricht ihn bei Fehlern ab.

## 1. Domain und Hosting (Vercel)

1. `.env.example` nach `.env.production` kopieren und die Werte aus
   `.env.local` übernehmen, die für Produktion gleich bleiben.
2. Vercel-Projekt anlegen: `vercel login`, dann im Projektordner `vercel link`.
   Für ein kommerzielles Produkt braucht es den Pro-Plan; Hobby ist nur für
   private Projekte erlaubt.
3. Unter *Settings → Domains* die App-Domain verbinden, z. B. `app.<domain>`.
   `NEXT_PUBLIC_APP_URL="https://app.<domain>"` in `.env.production` setzen,
   ohne Pfad und ohne Schrägstrich am Ende.

Den Build kann man vorher lokal prüfen: `npm run build`. Die größte
Server-Funktion liegt bei rund 135 MB; Vercel erlaubt 250 MB.

## 2. Öffentliche Video-Domain (R2)

Instagram (`video_url`) und TikTok (`PULL_FROM_URL`) laden das fertige Video
selbst herunter. Signierte URLs verarbeiten sie nicht zuverlässig.

1. Cloudflare-Dashboard → R2 → Bucket → *Settings → Custom Domains →
   Connect Domain*, z. B. `media.<domain>`. Die Domain muss bei Cloudflare im
   DNS liegen.
2. `R2_PUBLIC_BASE_URL="https://media.<domain>"` setzen. Die Adresse
   `r2.dev` ist gedrosselt und nur zum Testen gedacht.
3. CORS-Regel am Bucket: Origin `https://app.<domain>`, Methode `PUT`, Header
   `Content-Type` (für den Browser-Upload lokal importierter Videos).
4. TikTok Developer Portal → *URL properties*: die Domain oder den Präfix
   `https://media.<domain>/` verifizieren.

## 3. YouTube vom Worker aus

YouTube sperrt Downloads von Rechenzentrums-IPs meistens mit „Sign in to
confirm you're not a bot“. Auf dem Worker gibt es keinen Browser, deshalb
greift `YTDLP_COOKIES_FROM_BROWSER` dort nicht. Es gibt zwei Auswege, die
sich kombinieren lassen:

**Proxy — `YTDLP_PROXY`** (verlässlicher): ein Residential- oder ISP-Proxy,
z. B. `http://nutzer:passwort@host:port` oder `socks5://…`. Der Proxy muss eine
**Sticky Session** halten: YouTube bindet die Video-Adressen an die IP, die
sie abgefragt hat, und der ganze Download läuft über den Proxy. Solche Proxys
rechnen meist pro GB ab. Ein einstündiges Video in 720p hat mehrere hundert MB.

**Cookies — `YTDLP_COOKIES_BASE64`**: die cookies.txt eines angemeldeten
YouTube-Kontos, Base64-kodiert. Die Tabs des Netscape-Formats übersteht keine
Env-Maske.

1. Ein **Zweitkonto** nehmen. YouTube kann Konten sperren, die viel
   herunterladen.
2. Ein privates Browserfenster öffnen, bei YouTube anmelden und im selben Tab
   `https://www.youtube.com/robots.txt` aufrufen. Die youtube.com-Cookies als
   `cookies.txt` exportieren, dann das Fenster schließen. Nutzt man die
   Sitzung danach im Browser weiter, rotiert YouTube die Cookies und die
   exportierten werden ungültig.
3. `base64 -i cookies.txt | tr -d '\n'` und die Ausgabe als
   `YTDLP_COOKIES_BASE64` eintragen. Danach die Datei löschen.

Cookies laufen ab. Kommt die Sperre trotz Cookies wieder, steht das im Log des
Worker-Runs; dann neu exportieren.

Ob es auf dem echten Worker funktioniert, zeigt nur ein Lauf dort, nicht der
eigene Rechner. Nach dem Deploy im Trigger.dev-Dashboard den Task
**`youtube-access-check`** in `prod` mit `{}` testen. `ok: true` heißt:
Metadaten und Download gehen durch.

## 4. Worker (Trigger.dev)

```bash
npx trigger.dev@4.6.3 login      # einmal
npm run trigger:deploy           # prod:check, dann deploy nach prod
```

Der Deploy übernimmt die Worker-Variablen aus `.env.production` (Liste
`WORKER_ENV` in `trigger.config.ts`) und überschreibt dabei Werte, die im
Dashboard geändert wurden. Die Datei ist die Quelle der Wahrheit.

Danach im Dashboard unter *API Keys → prod* den Schlüssel `tr_prod_…` kopieren
und als `TRIGGER_SECRET_KEY` in `.env.production` eintragen. Der
`tr_dev_…`-Schlüssel schickt Runs in die Dev-Umgebung, die nur ein laufendes
`npm run trigger:dev` abarbeitet.

## 5. Anmelde-Mails (Supabase Auth)

Die Anmeldung läuft nur per Magic Link. Der eingebaute Mailversand von
Supabase ist nur zum Testen gedacht und stark begrenzt.

1. Einen Mail-Anbieter mit eigener Absender-Domain einrichten, z. B. Resend
   (SPF- und DKIM-Einträge im DNS setzen) oder Postmark.
2. Supabase-Dashboard → *Authentication → Emails → SMTP Settings*: eigenes
   SMTP einschalten. Bei Resend: Host `smtp.resend.com`, Port `465`, Nutzer
   `resend`, Passwort = API-Key, Absender z. B. `login@<domain>`.
3. *Authentication → Rate Limits*: „Emails sent per hour“ an den erwarteten
   Andrang anpassen.
4. *Authentication → URL Configuration*: Site URL `https://app.<domain>`,
   unter Redirect URLs `https://app.<domain>/auth/callback` ergänzen. Fehlt der
   Eintrag, landet der Magic Link auf der Site URL, und die Anmeldung schlägt
   fehl.

Optional für `npm run prod:check`: ein persönliches Token von
`supabase.com/dashboard/account/tokens` als `SUPABASE_ACCESS_TOKEN`. Die
Prüfung liest damit nur und ändert nichts.

Nutzt Produktion dieselbe Supabase-Datenbank wie die Entwicklung, muss
`TOKEN_ENCRYPTION_KEY` in beiden gleich sein. Sonst sind die gespeicherten
Kanalverbindungen unlesbar.

## 6. OAuth-Redirects

`npm run prod:check` gibt die genauen Adressen aus. Der Code bildet sie aus
`NEXT_PUBLIC_APP_URL`, die `*_REDIRECT_URI`-Variablen liest er nicht.

| Plattform | Wo eintragen | Adresse |
|---|---|---|
| YouTube | Google Cloud → OAuth-Client → Autorisierte Weiterleitungs-URIs | `https://app.<domain>/api/oauth/youtube/callback` |
| Instagram | Meta → Facebook Login → Gültige OAuth-Redirect-URIs | `https://app.<domain>/api/oauth/instagram/callback` |
| TikTok | Developer Portal → Login Kit → Redirect URI | `https://app.<domain>/api/oauth/tiktok/callback` |

Die localhost- oder Tunnel-Einträge für die Entwicklung können daneben stehen
bleiben.

## 7. App deployen

1. `npm run prod:check` bis ohne Fehler.
2. Vercel → *Settings → Environment Variables → Production*: den Inhalt von
   `.env.production` einfügen (die Maske nimmt eine ganze .env-Datei an).
   `YTDLP_*` und `SUPABASE_ACCESS_TOKEN` braucht nur der Worker bzw. die
   Prüfung.
3. `vercel --prod` oder Push auf den verbundenen Branch.
4. Einmal durchspielen: Magic Link anfordern und anmelden, einen YouTube-Link
   einfügen, einen Clip rendern, einen Kanal verbinden.
