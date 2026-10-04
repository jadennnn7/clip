'use client'

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, ArrowRight, Check, FileVideo, Link2, Upload, X } from 'lucide-react'
import { importLocalVideo } from '@/lib/local-media'
import { startLinkImport } from '@/lib/link-import'
import { classifyLink, findLinkInText } from '@/lib/links'
import { EDITOR_ENABLED } from '@/lib/features'
import { cn } from '@/lib/utils'
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from '@/types/workspace'
import { Button } from '@/components/ui/button'
import { NEW_PROJECT_ANCHOR, NEW_PROJECT_EVENT } from '@/components/dashboard/new-project'

/**
 * `working`: der Server prüft den Link, holt Titel und reiht den Job ein.
 * `done`: Antwort ist da, die Seite wechselt gerade — bis dahin bleibt die
 * Leiste im Ladezustand, statt kurz leer aufzublitzen.
 */
type Phase = 'idle' | 'working' | 'done'

export function IntakeBar() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [settings] = useState<ProjectSettings>({ ...DEFAULT_PROJECT_SETTINGS })
  const [phase, setPhase] = useState<Phase>('idle')
  const busy = phase !== 'idle'
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const focusIntake = () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      rootRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
      urlInputRef.current?.focus({ preventScroll: true })
    }
    if (window.location.hash === `#${NEW_PROJECT_ANCHOR}`) focusIntake()
    window.addEventListener(NEW_PROJECT_EVENT, focusIntake)
    return () => window.removeEventListener(NEW_PROJECT_EVENT, focusIntake)
  }, [])

  const acceptFile = useCallback((files: FileList | null) => {
    const picked = files?.[0]
    if (!picked) return
    if (!picked.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(picked.name)) {
      setError('Bitte eine Videodatei auswählen, zum Beispiel MP4 oder WebM.')
      return
    }
    if (picked.size > 500 * 1024 * 1024) {
      setError('Für den lokalen Workspace bitte eine Datei unter 500 MB verwenden.')
      return
    }
    setError(null)
    setFile(picked)
    setUrl('')
  }, [])

  const start = async (pastedUrl?: string) => {
    if (busy) return
    setError(null)
    const value = (pastedUrl ?? url).trim()
    if (!file && !value) {
      setError('Füge einen Videolink ein oder wähle eine Datei aus.')
      urlInputRef.current?.focus()
      return
    }
    if (!file && !classifyLink(value)) {
      setError('Bitte einen gültigen HTTPS-Link von YouTube oder Google Drive einfügen.')
      return
    }
    setPhase('working')
    try {
      if (file) {
        const id = await importLocalVideo(file, settings)
        setPhase('done')
        toast.success('Video importiert', { description: 'Dein erster Clip ist zum manuellen Schnitt bereit.' })
        router.push(`/dashboard/projects/${id}`)
      } else {
        // Die Rechtebestätigung ist der Start selbst — der Hinweis steht
        // dauerhaft unter dem Feld und wird mit dem Projekt protokolliert
        // (`rights_confirmed_at`). Danach geht es dorthin, wo die Clips entstehen.
        const { projectId, title, publishing } = await startLinkImport(value, settings)
        setPhase('done')
        toast.success('Clips werden erstellt', {
          description: publishing?.message ?? `„${title}" wird geladen, transkribiert und geschnitten. Den Veröffentlichungsstatus siehst du bei den Clips.`,
        })
        router.push(`/dashboard/clips/${projectId}`)
      }
    } catch (cause) {
      setPhase('idle')
      setError(cause instanceof Error ? cause.message : 'Das Video konnte nicht importiert werden. Bitte erneut versuchen.')
    }
  }

  // Eingefügter Link startet sofort — das ist das Versprechen des Produkts.
  // Getippte Links brauchen weiter Enter oder den Knopf.
  const acceptPaste = (text: string): boolean => {
    const pasted = findLinkInText(text)
    if (!pasted || busy) return false
    setFile(null)
    setUrl(pasted)
    setError(null)
    void start(pasted)
    return true
  }
  const acceptPasteRef = useRef(acceptPaste)
  useEffect(() => { acceptPasteRef.current = acceptPaste })

  // Auch ohne Fokus im Feld: Wer auf der Übersicht ⌘V drückt, meint das Video.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if (acceptPasteRef.current(event.clipboardData?.getData('text') ?? '')) event.preventDefault()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const link = file ? null : classifyLink(url)
  const thumbnail = busy && link?.source === 'youtube' ? youtubeThumbnail(link.url) : null

  return (
    // Leichtes Glas (`.glass`: Mattierung, Lichtkante, Schatten) in ruhiger
    // Form — das Feld ist ein Werkzeug, kein Schmuckstück. Fokus legt einen
    // Ring im Logo-Blau um die Fläche; der Glasschatten bleibt dabei stehen.
    <div
      ref={rootRef}
      // Eigene Dateien landen im Editor — solange er aus ist (`lib/features.ts`),
      // nimmt das Feld nur Links an.
      {...(EDITOR_ENABLED ? {
        onDragOver: (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); if (!busy) setIsDragging(true) },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false) },
        onDrop: (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); if (!busy) acceptFile(event.dataTransfer.files) },
      } : {})}
      className={cn(
        'glass group/intake rounded-2xl text-left',
        'transition-[box-shadow] duration-300 ease-(--ease-out-quint)',
        'focus-within:[box-shadow:0_0_0_1px_color-mix(in_oklab,var(--primary)_60%,transparent),0_0_0_5px_color-mix(in_oklab,var(--primary)_15%,transparent),var(--glass-shadow)]',
      )}
      aria-busy={busy}
    >
      {/* Lichtkante, solange gestartet wird — liegt genau auf dem Glasrand. */}
      {busy && <span aria-hidden className="intake-sheen inset-0 rounded-[inherit]" />}

      {/* ── Obere Zone: Link oder gewählte Datei ────────────────── */}
      <div className="flex items-center gap-3 p-2 pl-4">
        {file ? <>
          <FileVideo className={cn('size-4 shrink-0 transition-colors', busy ? 'text-primary' : 'text-muted-foreground/60')} />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground/80 font-medium">{file.name}</p>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground/50 tabular-nums mr-1">
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.06]', busy && 'hidden')}
            aria-label="Datei entfernen"
            disabled={busy}
            onClick={() => setFile(null)}
          >
            <X className="size-3.5" />
          </Button>
        </> : <>
          <SourceMark thumbnail={thumbnail} />
          <input
            ref={urlInputRef}
            aria-label="Videolink"
            placeholder="YouTube- oder Drive-Link einfügen"
            disabled={busy}
            value={url}
            onChange={(event) => { setUrl(event.target.value); setError(null) }}
            onPaste={(event) => { if (acceptPaste(event.clipboardData.getData('text'))) event.preventDefault() }}
            onKeyDown={(event) => { if (event.key === 'Enter') void start() }}
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none transition-colors duration-300 placeholder:text-muted-foreground/60 disabled:text-foreground/55"
          />
        </>}
        {/* Die blaue Hauptaktion, konzentrisch zur Fläche gerundet und ohne
            Schein darunter. Beim Laden bleibt die Beschriftung stehen, nur der
            Pfeil wird zum Kreisel — so springt weder der Knopf noch das Feld. */}
        <Button
          onClick={() => void start()}
          disabled={busy}
          variant="prominent"
          size="lg"
          className="h-11 shrink-0 gap-1.5 rounded-xl px-4.5 tracking-tight shadow-[inset_0_1px_0_rgb(255_255_255/0.3),inset_0_-1px_0_rgb(0_0_0/0.15),0_1px_2px_rgb(0_0_0/0.25)] disabled:opacity-100"
        >
          <span className="max-sm:sr-only">{file ? 'Im Editor öffnen' : 'Clips erstellen'}</span>
          {busy ? <Spinner className="size-4" /> : <ArrowRight className="size-4" />}
        </Button>
      </div>

      {/* ── Fehlermeldung ─────────────────────────────────────── */}
      {error && (
        <p
          role="alert"
          className="mx-2 mb-2 flex items-start gap-2 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-xs leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0 opacity-80" />
          {error}
        </p>
      )}

      {/* ── Fußzeile: Datei-Upload oder, beim Start, die Schritte ─── */}
      {busy || EDITOR_ENABLED ? <div className="rounded-b-[inherit] border-t border-foreground/[0.07] bg-foreground/[0.02]">
        {busy ? (
          <IntakeSteps
            key="steps"
            phase={phase}
            labels={file
              ? ['Videodatei erkannt', phase === 'working' ? 'Wird importiert' : 'Importiert', phase === 'done' ? 'Editor wird geöffnet' : 'Editor öffnen']
              : [
                `${link?.source === 'drive' ? 'Drive' : 'YouTube'}-Link erkannt`,
                phase === 'working' ? 'Video wird abgerufen' : 'Video gefunden',
                phase === 'done' ? 'Clips werden geöffnet' : 'Clips öffnen',
              ]}
          />
        ) : (
          <div className="flex h-11 items-center gap-1.5 px-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg text-xs font-medium text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Datei hochladen
            </Button>
            <span className="select-none text-xs text-muted-foreground/50 max-sm:hidden">oder hierher ziehen</span>
          </div>
        )}
      </div> : null}

      {/* ── Drag-Overlay ──────────────────────────────────────── */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[inherit] border-2 border-dashed border-primary/60 bg-background/85 backdrop-blur-md">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
            <Upload className="size-[18px] text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Videodatei ablegen</p>
            <p className="mt-0.5 text-xs text-muted-foreground">MP4, WebM oder MOV · bis 500 MB</p>
          </div>
        </div>
      )}

      {EDITOR_ENABLED ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.webm,.mov,.m4v"
          className="hidden"
          disabled={busy}
          onChange={(event) => { acceptFile(event.target.files); event.target.value = '' }}
        />
      ) : null}
    </div>
  )
}

