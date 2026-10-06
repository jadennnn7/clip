'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import Image from 'next/image'
import { LOGO } from '@/lib/logo'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Loader2, Mail, Square, SquarePen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ASSISTANT_LINKS,
  ASSISTANT_MESSAGE_MAX_LENGTH,
  type AssistantLink,
  type AssistantMessage,
} from '@/lib/assistant'
import { SUPPORT_MESSAGE_MAX_LENGTH, SUPPORT_TRANSCRIPT_LIMIT } from '@/lib/support'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'clyp-support-chat'

/**
 * Häufige Fragen je Bereich: Die Hilfe weiß, wo du gerade bist. Jede Frage
 * muss der Assistent aus seinem Wissen (`services/ai/assistant.ts`)
 * beantworten können.
 */
const TOPICS: { path: string; exact?: boolean; label: string; questions: string[] }[] = [
  {
    path: '/dashboard',
    exact: true,
    label: 'Übersicht',
    questions: ['Wie starte ich mein erstes Video?', 'Was kostet ein 60-Minuten-Video?', 'Wie bewertet Ocuris die Clips?'],
  },
  {
    path: '/dashboard/clips',
    label: 'Clips',
    questions: ['Wie bewertet Ocuris die Clips?', 'Wie ändere ich die Untertitel?', 'Wie schneide ich über das Transkript?'],
  },
  {
    path: '/dashboard/connections',
    label: 'Kanäle',
    questions: ['Wie verbinde ich TikTok?', 'Warum ist Vollautomatisch gesperrt?', 'Instagram lässt sich nicht verbinden'],
  },
  {
    path: '/dashboard/calendar',
    label: 'Kalender',
    questions: ['Wann wird mein Clip veröffentlicht?', 'Wie gebe ich einen Clip frei?', 'Warum ist mein YouTube-Upload privat?'],
  },
  {
    path: '/dashboard/billing',
    label: 'Abo',
    questions: ['Wann werden Credits abgebucht?', 'Verfallen ungenutzte Credits?', 'Kann ich Credits nachkaufen?'],
  },
  {
    path: '/dashboard/brand',
    label: 'Brand-Kits',
    questions: ['Was ist ein Brand-Kit?', 'Wie wende ich ein Brand-Kit an?', 'Wie ändere ich die Untertitel?'],
  },
]

const GENERAL = {
  label: 'Ocuris',
  questions: ['Wie starte ich mein erstes Video?', 'Was kostet ein Clip?', 'Wie verbinde ich TikTok?'],
}

function topicFor(pathname: string) {
  return (
    TOPICS.find(({ path, exact }) => pathname === path || (!exact && pathname.startsWith(path))) ?? GENERAL
  )
}

function isAssistantLink(value: unknown): value is AssistantLink {
  return typeof value === 'string' && value in ASSISTANT_LINKS
}

/**
 * Verlauf aus dem Tab — kaputte oder fremde Einträge fallen still weg.
 *
 * Ebenso eine Frage am Ende, auf die keine Antwort folgt: Deren Anfrage
 * starb mit der Seite (neu geladen, Dashboard verlassen) und kommt nicht
 * mehr. Ohne sie zeigt das Fenster wieder den Startbildschirm statt einer
 * Frage, die für immer unbeantwortet dasteht.
 */
function restoreMessages(): AssistantMessage[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(stored)) return []
    const messages = stored.flatMap((item): AssistantMessage[] =>
      (item?.role === 'user' || item?.role === 'assistant') && typeof item.text === 'string'
        ? [{
            role: item.role,
            text: item.text,
            links: Array.isArray(item.links) ? item.links.filter(isAssistantLink) : undefined,
            handoff: item.handoff === true || undefined,
          }]
        : [],
    )
    while (messages.at(-1)?.role === 'user') messages.pop()
    return messages
  } catch {
    return []
  }
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length

/** Abstand zwischen zwei Wörtern beim Einblenden — lange Antworten laufen schneller, keine länger als 1,4 s. */
function revealStep(text: string) {
  return Math.min(32, 1400 / Math.max(countWords(text), 1))
}

