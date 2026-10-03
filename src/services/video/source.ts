import 'server-only'

import { writeFileSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { MissingToolError, ProcessError, runProcess } from '@/services/pipeline/process'
import { classifyLink, type LinkSource } from '@/lib/links'

/**
 * Quelle eines Link-Projekts holen: Metadaten, Untertitel, Video.
 *
 * yt-dlp statt einer eigenen Implementierung: YouTube ändert seine
 * Auslieferung mehrmals im Jahr, und nur ein aktiv gepflegtes Werkzeug hält
 * damit Schritt. Deshalb steht bei jedem Fehler, der nach „veraltet" aussieht,
 * der Update-Befehl direkt in der Meldung.
 */

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'

/** Längere Quellen lehnen wir vor dem Download ab — drei Stunden Video sind mehrere Gigabyte. */
export const MAX_SOURCE_SECONDS = 3 * 60 * 60

export interface CaptionTrack {
  key: string
  /** Automatische Spracherkennung von YouTube: Zeitstempel pro Wort. */
  automatic: boolean
}

export interface SourceInfo {
  title: string
  durationSeconds: number | null
  thumbnailUrl: string | null
  language: string | null
  caption: CaptionTrack | null
}

export interface Chapter {
  start: number
  end: number
  title: string
}

interface YtDlpInfo {
  chapters?: Array<{ start_time?: number; end_time?: number; title?: string }> | null
  title?: string
  duration?: number
  thumbnail?: string
  language?: string | null
  is_live?: boolean
  live_status?: string
  automatic_captions?: Record<string, unknown>
  subtitles?: Record<string, unknown>
  extractor_key?: string
  webpage_url?: string
}

function baseArgs(source: LinkSource): string[] {
  return [
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '30',
    // YouTube verlangt inzwischen eine JavaScript-Laufzeit. Node läuft hier
    // ohnehin — so muss niemand zusätzlich Deno installieren.
    '--js-runtimes', `node:${process.execPath}`,
    // Schonende Abfragerate: YouTube sperrt bei vielen anonymen Abrufen kurz
    // hintereinander die ganze IP. Etwas milder als yt-dlps Vorgabe `-t sleep`,
    // die für Massen-Downloads gedacht ist — kostet pro Video rund 15 Sekunden.
    '--sleep-requests', '0.75',
    '--sleep-subtitles', '3',
    '--sleep-interval', '3',
    '--max-sleep-interval', '8',
    ...(source === 'youtube' ? youtubeAccessArgs() : []),
  ]
}

/**
 * Nach einer Bot-Sperre fragt OmegaClip YouTube eine Weile gar nicht mehr.
 *
 * Jeder Abruf während der Sperre kann sie verlängern — ein Klick auf „Erneut
 * versuchen" soll das nicht tun. Die Marke liegt als Datei im Temp-Verzeichnis,
 * weil Trigger.dev Runs in eigenen Prozessen startet.
 */
const COOLDOWN_FILE = path.join(os.tmpdir(), 'omegaclip-youtube-cooldown')
const COOLDOWN_MS = 30 * 60 * 1000

async function assertNoCooldown(): Promise<void> {
  const blockedAt = Number(await readFile(COOLDOWN_FILE, 'utf8').catch(() => '0'))
  const remaining = blockedAt + COOLDOWN_MS - Date.now()
  if (remaining <= 0) return
  const minutes = Math.ceil(remaining / 60_000)
  throw new UserFacingError(
    `YouTube hat eben automatisierte Downloads blockiert. Damit die Sperre nicht länger wird, pausieren YouTube-Abrufe noch ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}.`,
  )
}

/**
 * Zugang zu YouTube über Proxy und Cookies, falls eingerichtet.
 *
 * YouTube sperrt anonyme Abrufe zeitweise für eine ganze IP („Sign in to
 * confirm you're not a bot") — Rechenzentrums-IPs wie die der Trigger.dev-
 * Worker trifft das fast immer. Dann hilft weder ein anderer Player-Client
 * noch ein yt-dlp-Update, nur eine andere IP (Proxy) oder eine Anmeldung
 * (Cookies). Der Proxy muss den ganzen Download tragen: Die Video-Adressen
 * gelten nur für die IP, die sie abgefragt hat.
 *
 * Nur für YouTube: Drive-Links müssen ohnehin öffentlich sein. Mit einer
 * Google-Anmeldung ließen sich sonst Drive-Dateien laden, die nur das Konto
 * hinter den Cookies sehen darf.
 */
function youtubeAccessArgs(): string[] {
  const args: string[] = []
  if (process.env.YTDLP_PROXY) args.push('--proxy', process.env.YTDLP_PROXY)
  const cookies = cookieFile()
  if (cookies) args.push('--cookies', cookies)
  else if (process.env.YTDLP_COOKIES_FROM_BROWSER) args.push('--cookies-from-browser', process.env.YTDLP_COOKIES_FROM_BROWSER)
  return args
}

function hasYoutubeCookies(): boolean {
  return Boolean(process.env.YTDLP_COOKIES || process.env.YTDLP_COOKIES_BASE64?.trim() || process.env.YTDLP_COOKIES_FROM_BROWSER)
}

let decodedCookieFile: string | null = null

/**
 * Pfad zur cookies.txt. Auf dem Worker gibt es weder Browser noch Dateien
 * außerhalb des Images — dort kommt der Inhalt aus `YTDLP_COOKIES_BASE64`.
 * Base64, weil die Tabs und Zeilenumbrüche des Netscape-Formats keine
 * Env-Eingabemaske übersteht. yt-dlp schreibt aufgefrischte Cookies zurück,
 * deshalb eine beschreibbare Kopie im Temp-Verzeichnis.
 */
function cookieFile(): string | null {
  if (process.env.YTDLP_COOKIES) return process.env.YTDLP_COOKIES
  const encoded = process.env.YTDLP_COOKIES_BASE64?.trim()
  if (!encoded) return null
  if (!decodedCookieFile) {
    const file = path.join(os.tmpdir(), `omegaclip-youtube-cookies-${process.pid}.txt`)
    writeFileSync(file, Buffer.from(encoded, 'base64'), { mode: 0o600 })
    decodedCookieFile = file
  }
  return decodedCookieFile
}

/**
 * Prüft den Link und lädt die Metadaten.
 *
 * Läuft vor dem Anlegen des Projekts: Ein privates Video, ein Tippfehler oder
 * ein Livestream soll als Meldung am Eingabefeld enden, nicht als
 * Fehlerkarte in der Projektliste.
 */
export async function fetchSourceInfo(
  url: string,
  infoPath: string,
  preferredLanguage: string | null,
  signal?: AbortSignal,
): Promise<SourceInfo> {
  const link = classifyLink(url)
  if (!link) throw new UserFacingError('Bitte einen gültigen HTTPS-Link von YouTube oder Google Drive einfügen.')
  if (link.source === 'youtube') await assertNoCooldown()

  let raw: string
  try {
    raw = await runProcess(YTDLP, [...baseArgs(link.source), '--dump-single-json', '--', link.url], { captureStdout: true, signal })
  } catch (error) {
    throw await explainYtDlpError(error, link.source)
  }

  const info = JSON.parse(raw) as YtDlpInfo
  if (info.is_live || info.live_status === 'is_live' || info.live_status === 'is_upcoming') {
    throw new UserFacingError('Livestreams lassen sich erst nach dem Ende verarbeiten.')
  }
  if (typeof info.duration === 'number' && info.duration > MAX_SOURCE_SECONDS) {
    throw new UserFacingError('Das Video ist länger als drei Stunden. Bitte eine kürzere Quelle verwenden.')
  }

  // Die Metadaten landen auf der Platte, damit der Download sie wiederverwendet
  // statt YouTube ein zweites Mal abzufragen.
  await writeFile(infoPath, raw)

  return {
    title: info.title?.trim() || 'Neues Projekt',
    durationSeconds: typeof info.duration === 'number' ? info.duration : null,
    thumbnailUrl: info.thumbnail ?? null,
    language: info.language ?? null,
    caption: pickCaptionTrack(info, preferredLanguage),
  }
}

/**
 * Wählt die Untertitelspur, deren Zeitstempel zur Tonspur passen.
 *
 * YouTube bietet unter `automatic_captions` neben der Originalerkennung
 * (`<sprache>-orig`) maschinelle Übersetzungen in ~100 Sprachen an. Die
 * Übersetzungen haben nur Zeitstempel pro Zeile und einen Text, der nicht
 * gesprochen wird — als Untertitel für den Clip sind sie unbrauchbar. Deshalb
 * zählt nur die Originalspur oder ein manuell hochgeladener Untertitel.
 */
function pickCaptionTrack(info: YtDlpInfo, preferredLanguage: string | null): CaptionTrack | null {
  const base = (key: string) => key.split('-')[0].toLowerCase()
  const automatic = Object.keys(info.automatic_captions ?? {})
  const manual = Object.keys(info.subtitles ?? {}).filter((key) => key !== 'live_chat')
  const original = automatic.filter((key) => key.endsWith('-orig'))
  const wanted = preferredLanguage ?? (info.language ? base(info.language) : null)

  const find = (keys: string[]) => (wanted ? keys.find((key) => base(key) === wanted) : undefined)

  const originalMatch = find(original)
  if (originalMatch) return { key: originalMatch, automatic: true }
  const manualMatch = find(manual)
  if (manualMatch) return { key: manualMatch, automatic: false }
  if (original[0]) return { key: original[0], automatic: true }
  // Ältere Videos ohne `-orig`: Die unübersetzte Spur trägt genau den Sprachcode des Videos.
  if (info.language && automatic.includes(info.language)) return { key: info.language, automatic: true }
  if (manual[0]) return { key: manual[0], automatic: false }
  return null
}

/**
 * Die Kapitel des Videos, wie der Creator sie gesetzt hat.
 *
 * Kapitel sind die verlässlichste Themengrenze, die es gibt: „Weg 3",
 * „Die zwei Arten des Aufschiebens" — ein Clip, der über eine solche Grenze
 * läuft, beginnt einen Gedanken und bricht ihn ab.
 */
export async function readChapters(infoPath: string): Promise<Chapter[]> {
  const info = JSON.parse(await readFile(infoPath, 'utf8').catch(() => '{}')) as YtDlpInfo
  return (info.chapters ?? []).flatMap((chapter) =>
    typeof chapter.start_time === 'number' && typeof chapter.end_time === 'number'
      ? [{ start: chapter.start_time, end: chapter.end_time, title: (chapter.title ?? '').replace(/^<Untitled Chapter \d+>$/, '').trim() }]
      : [])
}

/**
 * Manuelle Untertitel in der Sprache der automatischen Spur — die Quelle für
 * Satzzeichen und Schreibung. `null`, wenn es keine gibt oder die gewählte
 * Spur selbst schon manuell ist.
 */
export async function findReferenceTrack(infoPath: string, timing: CaptionTrack): Promise<CaptionTrack | null> {
  if (!timing.automatic) return null
  const info = JSON.parse(await readFile(infoPath, 'utf8').catch(() => '{}')) as YtDlpInfo
  const language = timing.key.split('-')[0].toLowerCase()
  const manual = Object.keys(info.subtitles ?? {}).filter((key) => key !== 'live_chat')
  const key = manual.find((candidate) => candidate.toLowerCase() === language)
    ?? manual.find((candidate) => candidate.split('-')[0].toLowerCase() === language)
  return key ? { key, automatic: false } : null
}

function sourceKind(info: YtDlpInfo): LinkSource {
  return info.extractor_key === 'GoogleDrive' ? 'drive' : 'youtube'
}

async function sourceOf(infoPath: string): Promise<LinkSource> {
  return sourceKind(JSON.parse(await readFile(infoPath, 'utf8').catch(() => '{}')) as YtDlpInfo)
}

/** Lädt die gewählte Untertitelspur als json3. Gibt den Dateipfad zurück oder null. */
export async function downloadCaptions(
  infoPath: string,
  directory: string,
  track: CaptionTrack,
  signal?: AbortSignal,
  name = 'captions',
): Promise<string | null> {
  try {
    await runProcess(YTDLP, [
      ...baseArgs(await sourceOf(infoPath)),
      '--load-info-json', infoPath,
      '--skip-download',
      track.automatic ? '--write-auto-subs' : '--write-subs',
      '--sub-langs', `^${track.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      '--sub-format', 'json3',
      '-o', `subtitle:${path.join(directory, `${name}.%(ext)s`)}`,
    ], { signal })
  } catch (error) {
    // Fehlende Untertitel sind kein Abbruchgrund — dann bleibt nur Deepgram.
    if (signal?.aborted) throw error
    return null
  }
  const file = (await readdir(directory)).find((entry) => entry.startsWith(`${name}.`) && entry.endsWith('.json3'))
  return file ? path.join(directory, file) : null
}

/**
 * Lädt das Video in höchstens 720p, bevorzugt als H.264/AAC.
 *
 * 720p ist die Auflösung des Editor-Proxys. Mehr herunterzuladen hieße, die
 * Datei danach wieder herunterzurechnen — und H.264 lässt sich ohne Neukodierung
 * in jedem Browser abspielen.
 */
export async function downloadVideo(
  infoPath: string,
  directory: string,
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<string> {
  const info = JSON.parse(await readFile(infoPath, 'utf8').catch(() => '{}')) as YtDlpInfo
  const source = sourceKind(info)
  // Video und Ton kommen als zwei Downloads nacheinander. Die Videospur macht
  // den Großteil der Bytes aus, daher die ungleiche Gewichtung.
  let finishedStreams = 0
  let lastPercent = 0

  const download = (input: string[]) => {
    finishedStreams = 0
    lastPercent = 0
    return runProcess(YTDLP, [
      ...baseArgs(source),
      '-f', 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
      '-S', 'res:720,vcodec:h264,acodec:aac',
      '--merge-output-format', 'mp4',
      '--no-mtime',
      '--newline',
      '--progress-template', 'download:[omega] %(progress._percent_str)s',
      '-o', path.join(directory, 'source.%(ext)s'),
      ...input,
    ], {
      signal: options.signal,
      onLine: (line) => {
        const match = /\[omega\]\s*([\d.]+)%/.exec(line)
        if (!match || !options.onProgress) return
        const percent = Number(match[1]) / 100
        if (percent < lastPercent - 0.5) finishedStreams++
        lastPercent = percent
        options.onProgress(finishedStreams === 0 ? percent * 0.9 : 0.9 + percent * 0.1)
      },
    })
  }

  try {
    try {
      await download(['--load-info-json', infoPath])
    } catch (error) {
      // YouTube weist Download-Adressen gelegentlich kurz mit 403 ab. Die
      // Info-Datei hält genau diese Adressen fest; frisch abgefragte gehen
      // meist durch. Bei Drive heißt 403 dagegen: nicht freigegeben.
      if (source !== 'youtube' || !info.webpage_url || !(error instanceof ProcessError) || !/HTTP Error 403/i.test(error.stderr)) throw error
      console.warn('[yt-dlp] 403 beim Download, zweiter Versuch mit frisch abgefragten Adressen')
      await sleep(5_000, undefined, { signal: options.signal })
      await download(['--', info.webpage_url])
    }
  } catch (error) {
    throw await explainYtDlpError(error, source)
  }

  const file = (await readdir(directory)).find((name) =>
    name.startsWith('source.') && !/\.(part|ytdl|json|json3)$/.test(name) && !/\.f\d+\./.test(name),
  )
  if (!file) throw new Error('Der Download ist ohne Videodatei beendet worden.')
  return path.join(directory, file)
}

/** Ein Fehler, dessen Text direkt im UI stehen darf. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

const OUTDATED_HINT = 'Aktualisiere yt-dlp mit `pip3 install -U "yt-dlp[default]"` und versuche es erneut.'

/**
 * In Produktion lesen Kunden die Meldung, nicht der Betreiber: Sie bekommen
 * einen neutralen Text, der Hinweis zur Einrichtung landet im Log des Workers.
 */
function operatorMessage(customer: string, operator: string): string {
  if (process.env.NODE_ENV !== 'production') return operator
  console.error('[yt-dlp]', operator)
  return customer
}

function botBlockMessage(): string {
  const pause = `YouTube-Abrufe pausieren deshalb ${COOLDOWN_MS / 60_000} Minuten.`
  if (process.env.NODE_ENV === 'production') {
    return operatorMessage(
      `YouTube lässt gerade keine Downloads von unserem Server zu. Bitte versuche es in etwa ${COOLDOWN_MS / 60_000} Minuten erneut.`,
      hasYoutubeCookies() || process.env.YTDLP_PROXY
        ? 'YouTube sperrt trotz YTDLP_PROXY/YTDLP_COOKIES_BASE64 als Bot. Cookies neu exportieren (Konto abgemeldet?) oder einen anderen Proxy-Standort wählen.'
        : 'YouTube sperrt die Worker-IP als Bot. In Trigger.dev (prod) YTDLP_PROXY und/oder YTDLP_COOKIES_BASE64 setzen, siehe docs/production-setup.md.',
    )
  }
  return hasYoutubeCookies()
    ? `YouTube verlangt trotz der hinterlegten Cookies eine Anmeldung. Melde dich im Browser neu bei YouTube an und versuche es erneut. ${pause}`
    : `YouTube blockiert anonyme Downloads von diesem Server gerade als automatisiert — für alle Videos, oft für Stunden. ${pause} Abhilfe: \`YTDLP_COOKIES_FROM_BROWSER="chrome"\` in \`.env.local\` setzen und den Worker neu starten.`
}

async function explainYtDlpError(error: unknown, source: LinkSource): Promise<Error> {
  if (error instanceof MissingToolError) {
    return new UserFacingError(`yt-dlp ist auf dem Server nicht installiert. Installiere es mit \`pip3 install "yt-dlp[default]"\`.`)
  }
  if (!(error instanceof ProcessError)) return error instanceof Error ? error : new Error(String(error))

  const text = error.stderr
  if (/not a bot/i.test(text)) await writeFile(COOLDOWN_FILE, String(Date.now())).catch(() => {})
  // Funktionen statt Texte, wo die Meldung ins Log schreibt — nur die zutreffende Regel soll das tun.
  const rules: Array<[RegExp, string | (() => string)]> = [
    [/unable to connect to proxy|proxy ?error|407 proxy/i, () => operatorMessage(
      'YouTube ist von unserem Server aus gerade nicht erreichbar. Bitte in ein paar Minuten erneut versuchen.',
      'Der Proxy aus `YTDLP_PROXY` ist nicht erreichbar oder lehnt die Zugangsdaten ab.',
    )],
    [/no such option|unrecognized arguments/i, `Die installierte yt-dlp-Version ist zu alt. ${OUTDATED_HINT}`],
    [/private video/i, 'Das Video ist privat. Stelle es auf „Nicht gelistet" oder „Öffentlich" und versuche es erneut.'],
    [/confirm your age|age-restricted/i, 'Das Video ist altersbeschränkt und lässt sich ohne Anmeldung nicht laden.'],
    [/members-only|join this channel/i, 'Das Video ist nur für Kanalmitglieder verfügbar.'],
    [/not a bot/i, botBlockMessage],
    [/unavailable|not available|has been removed|does not exist|HTTP Error 404/i, 'Das Video ist nicht verfügbar. Prüfe den Link.'],
    [/unsupported url/i, 'Dieser Link führt nicht direkt zu einem Video.'],
    [/page needs to be reloaded|nsig|signature|player/i, `YouTube hat seine Auslieferung geändert. ${OUTDATED_HINT}`],
    [/access denied|HTTP Error 403|permission/i, source === 'drive'
      ? 'Kein Zugriff auf die Datei. Bei Google Drive muss sie für „Jeder mit dem Link" freigegeben sein.'
      : `YouTube hat den Download gerade verweigert (HTTP 403). Das ist meist nach wenigen Minuten vorbei, bitte erneut versuchen. Hält es an: ${OUTDATED_HINT}`],
  ]
  const lastLine = text.trim().split('\n').filter((line) => line.includes('ERROR')).pop()
  // Die Meldung im UI ist übersetzt; die Originalzeile braucht es zum Nachvollziehen.
  if (lastLine) console.warn('[yt-dlp]', lastLine)
  for (const [pattern, message] of rules) {
    if (pattern.test(text)) return new UserFacingError(typeof message === 'function' ? message() : message)
  }

  return new UserFacingError(`Das Video konnte nicht geladen werden${lastLine ? `: ${lastLine.replace(/^ERROR:\s*/, '')}` : '.'}`)
}
