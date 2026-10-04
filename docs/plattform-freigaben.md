# Plattform-Freigaben beantragen

Solange diese Freigaben fehlen, lädt Ocuris auf YouTube nur **privat** hoch,
Instagram funktioniert nur für Konten, die in der Meta-App als Tester
eingetragen sind, und TikTok nur im Sandbox-Modus. `npm run publishing:check`
meldet deshalb alle drei als „NICHT BEREIT“.

Die Prüfungen dauern jeweils Tage bis Wochen und werden oft einmal mit
Rückfragen zurückgegeben. Deshalb alle drei **parallel** starten, sobald die
Voraussetzungen unten erfüllt sind. Beantragen kann nur der Betreiber in
seinen eigenen Entwickler-Konten; die Texte unten sind Vorlagen dafür.

## 0. Voraussetzungen für alle drei

Alle drei Prüfer öffnen die Website und prüfen, ob Ocuris ein echtes,
öffentlich erreichbares Produkt ist:

- [ ] **Produktions-Domain** mit HTTPS, `NEXT_PUBLIC_APP_URL` zeigt darauf
      (siehe `docs/production-setup.md`, `npm run prod:check`).
- [ ] **Datenschutzerklärung** unter `/datenschutz` und **Nutzungsbedingungen**
      unter `/agb` — öffentlich, von der Startseite aus verlinkt. Beide Pfade
      sind im Proxy schon ohne Login freigegeben (`PUBLIC_ROUTES`). Die
      Datenschutzerklärung muss die Plattformdaten ausdrücklich nennen: welche
      Daten von YouTube/Instagram/TikTok gelesen werden, wofür, wie lange, und
      wie man die Verbindung trennt und Daten löschen lässt.
- [ ] **Impressum** unter `/impressum` (in Deutschland ohnehin Pflicht).
- [ ] **Konto löschen**: Meta verlangt eine Anleitung oder URL zur
      Datenlöschung. Mindestens eine Seite, die beschreibt, wie man Kanäle
      trennt und das Konto löschen lässt (Kontaktadresse).
- [ ] Ein **Testkonto** für die Prüfer (E-Mail-Adresse, an die der Magic Link
      geht, oder eine Anleitung zur Registrierung) und ein Testvideo-Link, mit
      dem der ganze Ablauf in wenigen Minuten durchläuft.
- [ ] **Bildschirmaufnahmen** (englisch untertitelt oder mit englischem
      Voiceover), siehe je Plattform.

## 1. YouTube (Google)

Zwei getrennte Schritte im Google-Cloud-Projekt von `GOOGLE_CLIENT_ID`:

**a) OAuth-App-Verifizierung** — nötig, weil `youtube.upload` eine sensible
Berechtigung ist. Ohne sie sehen Nutzer den Warnhinweis „Google hat diese App
nicht überprüft“, und es gilt eine Obergrenze für Testnutzer.

1. Google Search Console: Produktions-Domain als Eigentümer bestätigen.
2. Google Cloud → APIs & Dienste → OAuth-Zustimmungsbildschirm: App-Name
   „Ocuris“, Logo, Startseite, Datenschutz- und AGB-Link, autorisierte Domain.
   Veröffentlichungsstatus auf **In Produktion**.
3. Bereiche: `youtube.upload`, `youtube.readonly`. Für jeden die Begründung
   (Vorlage unten) und ein **nicht gelistetes YouTube-Video**, das zeigt:
   Anmeldung bei Ocuris → „Mit YouTube verbinden“ → Google-Zustimmung (App-Name
   und Client-ID in der Adresszeile sichtbar) → Clip veröffentlichen → das
   Video erscheint auf dem Kanal.
4. Zur Überprüfung einreichen.