/** Bis das letzte Wort steht (`.support-word` dauert 520 ms) — danach kommen die Links. */
function revealDuration(text: string) {
  return Math.round(revealStep(text) * countWords(text)) + 400
}

/**
 * Die Antwort erscheint wie Untertitel: Wort für Wort, jedes leuchtet kurz
 * blau auf. Der Text steht dabei schon vollständig im DOM, Screenreader
 * lesen ihn sofort.
 */
function Reveal({ text }: { text: string }) {
  const step = revealStep(text)
  let word = 0
  return text.split(/(\s+)/).map((part, index) =>
    part.trim() ? (
      <span key={index} className="support-word" style={{ animationDelay: `${Math.round(word++ * step)}ms` }}>
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/** Das Logo im Glaskreis — Absender jeder Antwort. */
function OcurisAvatar({ size = 'sm', className }: { size?: 'sm' | 'lg'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'glass-lens flex shrink-0 items-center justify-center rounded-full',
        size === 'lg' ? 'size-10' : 'size-6',
        className,
      )}
    >
      {/* Die PNG hat viel Rand: beschnittener Rahmen + `scale`, wie in `AppSidebar`.
          Dieselbe Größe wie dort, damit das Bild schon im Cache liegt. */}
      <span className={cn('relative overflow-hidden', size === 'lg' ? 'size-6' : 'size-4')}>
        <Image src={LOGO} alt="" width={28} height={28} loading="eager" className="size-full scale-[1.45] object-contain" />
      </span>
    </span>
  )
}

/** Fünf Pegel einer Tonspur — „Ocuris denkt“, im Chat und im geschlossenen Knopf. */
function Waveform({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex h-3.5 items-center gap-[3px]', className)}>
      {[0.5, 1, 0.65, 0.9, 0.45].map((height, index) => (
        <span
          key={index}
          className="support-bar w-[3px] rounded-full bg-primary"
          style={{ height: `${height * 100}%`, animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  )
}

/**
 * Hilfe unten rechts.
 *
 * Geschlossen ein Tropfen in Logo-Blau, beim Überfahren dehnt er sich zur
 * Pille, beim Klick geht er zum Fenster auf — dieselbe Fläche, nur größer
 * (`.support-shell` in globals.css). Im Fenster beantwortet die KI Fragen zu
 * Ocuris (`/api/assistant`); die Vorschläge passen zur Seite, auf der man ist.
 * Kommt eine Antwort, während das Fenster zu ist, zeigt der Tropfen sie an.
 *
 * Kann die KI nicht helfen (`handoff`), oder will jemand lieber einen
 * Menschen, schreibt er im selben Fenster an das Team (`/api/support`) — mit
 * dem Chatverlauf, wenn er will. Die Antwort kommt per E-Mail.
 *
 * Nutzt nur Theme-Tokens. Die Clip-Seite eines Projekts ist immer dunkel
 * (`ProjectClips`), dort ist es die Hilfe auch.
 */
export function SupportWidget({ firstName, email }: { firstName?: string | null; email?: string | null }) {
  const pathname = usePathname()
  const topic = topicFor(pathname)
  const alwaysDark = /^\/dashboard\/clips\/[^/]+/.test(pathname)
  const panelId = useId()
  const [open, setOpen] = useState(false)
  // `null`, bis der Verlauf beim ersten Öffnen aus dem Tab gelesen wird —
  // vorher wird nichts gespeichert. Beim Rendern wäre es zu früh: Der Server
  // kennt den Tab-Speicher nicht, das HTML wiche ab.
  const [storedMessages, setMessages] = useState<AssistantMessage[] | null>(null)
  const messages = storedMessages ?? []
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Die Antwort, die gerade eingeblendet wird — nur die neueste, nie der Verlauf. */
  const [fresh, setFresh] = useState<number | null>(null)
  /** Antwort, die kam, während das Fenster zu war. */
  const [unread, setUnread] = useState<string | null>(null)
  /** Zählt das Öffnen mit, damit der Startbildschirm jedes Mal neu hereinfließt. */
  const [visit, setVisit] = useState(0)
  /** Chat mit der KI, Nachricht an das Team oder deren Bestätigung. */
  const [view, setView] = useState<'chat' | 'contact' | 'sent'>('chat')
  const [contactText, setContactText] = useState('')
  const openRef = useRef(false)
  const focusLauncher = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLElement>(null)
  const lastItem = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (!storedMessages) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedMessages))
    } catch {
      // Privater Modus oder voller Speicher: Der Verlauf lebt dann nur bis zum Neuladen.
    }
  }, [storedMessages])

  useEffect(() => {
    openRef.current = open
    if (open) {
      // Erst wenn das Fenster aufgegangen ist — sonst springt der Fokus in eine noch winzige Fläche.
      const timer = setTimeout(() => input.current?.focus({ preventScroll: true }), 220)
      return () => clearTimeout(timer)
    }
    if (focusLauncher.current) launcher.current?.focus({ preventScroll: true })
    focusLauncher.current = false
  }, [open])

  useEffect(() => {
    const box = scroller.current
    if (!box || !open) return
    // Lange Antworten von ihrem Anfang an zeigen, kurze bis zum Ende.
    const last = lastItem.current
    const top = last && last.offsetHeight > box.clientHeight - 32 ? last.offsetTop - 12 : box.scrollHeight
    box.scrollTo({ top, behavior: 'smooth' })
  }, [storedMessages, pending, error, open])

  // Klick irgendwo daneben schließt das Fenster. Der Fokus bleibt dort, wo
  // geklickt wurde — kein Zurückspringen auf den Tropfen.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => () => controller.current?.abort('unmounted'), [])

  async function ask(history: AssistantMessage[]) {
    const current = new AbortController()
    controller.current?.abort('superseded')
    controller.current = current
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, text }) => ({ role, text })), page: pathname }),
        signal: current.signal,
      })
      const data = (await response.json().catch(() => null)) as { answer?: string; links?: unknown[]; handoff?: boolean; error?: string } | null
      if (!response.ok || !data?.answer) throw new Error(data?.error ?? 'Der Assistent ist gerade nicht erreichbar.')
      const answer = data.answer
      setMessages((previous) => [
        ...(previous ?? []),
        { role: 'assistant', text: answer, links: data.links?.filter(isAssistantLink), handoff: data.handoff === true || undefined },
      ])
      setFresh(history.length)
      if (!openRef.current) setUnread(answer)
    } catch (cause) {
      if (current.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'Der Assistent ist gerade nicht erreichbar.')
    } finally {
      if (controller.current === current) {
        controller.current = null
        setPending(false)
      }
    }
  }

  function send(text: string) {
    const question = text.trim().slice(0, ASSISTANT_MESSAGE_MAX_LENGTH)
    if (!question || pending) return
    const next: AssistantMessage[] = [...messages, { role: 'user', text: question }]
    setMessages(next)
    setDraft('')
    void ask(next)
  }

  function stop() {
    controller.current?.abort('stopped')
    controller.current = null
    setPending(false)
    setError('Antwort abgebrochen.')
  }

  function restart() {
    controller.current?.abort('reset')
    controller.current = null
    setPending(false)
    setError(null)
    setFresh(null)
    setMessages([])
    setView('chat')
    setVisit((count) => count + 1)
    input.current?.focus()
  }

  /** Zur Nachricht an das Team; aus der Übergabe mit der letzten Frage als Anfang. */
  function openContact(prefill = '') {
    setContactText((current) => current.trim() ? current : prefill)
    setView('contact')
  }

  function openPanel() {
    setMessages((current) => current ?? restoreMessages())
    // Eine Antwort, die im Hintergrund kam, läuft beim Öffnen ein; alles andere steht schon.
    if (!unread) setFresh(null)
    setUnread(null)
    setVisit((count) => count + 1)
    setOpen(true)
  }

  function close() {
    focusLauncher.current = true
    setOpen(false)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    send(draft)
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send(draft)
    }
  }

  const lastIsQuestion = messages.at(-1)?.role === 'user'
  const lastQuestion = messages.findLast((message) => message.role === 'user')?.text ?? ''
  const handoff = !pending && !error && messages.at(-1)?.role === 'assistant' && messages.at(-1)?.handoff === true

  return (
    <aside ref={root} aria-label="Hilfe" className={cn('fixed right-3 bottom-3 z-40 text-foreground sm:right-6 sm:bottom-6', alwaysDark && 'dark')}>
      {/* Antwort im Hintergrund: eine Sprechblase über dem Tropfen. */}
      {unread && !open ? (
        <div className="support-pop glass-menu absolute right-0 bottom-[calc(100%+0.75rem)] w-[min(17rem,calc(100vw-1.5rem))] rounded-2xl rounded-br-md">
          <button
            type="button"
            onClick={openPanel}
            className="flex w-full items-start gap-2.5 rounded-[inherit] p-3 pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <OcurisAvatar />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">Ocuris hat geantwortet</span>
              <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{unread}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Hinweis ausblenden"
            onClick={() => setUnread(null)}
            className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <div data-open={open || undefined} data-busy={(pending && !open) || undefined} className="support-shell glass-menu relative overflow-hidden">
        {/* Der Tropfen: liegt geschlossen über dem Glas und löst sich beim Öffnen darin auf. */}
        <span aria-hidden className="support-drop liquid pointer-events-none absolute inset-0 rounded-[inherit]" />

        <button
          ref={launcher}
          type="button"
          inert={open}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={unread ? 'Hilfe öffnen, neue Antwort' : 'Hilfe öffnen'}
          onClick={openPanel}
          className="support-launch absolute inset-0 flex items-center justify-end gap-2 rounded-[inherit] pr-[0.9375rem] text-[var(--liquid-fg)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="support-label font-display text-sm font-semibold whitespace-nowrap">Hilfe</span>
          {/* Sprechblase mit Tonspur: Fragen an Ocuris. Die Pegel federn beim
              Überfahren und solange eine Antwort entsteht. */}
          <svg viewBox="0 0 24 24" className="size-[22px] shrink-0" fill="none" aria-hidden>
            <path
              d="M7.5 3.5h9a4 4 0 0 1 4 4v5.5a4 4 0 0 1-4 4h-4.75L7.4 20.2a.6.6 0 0 1-.9-.52V17a4 4 0 0 1-3-3.87V7.5a4 4 0 0 1 4-4Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {[
              { x: 8.25, h: 3.5 },
              { x: 11.25, h: 6.5 },
              { x: 14.25, h: 4.5 },
            ].map(({ x, h }, index) => (
              <rect
                key={x}
                x={x}
                y={10.25 - h / 2}
                width="1.8"
                height={h}
                rx="0.9"
                fill="currentColor"
                className="support-glyph-bar"
                style={{ animationDelay: `${index * 130}ms` }}
              />
            ))}
          </svg>
        </button>

        <div
          id={panelId}
          role="dialog"
          aria-label="Hilfe-Assistent"
          inert={!open}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
          }}
          className="support-panel absolute right-0 bottom-0 flex flex-col"
        >
          {/* Dasselbe Licht wie über der Übersicht: Blau von oben. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(ellipse_75%_100%_at_50%_-10%,var(--brand-glow),transparent_72%)]"
          />

          <header className="relative flex items-center gap-3 px-4 pt-4 pb-3">
            <span className="relative">
              <OcurisAvatar size="lg" />
              <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-emerald-500 ring-[2.5px] ring-[var(--glass-menu)]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[15px] leading-tight font-semibold tracking-tight">Ocuris Hilfe</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {view === 'chat' ? 'KI-Assistent · antwortet in Sekunden' : 'Das Team · antwortet per E-Mail'}
              </p>
            </div>
            {view === 'chat' ? (
              <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" aria-label="An das Team schreiben" title="An das Team schreiben" onClick={() => openContact()}>
                <Mail />
              </Button>
            ) : null}
            {messages.length && view === 'chat' ? (
              <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" aria-label="Neues Gespräch" title="Neues Gespräch" onClick={restart}>
                <SquarePen />
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" aria-label="Hilfe minimieren" title="Minimieren" onClick={close}>
              <ChevronDown />
            </Button>
          </header>

          {view === 'chat' ? (
            <>
              <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [scrollbar-width:thin]">
                {messages.length === 0 ? (
                  <div key={visit} className="flex min-h-full flex-col justify-end gap-6 pb-3">
                    <div className="support-rise" style={{ '--rise-delay': '120ms' } as CSSProperties}>
                      <p className="font-display text-[26px] leading-[1.12] font-semibold tracking-[-0.03em] text-balance">
                        <span className="text-muted-foreground">Hallo{firstName ? ` ${firstName}` : ''},</span>
                        <br />
                        wobei kann ich helfen?
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Frag nach Funktionen, Kanälen oder Credits — ich zeige dir den Weg.
                      </p>
                    </div>

                    <section aria-label={`Häufig gefragt: ${topic.label}`} className="support-rise" style={{ '--rise-delay': '200ms' } as CSSProperties}>
                      <p className="mb-2 px-1 text-[11px] font-medium text-muted-foreground">
                        Häufig gefragt · <span className="text-primary">{topic.label}</span>
                      </p>
                      <ul className="divide-y divide-foreground/[0.06] overflow-hidden rounded-2xl bg-foreground/[0.035] ring-1 ring-foreground/[0.06]">
                        {topic.questions.map((question) => (
                          <li key={question}>
                            <button
                              type="button"
                              onClick={() => {
                                send(question)
                                // Der Knopf verschwindet mit dem Startbildschirm — der Fokus gehört ins Eingabefeld.
                                input.current?.focus({ preventScroll: true })
                              }}
                              className="group flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-[13px] transition-colors outline-none hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                            >
                              {question}
                              <ArrowRight
                                className="size-3.5 shrink-0 text-muted-foreground transition-[color,translate] duration-300 ease-[var(--ease-spring)] group-hover:translate-x-0.5 group-hover:text-primary"
                                aria-hidden
                              />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <button
                      type="button"
                      onClick={() => openContact()}
                      className="support-rise group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 ring-foreground/[0.06] transition-colors outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ '--rise-delay': '280ms' } as CSSProperties}
                    >
                      <Mail className="size-4 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1 text-[13px]">
                        Lieber mit einem Menschen?
                        <span className="block truncate text-xs text-muted-foreground">Schreib dem Team, wir antworten per E-Mail</span>
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <ol className="flex flex-col gap-4 py-3" aria-live="polite" aria-relevant="additions">
                    {messages.map((message, index) => {
                      const isLast = index === messages.length - 1 && !pending && !error
                      if (message.role === 'user') {
                        return (
                          <li
                            key={index}
                            ref={isLast ? lastItem : undefined}
                            className="support-send ml-auto max-w-[85%] rounded-[1.15rem] rounded-br-md bg-primary px-3.5 py-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-primary-foreground"
                          >
                            {message.text}
                          </li>
                        )
                      }
                      const revealing = index === fresh && open
                      return (
                        <li key={index} ref={isLast ? lastItem : undefined} className="flex gap-2.5">
                          <OcurisAvatar className="mt-px" />
                          <div className="min-w-0 flex-1 pt-0.5 text-[13px] leading-relaxed break-words whitespace-pre-line">
                            {revealing ? <Reveal text={message.text} /> : message.text}
                            {message.links?.length ? (
                              <div
                                className={cn('mt-2.5 flex flex-wrap gap-1.5', revealing && 'support-rise')}
                                style={revealing ? ({ '--rise-delay': `${revealDuration(message.text)}ms` } as CSSProperties) : undefined}
                              >
                                {message.links.map((href) => (
                                  <Link
                                    key={href}
                                    href={href}
                                    onClick={() => setOpen(false)}
                                    className="group inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/20 transition-colors outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {ASSISTANT_LINKS[href]}
                                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                                  </Link>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                    {pending ? (
                      <li className="support-rise flex items-center gap-2.5" aria-label="Ocuris schreibt">
                        <OcurisAvatar />
                        <span className="flex items-center gap-2.5 rounded-full bg-foreground/[0.05] py-2 pr-3.5 pl-3 ring-1 ring-foreground/[0.06]">
                          <Waveform />
                          <span className="text-shimmer text-xs">Ocuris sucht die Antwort …</span>
                        </span>
                      </li>
                    ) : null}
                    {handoff ? (
                      <li className="support-rise ml-8" style={{ '--rise-delay': `${fresh === messages.length - 1 && open ? revealDuration(messages.at(-1)!.text) : 0}ms` } as CSSProperties}>
                        <button
                          type="button"
                          onClick={() => openContact(lastQuestion)}
                          className="group flex w-full items-center gap-3 rounded-2xl bg-primary/[0.07] px-3.5 py-3 text-left ring-1 ring-primary/25 transition-colors outline-none hover:bg-primary/[0.11] focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Mail className="size-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1 text-[13px] font-medium">
                            An das Team schreiben
                            <span className="block text-xs font-normal text-muted-foreground">Mit diesem Chatverlauf, Antwort per E-Mail</span>
                          </span>
                          <ArrowRight className="size-3.5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </button>
                      </li>
                    ) : null}
                    {error ? (
                      <li role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <span>{error}</span>
                        {lastIsQuestion ? (
                          <button type="button" onClick={() => void ask(messages)} className="font-medium underline underline-offset-2">
                            Erneut versuchen
                          </button>
                        ) : null}
                        <button type="button" onClick={() => openContact(lastQuestion)} className="font-medium underline underline-offset-2">
                          An das Team schreiben
                        </button>
                      </li>
                    ) : null}
                  </ol>
                )}
              </div>

              <form onSubmit={onSubmit} className="relative px-3 pt-2 pb-3">
                <div className="glass-field flex items-end gap-2 rounded-[1.25rem] p-1.5 pl-3.5 transition-shadow focus-within:ring-2 focus-within:ring-primary/35">
                  <textarea
                    ref={input}
                    rows={1}
                    value={draft}
                    maxLength={ASSISTANT_MESSAGE_MAX_LENGTH}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    placeholder="Frag etwas zu Ocuris …"
                    aria-label="Deine Frage"
                    className="max-h-28 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13px] leading-5 outline-none [field-sizing:content] placeholder:text-muted-foreground"
                  />
                  {pending ? (
                    <button type="button" onClick={stop} aria-label="Antwort stoppen" className="liquid liquid-press flex size-8 shrink-0 items-center justify-center rounded-full">
                      <Square className="size-3 fill-current" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label="Frage senden"
                      className="liquid liquid-press flex size-8 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-25"
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-center text-[10px] text-muted-foreground">KI-Antworten können Fehler enthalten.</p>
              </form>
            </>
          ) : (
            <SupportContact
              key={view}
              view={view}
              email={email ?? null}
              text={contactText}
              onTextChange={setContactText}
              transcript={messages}
              page={pathname}
              onSent={() => {
                setContactText('')
                setView('sent')
              }}
              onBack={() => setView('chat')}
            />
          )}
        </div>
      </div>

      {unread && !open ? (
        <span aria-hidden className="support-pop absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-foreground ring-[2.5px] ring-background" />
      ) : null}
    </aside>
  )
}

/**
 * Nachricht an das Team — im selben Fenster wie der Chat. Absender ist das
 * angemeldete Konto, die Antwort kommt per E-Mail. Der Chatverlauf geht nur
 * mit, wenn das Häkchen gesetzt ist.
 */
function SupportContact({ view, email, text, onTextChange, transcript, page, onSent, onBack }: {
  view: 'contact' | 'sent'
  email: string | null
  text: string
  onTextChange: (text: string) => void
  transcript: AssistantMessage[]
  page: string
  onSent: () => void
  onBack: () => void
}) {
  const [withTranscript, setWithTranscript] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const checkboxId = useId()
  const recent = transcript.slice(-SUPPORT_TRANSCRIPT_LIMIT)
  const address = email ? <span className="font-medium text-foreground">{email}</span> : 'die Adresse deines Kontos'

  useEffect(() => {
    const element = field.current
    if (!element) return
    element.focus({ preventScroll: true })
    // Vorausgefüllt aus dem Chat: Weiterschreiben am Ende, nicht davor.
    element.setSelectionRange(element.value.length, element.value.length)
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const message = text.trim()
    if (!message || pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          transcript: withTranscript ? recent.map(({ role, text: entry }) => ({ role, text: entry })) : [],
          page,
        }),
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(data?.error ?? 'Deine Nachricht konnte nicht gesendet werden.')
      onSent()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Deine Nachricht konnte nicht gesendet werden.')
      setPending(false)
    }
  }

  if (view === 'sent') {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-6 text-center">
        <span className="support-rise grid size-12 place-content-center rounded-full bg-primary/10 ring-1 ring-primary/30">
          <Check className="size-5 text-primary" aria-hidden />
        </span>
        <p role="status" className="support-rise mt-4 font-display text-xl font-semibold tracking-tight" style={{ '--rise-delay': '80ms' } as CSSProperties}>
          Nachricht ist angekommen
        </p>
        <p className="support-rise mt-1.5 max-w-[16rem] text-xs leading-relaxed text-muted-foreground" style={{ '--rise-delay': '140ms' } as CSSProperties}>
          Wir antworten dir per E-Mail an {address}.
        </p>
        <Button variant="outline" size="sm" className="support-rise mt-5 rounded-full" style={{ '--rise-delay': '200ms' } as CSSProperties} onClick={onBack}>
          Zurück zum Chat
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 [scrollbar-width:thin]">
        <div className="support-rise pt-1">
          <p className="font-display text-[22px] leading-[1.15] font-semibold tracking-[-0.03em]">Nachricht an das Team</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Ein Mensch liest mit. Wir antworten per E-Mail an {address}.
          </p>
        </div>

        <textarea
          ref={field}
          value={text}
          maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Was ist passiert? Je genauer, desto schneller können wir helfen."
          aria-label="Dein Anliegen"
          className="glass-field support-rise mt-4 block min-h-36 w-full resize-none rounded-2xl px-3.5 py-3 text-[13px] leading-5 outline-none [field-sizing:content] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/35"
          style={{ '--rise-delay': '60ms' } as CSSProperties}
        />

        {recent.length ? (
          <div className="support-rise mt-3 flex items-center gap-2.5 text-xs" style={{ '--rise-delay': '120ms' } as CSSProperties}>
            <input
              id={checkboxId}
              type="checkbox"
              checked={withTranscript}
              onChange={(event) => setWithTranscript(event.target.checked)}
              className="size-4 shrink-0 accent-[var(--primary)]"
            />
            <label htmlFor={checkboxId} className="cursor-pointer">
              Chatverlauf mitschicken ({recent.length} {recent.length === 1 ? 'Nachricht' : 'Nachrichten'})
            </label>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}

        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          Wir speichern deine Nachricht, um sie zu beantworten.{' '}
          <Link href="/datenschutz#m182" className="underline underline-offset-2 hover:text-foreground">Datenschutz</Link>
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 pt-2 pb-3">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-full text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
          Zurück
        </Button>
        <button
          type="submit"
          disabled={!text.trim() || pending}
          className="liquid liquid-press ml-auto flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-opacity disabled:opacity-40"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
          Senden
        </button>
      </div>
    </form>
  )
}
