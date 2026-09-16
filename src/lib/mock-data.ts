import type {
  Clip,
  Project,
  ScheduleStatus,
  SocialPlatform,
  TranscriptWord,
} from '@/types/database'
import type { WaveformData } from '@/types/editor'
import { CAPTION_PRESETS } from '../../remotion/captions/presets'

/**
 * Mock-Daten für Phase 1.
 *
 * Der Editor wird gegen diese Daten gebaut, damit die UI gegen die endgültigen
 * Typen aus `types/database.ts` entsteht. In Phase 2 werden nur die Loader
 * ausgetauscht — die Komponenten bleiben unverändert.
 */

/**
 * Lokales Testvideo (16:9, 600 s), steht stellvertretend für das 720p-Proxy.
 *
 * Bewusst lokal statt von einer öffentlichen URL: fremde Test-Buckets
 * verschwinden (der lange übliche Google-Sample-Bucket liefert inzwischen 403),
 * und ein Editor, dessen Vorschau von fremder Infrastruktur abhängt, ist als
 * Entwicklungsumgebung wertlos.
 *
 * Erzeugt mit ffmpeg: zwei horizontal wandernde Flächen (damit das Reframing
 * sichtbar etwas zu verfolgen hat) und ein Fortschrittsbalken, der alle 20 s
 * neu startet — daran lässt sich Scrubbing sofort verifizieren.
 */
export const MOCK_VIDEO_SRC = '/mock/source.mp4'

export const MOCK_PROJECT_ID = 'mock'

export const mockProject: Project = {
  id: MOCK_PROJECT_ID,
  user_id: 'mock-user',
  title: 'Podcast #47 — Warum die meisten Creator nach 6 Monaten aufgeben',
  source_type: 'upload',
  source_url: null,
  source_key: 'sources/mock-user/mock/source.mp4',
  proxy_key: 'proxies/mock-user/mock/proxy.mp4',
  audio_key: 'audio/mock-user/mock/audio.wav',
  waveform_key: 'waveforms/mock-user/mock/peaks.json',
  thumbnail_url: null,
  duration_seconds: 596,
  width: 1920,
  height: 1080,
  fps: 30,
  status: 'ready',
  error_message: null,
  trigger_run_id: null,
  rights_confirmed: false,
  rights_confirmed_at: null,
  created_at: '2026-09-14T09:12:00.000Z',
  updated_at: '2026-09-14T09:31:00.000Z',
}

/**
 * Baut ein Wort-Array mit plausiblen Timings.
 *
 * Die Sprechgeschwindigkeit variiert leicht pro Wortlänge — dadurch sieht das
 * Highlighting im Player nicht mechanisch aus, und die Wortgrenzen auf der
 * Timeline liegen unregelmäßig, so wie in echten Transkripten.
 */
function buildWords(text: string, startAt: number): TranscriptWord[] {
  const tokens = text.split(/\s+/).filter(Boolean)
  const words: TranscriptWord[] = []
  let cursor = startAt

  for (const token of tokens) {
    const duration = 0.17 + token.length * 0.032
    words.push({
      word: token,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + duration).toFixed(3)),
      confidence: 0.92 + (token.length % 7) * 0.01,
      speaker: 0,
    })
    // Kurze Pause nach Satzzeichen, sonst fließender Übergang.
    cursor += duration + (/[.,!?]$/.test(token) ? 0.22 : 0.05)
  }

  return words
}

interface MockClipSeed {
  id: string
  title: string
  description: string
  hashtags: string[]
  hook: string
  start: number
  end: number
  score: number
  reasoning: string
  transcript: string
  preset: keyof typeof CAPTION_PRESETS
  renderStatus: Clip['render_status']
}