**b) YouTube API Services Audit** — hebt die Beschränkung auf private
Uploads auf und ist zugleich der Weg zu mehr Kontingent:
[Audit- und Kontingent-Formular](https://support.google.com/youtube/contact/yt_api_form).
Dort die Nutzung beschreiben (Vorlage unten) und die erwartete Zahl an
Uploads pro Tag angeben — großzügig, aber begründet.

Nach der Freigabe: `YOUTUBE_AUDIT_PASSED=true` in Vercel **und** im
Trigger.dev-Worker setzen, beide neu deployen. Erst dann bietet die App
öffentliche Vollautomatik an.

Begründungen (englisch):

> **youtube.upload** — Ocuris turns a user's long-form video into short vertical
> clips. When the user clicks "Publish" or enables automatic publishing for
> their channel, Ocuris uploads the finished clip to that user's own YouTube
> channel as a Short, with the title and description the user reviewed. Ocuris
> never uploads to a channel the user has not connected, and the user can
> disconnect at any time on the Channels page.
>
> **youtube.readonly** — Used only to show which channel is connected (name and
> avatar) and to display view counts of clips that Ocuris published, so the user
> can see which clips perform. Ocuris does not read or store other videos,
> comments, or subscriber data.

## 2. Instagram (Meta)

Im Meta-Entwicklerportal der App von `META_APP_ID`:

1. **Unternehmensverifizierung** des Meta-Business-Kontos abschließen
   (Handelsregister- oder Gewerbenachweis, Adresse, Telefon). Ohne sie lässt
   sich `instagram_content_publish` nicht beantragen.
2. App-Einstellungen: Datenschutz-URL, AGB-URL, Datenlöschungs-URL (siehe
   Abschnitt 0), App-Symbol, Kategorie, Kontakt-E-Mail.
3. App Review → Berechtigungen anfordern: `instagram_basic`,
   `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.
   Für jede eine Bildschirmaufnahme und die Begründung (Vorlage unten).
   Die Aufnahme muss den vollständigen Ablauf zeigen: Facebook-Login mit der
   Auswahl der Seite, die mit dem Instagram-Professional-Konto verknüpft ist →
   Kanal erscheint in Ocuris → Clip veröffentlichen → Reel auf Instagram.
4. Testanweisungen für die Prüfer: Testkonto, Link zu einem Testvideo, und
   dass ein Instagram-**Professional**-Konto mit verknüpfter Facebook-Seite
   nötig ist.
5. Nach der Freigabe die App auf **Live** schalten.

Danach `META_APP_REVIEW_PASSED=true` in Vercel und im Worker setzen und neu
deployen.

Begründungen (englisch):

> **instagram_content_publish** — Publishes a Reel to the user's own Instagram
> professional account when they click "Publish" in Ocuris or enable automatic
> publishing for that account. The video is the short clip the user created
> and reviewed in Ocuris's editor.
>
> **instagram_basic** — Reads the connected account's username and profile
> picture so the user can see which account a clip will be posted to.
>
> **pages_show_list** — Lists the Facebook Pages the user manages so they can
> choose the Page linked to their Instagram professional account; this is how
> the Instagram account ID is found.
>
> **pages_read_engagement** — Required together with pages_show_list to read
> the Instagram business account linked to the selected Page.

## 3. TikTok

Im TikTok-Developer-Portal der App von `TIKTOK_CLIENT_KEY`:

1. App-Details: Name, Symbol, Kategorie, Beschreibung, Website-URL,
   Datenschutz- und AGB-URL.
2. Produkte: **Login Kit** und **Content Posting API**. Ocuris nutzt die
   Bereiche `user.info.basic` und `video.upload`: Clips landen in der
   TikTok-Inbox des Nutzers, veröffentlicht wird in der TikTok-App. Direktes
   Veröffentlichen (`video.publish`) ist nicht eingebaut und wird deshalb auch
   nicht beantragt.
3. **Domain bzw. URL-Präfix verifizieren**, von dem TikTok die Videos abholt:
   die Domain aus `R2_PUBLIC_BASE_URL` (Verifizierung per DNS-TXT-Eintrag oder
   Datei).
4. Demo-Video: Anmeldung → „Mit TikTok verbinden“ → Zustimmung → Clip
   veröffentlichen → Clip erscheint in der TikTok-Inbox.
5. Zur Prüfung einreichen.

Begründungen (englisch):

> **user.info.basic** — Shows the connected TikTok account's display name and
> avatar so the user knows where clips will be sent.
>
> **video.upload** — Sends a finished clip to the user's TikTok inbox when they
> click "Publish" in Ocuris. The user reviews, edits, and posts it in the TikTok
> app themselves; Ocuris never posts publicly on the user's behalf.

## 4. Nach den Freigaben

1. Flags setzen (`YOUTUBE_AUDIT_PASSED`, `META_APP_REVIEW_PASSED`) — in Vercel
   **und** Trigger.dev, beide neu deployen.
2. `npm run publishing:check` zeigt die Plattformen dann als bereit.
3. Mit einem eigenen Testclip je Plattform einmal den ganzen Weg gehen
   (siehe `docs/publishing-setup.md`, Abschnitt 6).