/**
 * Vorschaubild direkt aus der Video-ID — das Bild steht, bevor der Server
 * antwortet, und bestätigt auf einen Blick: Das ist das richtige Video.
 */
function youtubeThumbnail(url: string): string | null {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  const id = parsed.hostname === 'youtu.be'
    ? parsed.pathname.slice(1)
    : parsed.searchParams.get('v') ?? parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1]
  return id && /^[\w-]{11}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
}

/**
 * Links vor dem Feld: das Link-Symbol, beim Start das Vorschaubild. Der Platz
 * wächst erst, wenn das Bild geladen ist — ein fehlendes Bild schiebt nichts.
 */
function SourceMark({ thumbnail }: { thumbnail: string | null }) {
  const [loaded, setLoaded] = useState<string | null>(null)
  const ready = thumbnail !== null && loaded === thumbnail
  return (
    <span
      className={cn(
        'relative flex h-8 shrink-0 items-center transition-[width,margin] duration-500 ease-(--ease-out-quint)',
        ready ? '-ml-2.5 w-14' : 'w-4',
      )}
    >
      <Link2
        className={cn(
          'size-4 text-muted-foreground/60 transition-[color,opacity] duration-200 group-focus-within/intake:text-primary',
          ready && 'opacity-0',
        )}
      />
      {thumbnail && (
        // Externes Bild in fester Kleinstgröße — `next/image` bräuchte dafür
        // eine Domain-Freigabe und brächte nichts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt=""
          // Unbekannte IDs liefern statt eines Fehlers YouTubes graues
          // 120er-Platzhalterbild — das echte `mqdefault` ist 320 breit.
          onLoad={(event) => { if (event.currentTarget.naturalWidth > 120) setLoaded(thumbnail) }}
          className={cn(
            'absolute inset-y-0 left-0 h-8 w-14 rounded-lg object-cover ring-1 ring-foreground/10',
            ready ? 'intake-thumb-in' : 'opacity-0',
          )}
        />
      )}
    </span>
  )
}