const seeds: MockClipSeed[] = [
  {
    id: 'clip-001',
    title: 'Der wahre Grund, warum 90% aller Creator aufgeben',
    description:
      'Es ist nicht der Algorithmus. Es ist nicht die Kamera. Es ist etwas viel Unbequemeres — und niemand redet darüber.',
    hashtags: ['#contentcreator', '#mindset', '#creatoreconomy', '#durchhalten'],
    hook: 'Niemand gibt wegen des Algorithmus auf.',
    start: 42.5,
    end: 71.2,
    score: 94,
    reasoning:
      'Startet mit einer kontraintuitiven Behauptung, die eine verbreitete Annahme direkt angreift. Die Auflösung kommt erst nach 20 Sekunden — starker Retention-Hook. Emotional aufgeladenes Thema mit hoher Identifikation in der Zielgruppe.',
    transcript:
      'Niemand gibt wegen des Algorithmus auf. Das ist die Ausrede, die wir uns erzählen. Der wahre Grund ist viel unbequemer: Die meisten Leute halten es nicht aus, sechs Monate lang in einen leeren Raum zu sprechen. Du postest, und da ist niemand. Du postest wieder, und da ist immer noch niemand. Und genau in diesem Moment entscheidet sich alles.',
    preset: 'hormozi',
    renderStatus: 'ready',
  },
  {
    id: 'clip-002',
    title: 'Diese eine Frage hat mein Business verändert',
    description:
      'Ich stelle sie mir jeden Montagmorgen. Sie dauert zehn Sekunden und hat mir zwei Jahre Umweg erspart.',
    hashtags: ['#business', '#produktivität', '#unternehmer', '#fokus'],
    hook: 'Zehn Sekunden, jeden Montag.',
    start: 138.0,
    end: 164.8,
    score: 88,
    reasoning:
      'Konkretes, sofort umsetzbares Framework mit niedriger Einstiegshürde. Die Zeitangabe macht es greifbar. Gut für Saves und Shares, etwas geringere Hook-Stärke als Clip 1.',
    transcript:
      'Jeden Montagmorgen stelle ich mir eine einzige Frage: Was von dem, was ich diese Woche tue, würde mir in zwölf Monaten noch etwas bedeuten? Und dann streiche ich alles andere. Nicht verschieben. Streichen. Die meisten Menschen verwechseln Beschäftigung mit Fortschritt.',
    preset: 'hormozi',
    renderStatus: 'ready',
  },
  {
    id: 'clip-003',
    title: 'Warum dein Content niemanden erreicht',
    description:
      'Du sprichst zu allen. Deshalb hört dir niemand zu. Der Fix dauert fünf Minuten.',
    hashtags: ['#marketing', '#zielgruppe', '#content', '#reichweite'],
    hook: 'Du sprichst zu allen — deshalb hört niemand zu.',
    start: 245.3,
    end: 268.9,
    score: 83,
    reasoning:
      'Direkte Ansprache in der zweiten Person, benennt einen konkreten Fehler und verspricht eine schnelle Lösung. Solider Hook, aber das Thema ist im Marketing-Content bereits stark besetzt.',
    transcript:
      'Dein Content erreicht niemanden, weil du versuchst, mit allen zu sprechen. Wenn du zu allen sprichst, klingst du wie Hintergrundrauschen. Schreib deinen nächsten Post für genau eine Person. Eine. Mit Namen, mit Beruf, mit einem Problem, das du kennst. Der Unterschied ist sofort spürbar.',
    preset: 'hormozi',
    renderStatus: 'rendering',
  },
  {
    id: 'clip-004',
    title: 'Der teuerste Fehler meiner Selbstständigkeit',
    description: 'Er hat mich 40.000 Euro gekostet und ich würde ihn wieder machen.',
    hashtags: ['#selbstständigkeit', '#fehler', '#lernen', '#startup'],
    hook: '40.000 Euro. Und ich würde es wieder tun.',
    start: 351.7,
    end: 378.4,
    score: 79,
    reasoning:
      'Konkrete Zahl erzeugt Neugier, der Widerspruch im Nachsatz hält sie aufrecht. Persönliche Story mit gutem Erzählbogen, aber die Auflösung braucht Kontext aus der Folge — funktioniert als Standalone-Clip etwas schwächer.',
    transcript:
      'Der teuerste Fehler meiner Selbstständigkeit hat mich vierzigtausend Euro gekostet. Ich habe ein Produkt gebaut, bevor ich mit einem einzigen Kunden gesprochen hatte. Zehn Monate Arbeit. Und trotzdem würde ich es wieder tun, denn ohne diesen Fehler hätte ich nie verstanden, was ich eigentlich verkaufe.',
    preset: 'hormozi',
    renderStatus: 'pending',
  },
  {
    id: 'clip-005',
    title: 'Konsistenz schlägt Talent — jedes Mal',
    description: 'Ein unbequemer Vergleich zwischen zwei Creatorn, die gleichzeitig angefangen haben.',
    hashtags: ['#konsistenz', '#disziplin', '#wachstum'],
    hook: 'Zwei Creator, derselbe Start, zwei Jahre später.',
    start: 467.2,
    end: 489.6,
    score: 71,
    reasoning:
      'Klassisches Vorher-Nachher-Framing mit klarer Botschaft. Solide, aber die Aussage ist vorhersehbar — geringeres Überraschungsmoment als bei den übrigen Segmenten.',
    transcript:
      'Zwei Creator starten am selben Tag. Der eine ist deutlich talentierter. Zwei Jahre später hat der andere hunderttausend Follower und der Talentierte hat aufgehört. Der Unterschied war nie das Talent. Der Unterschied war, wer auch dann gepostet hat, als es sich sinnlos anfühlte.',
    preset: 'hormozi',
    renderStatus: 'pending',
  },
]

