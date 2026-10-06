import { cn } from '@/lib/utils'

/**
 * Die Seite als das lange Video, von dem der Hero erzählt („1 Video · 58:12").
 *
 * Jeder Abschnitt ist ein Kapitel mit Startzeit — wie die Kapitelmarken
 * unter einem YouTube-Video. Dieselbe Liste trägt die Kapitelmarken über den
 * Überschriften und den Scrubber an der Unterkante der Navbar; beide lesen
 * deshalb hier, damit Marke und Anzeige nie auseinanderlaufen. Kein
 * Client-Modul: Die Seite ist eine Server-Komponente und bräuchte sonst eine
 * Client-Referenz statt der Werte.
 *
 * Die Zeiten sind proportional zur Lage der Abschnitte auf dem Desktop
 * (1440 × 900) gemessen, damit der Abspielkopf beim Scrollen gleichmäßig
 * läuft. Wächst ein Abschnitt deutlich, lohnt es, sie neu zu messen. Genau
 * müssen sie nicht sein: Der Scrubber rechnet zwischen den Kapiteln linear,
 * an jedem Kapitelanfang stimmt die Zeit also auf die Sekunde.
 */
export const CHAPTERS = [
  { id: 'intro', label: 'Intro', start: 0 },
  { id: 'beispiele', label: 'Beispiele', start: 24 * 60 + 57 },
  { id: 'funktionen', label: 'Funktionen', start: 30 * 60 + 6 },
  { id: 'fuer-wen', label: 'Für wen', start: 39 * 60 + 5 },
  { id: 'preise', label: 'Preise', start: 43 * 60 + 49 },
  { id: 'faq', label: 'FAQ', start: 50 * 60 + 42 },
  { id: 'start', label: 'Loslegen', start: 54 * 60 + 48 },
] as const

export type ChapterId = (typeof CHAPTERS)[number]['id']

/** Gesamtlänge — dieselbe Zahl, die der Hero über dem Video zeigt. */
export const RUNTIME = 58 * 60 + 12

/** Sekunden als `mm:ss`, wie ein Player sie schreibt. */
export function timecode(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

export function chapter(id: ChapterId) {
  return CHAPTERS.find((entry) => entry.id === id)!
}

/**
 * Kapitelmarke über einer Überschrift: Startzeit im Blau eines
 * Zeitstempel-Links, dann der Kapitelname. Ersetzt die Glas-Plakette, die
 * auf jeder zweiten KI-Seite über der Überschrift sitzt.
 *
 * Die Zeit ist für Vorleser ausgeblendet — „dreiundzwanzig Uhr sechs" vor
 * jeder Überschrift wäre Rauschen; der Kapitelname bleibt lesbar.
 */
export function ChapterMarker({
  id,
  label,
  className,
}: {
  id: ChapterId
  /** Abweichender Text neben der Zeit, sonst der Kapitelname. */
  label?: string
  className?: string
}) {
  const entry = chapter(id)
  return <MarkerLine lead={timecode(entry.start)} label={label ?? entry.label} className={className} />
}

/**
 * Die Marke ohne Kapitel: vorn eine kurze Kennung im Blau (bei Kapiteln die
 * Startzeit, sonst z. B. eine Schrittnummer), dahinter der Text. Für Seiten,
 * die nicht das lange Video der Landingpage sind.
 */
export function MarkerLine({ lead, label, className }: { lead: string; label: string; className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center gap-2.5 font-mono text-xs font-medium tracking-[0.08em] text-white/65 uppercase',
        className,
      )}
    >
      <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-brand" />
      <span aria-hidden className="text-brand tabular-nums">
        {lead}
      </span>
      <span aria-hidden className="h-px w-6 bg-white/25" />
      <span>{label}</span>
    </p>
  )
}