/**
 * Drei Schritte, alle echt: Der Link ist beim Start schon geprüft (im
 * Browser), der mittlere dauert, bis der Server antwortet, der letzte läuft,
 * während die Clip-Seite lädt.
 */
function IntakeSteps({ phase, labels }: { phase: Phase; labels: [string, string, string] }) {
  const current = phase === 'working' ? 1 : 2
  return (
    <div role="status" aria-live="polite" className="rise-in flex h-11 items-center gap-2 px-4 sm:gap-3">
      {labels.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'pending'
        return (
          <div key={index} className="flex min-w-0 items-center gap-2 sm:gap-3">
            {index > 0 && (
              <span aria-hidden className="relative h-px w-4 shrink-0 overflow-hidden rounded-full bg-foreground/10 sm:w-8">
                <span
                  className={cn(
                    'absolute inset-0 origin-left bg-primary/70 transition-transform duration-500 ease-(--ease-out-quint)',
                    state === 'pending' ? 'scale-x-0' : 'scale-x-100',
                  )}
                />
              </span>
            )}
            <span className="flex min-w-0 items-center gap-1.5">
              <StepMark state={state} />
              <span
                className={cn(
                  'truncate text-xs transition-colors duration-300',
                  state === 'active' && 'text-shimmer font-medium',
                  state === 'done' && 'text-muted-foreground/70',
                  state === 'pending' && 'text-muted-foreground/35',
                  state !== 'active' && 'max-sm:hidden',
                )}
              >
                {label}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function StepMark({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <span className="intake-thumb-in flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-2.5" strokeWidth={3.5} />
      </span>
    )
  }
  if (state === 'active') return <Spinner className="size-4 shrink-0 text-primary" />
  return <span className="size-4 shrink-0 rounded-full border border-foreground/15" />
}

/** Ring mit laufendem Bogen — ruhiger als das offene Lucide-Symbol. */
function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn('animate-spin', className)}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.75" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}