export const mockClips: Clip[] = seeds.map((seed) => ({
  id: seed.id,
  project_id: MOCK_PROJECT_ID,
  user_id: 'mock-user',
  title: seed.title,
  description: seed.description,
  hashtags: seed.hashtags,
  hook_text: seed.hook,
  start_seconds: seed.start,
  end_seconds: seed.end,
  virality_score: seed.score,
  score_reasoning: seed.reasoning,
  // Timestamps sind auf den Clip-Start normalisiert (0 = erster Frame).
  words: buildWords(seed.transcript, 0),
  caption_style: CAPTION_PRESETS[seed.preset],
  crop_keyframes: [
    { frame: 0, x: 0.5, y: 0.42, scale: 1 },
    { frame: 120, x: 0.44, y: 0.42, scale: 1.08 },
    { frame: 300, x: 0.56, y: 0.44, scale: 1.04 },
    { frame: 600, x: 0.5, y: 0.42, scale: 1 },
  ],
  render_status: seed.renderStatus,
  render_key: seed.renderStatus === 'ready' ? `renders/mock-user/${seed.id}/clip.mp4` : null,
  render_job_id: null,
  render_error: null,
  thumbnail_url: null,
  created_at: '2026-09-14T09:31:00.000Z',
  updated_at: '2026-09-14T09:31:00.000Z',
}))

/**
 * Wellenform-Mock.
 *
 * In Produktion kommen die Peaks aus `services/video/waveform.ts` und liegen
 * als `peaks.json` in R2 — sie werden beim Ingest EINMAL serverseitig
 * berechnet. Ein 60-Minuten-Video im Browser zu dekodieren, nur um die
 * Wellenform zu zeichnen, blockiert den Main-Thread sekundenlang.
 */
export function generateMockWaveform(duration: number, sampleCount = 1800): WaveformData {
  const peaks: number[] = new Array(sampleCount)

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount
    // Überlagerte Sinuswellen ergeben Sprechpausen und Betonungen, die optisch
    // wie echte Sprache aussehen, statt wie gleichmäßiges Rauschen.
    const envelope =
      0.55 +
      0.28 * Math.sin(t * Math.PI * 14) +
      0.17 * Math.sin(t * Math.PI * 57 + 1.2) +
      0.09 * Math.sin(t * Math.PI * 133 + 0.4)
    const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1
    peaks[i] = Math.max(0.04, Math.min(1, envelope * (0.82 + Math.abs(jitter) * 0.34)))
  }

  return { peaks, duration }
}

export const mockWaveform = generateMockWaveform(mockProject.duration_seconds ?? 600)

/** Weitere Projekte für das Dashboard-Grid — decken alle Status-Badges ab. */
export const mockProjects: Project[] = [
  mockProject,
  {
    ...mockProject,
    id: 'p-002',
    title: 'Interview mit Marie Kessler — Skalierung ohne Team',
    source_type: 'youtube',
    source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    rights_confirmed: true,
    rights_confirmed_at: '2026-09-15T07:02:00.000Z',
    status: 'analyzing',
    duration_seconds: 2841,
    created_at: '2026-09-15T07:01:00.000Z',
  },
  {
    ...mockProject,
    id: 'p-003',
    title: 'Webinar: Preisgestaltung für Agenturen',
    source_type: 'drive',
    source_url: 'https://drive.google.com/file/d/1a2b3c/view',
    status: 'transcribing',
    duration_seconds: 3620,
    created_at: '2026-09-15T06:40:00.000Z',
  },
  {
    ...mockProject,
    id: 'p-004',
    title: 'Solo-Folge: Was ich 2026 anders mache',
    status: 'error',
    error_message: 'Quelldatei konnte nicht dekodiert werden (unbekannter Codec).',
    duration_seconds: 1204,
    created_at: '2026-09-14T18:22:00.000Z',
  },
  {
    ...mockProject,
    id: 'p-005',
    title: 'Live-Q&A September',
    status: 'queued',
    duration_seconds: 4510,
    created_at: '2026-09-14T15:10:00.000Z',
  },
]

/** Clip-Anzahl pro Projekt für das Grid (in Phase 2 ein COUNT-Join). */
export const mockClipCounts: Record<string, number> = {
  [MOCK_PROJECT_ID]: 5,
  'p-002': 0,
  'p-003': 0,
  'p-004': 0,
  'p-005': 0,
}

/**
 * Veröffentlichungs-Queue.
 *
 * Liegt hier statt in der Kalenderseite, weil das Dashboard dieselben Zahlen
 * für seine Kennzahlen braucht — zwei Listen, die dasselbe darstellen sollen,
 * laufen unweigerlich auseinander.
 */
export interface QueueEntry {
  id: string
  clipTitle: string
  score: number
  platform: SocialPlatform
  publishAt: string
  status: ScheduleStatus
}

export const mockQueue: QueueEntry[] = [
  {
    id: 'ps-1',
    clipTitle: 'Der wahre Grund, warum 90% aller Creator aufgeben',
    score: 94,
    platform: 'youtube',
    publishAt: '2026-09-16T17:00:00.000Z',
    status: 'pending',
  },
  {
    id: 'ps-2',
    clipTitle: 'Der wahre Grund, warum 90% aller Creator aufgeben',
    score: 94,
    platform: 'tiktok',
    publishAt: '2026-09-16T19:30:00.000Z',
    status: 'needs_review',
  },
  {
    id: 'ps-3',
    clipTitle: 'Diese eine Frage hat mein Business verändert',
    score: 88,
    platform: 'youtube',
    publishAt: '2026-09-17T12:00:00.000Z',
    status: 'pending',
  },
  {
    id: 'ps-4',
    clipTitle: 'Warum dein Content niemanden erreicht',
    score: 83,
    platform: 'instagram',
    publishAt: '2026-09-15T18:00:00.000Z',
    status: 'published',
  },
  {
    id: 'ps-5',
    clipTitle: 'Der teuerste Fehler meiner Selbstständigkeit',
    score: 79,
    platform: 'youtube',
    publishAt: '2026-09-15T09:00:00.000Z',
    status: 'failed',
  },
]

/** Guthaben des angemeldeten Nutzers (Phase 2: aus `profiles`). */
export const mockUsage = {
  renderMinutesUsed: 38.4,
  renderMinutesLimit: 120,
}
