'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { isLocalVideoProject } from '@/lib/local-media'
import { accountsInPlan, useSocialAccounts } from '@/lib/publishing-client'
import { ensureUploaded } from '@/lib/render-client'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'
import { refreshPublishingQueue } from '@/stores/publishing-queue-store'
import type { Clip, Project } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'

type When = 'now' | 'later'

/**
 * Veröffentlichen direkt aus der Clip-Vorschau: verbundene Kanäle wählen,
 * Zeitpunkt, Beschreibung. Das Ergebnis landet in derselben Queue wie im
 * Kalender. Der Klick ist die Freigabe — auch Kanäle mit Freigabe-Queue
 * warten danach nicht noch einmal. Gerendert wird der Clip so, wie er gerade
 * bearbeitet ist.
 */
export function PublishPanel({ clip, project, removedWords, outputFormat, onBack, onClose }: {
  clip: Clip
  project: Project
  removedWords: number[]
  outputFormat: OutputFormat
  onBack: () => void
  onClose: () => void
}) {
  const router = useRouter()
  const connection = useSocialAccounts()
  const capabilities = connection.data?.capabilities
  // Nur Kanäle, die der Tarif umfasst — der Server lehnt die übrigen ab.
  const inPlan = accountsInPlan(connection.data?.accounts ?? [], connection.data?.channelLimit)
  const accounts = (connection.data?.accounts ?? [])
    .filter((account) => account.status === 'active' && capabilities?.[account.platform]?.configured && inPlan.has(account.id))
  const setupError = connection.data?.configured === false ? connection.data.error : connection.error?.message

  // Vorauswahl: alle Kanäle — bis der Nutzer selbst etwas an- oder abwählt.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const selected = picked ?? new Set(accounts.map((account) => account.id))
  const [submitting, setSubmitting] = useState(false)
  const [when, setWhen] = useState<When>('now')
  // Bezugspunkt für „liegt in der Vergangenheit“; beim Absenden wird mit der echten Uhrzeit nachgeprüft.
  const [openedAt] = useState(() => Date.now())
  const [at, setAt] = useState(() => {
    const next = new Date(openedAt)
    next.setHours(next.getHours() + 1, 0, 0, 0)
    return toLocalInput(next)
  })
  const [caption, setCaption] = useState(() => defaultCaption(clip))

  const chosen = accounts.filter((account) => selected.has(account.id))
  const publishAt = when === 'now' ? null : new Date(at)
  const inPast = publishAt !== null && (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() < openedAt)
  const ready = chosen.length > 0 && !inPast && !submitting

  const toggle = (id: string) => setPicked(() => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const submit = async () => {
    if (!ready) return
    if (publishAt && isPast(publishAt)) {
      toast.error('Der Zeitpunkt liegt inzwischen in der Vergangenheit')
      return
    }
    setSubmitting(true)
    try {
      // Hochgeladene Videos liegen bis zum ersten Render nur im Browser.
      if (isLocalVideoProject(project)) await ensureUploaded(project.id)
      const response = await fetch('/api/publishing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          sourceJobId: project.trigger_run_id,
          clip,
          removedWords,
          outputFormat,
          accountIds: chosen.map((account) => account.id),
          publishAt: publishAt?.toISOString() ?? null,
          caption: caption.trim(),
        }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(data?.error ?? 'Der Clip konnte nicht eingeplant werden.')
      void refreshPublishingQueue()
      const channels = chosen.map((account) => PLATFORM_LABEL[account.platform]).join(', ')
      toast.success(when === 'later' ? 'Eingeplant' : 'Wird veröffentlicht', {
        description: publishAt ? `${channels} · ${formatWhen(publishAt)}` : channels,
        action: { label: 'Zur Queue', onClick: () => router.push('/dashboard/calendar') },
      })
      onBack()
    } catch (error) {
      toast.error('Nicht veröffentlicht', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <header className="flex items-center gap-2 px-4 pb-4 pt-4 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Zurück zur Vorschau"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h2 id="preview-title" className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-.01em]">Veröffentlichen</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Vorschau schließen"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-7 overflow-y-auto px-6 pb-6 pt-2">
        <section>
          <h3 className="mb-2.5 text-xs font-medium text-white/45">Kanäle</h3>
          {accounts.length ? (
            <ul className="space-y-1.5">
              {accounts.map((account) => {
                const on = selected.has(account.id)
                return (
                  <li key={account.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(account.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                        on ? 'bg-white/[.08]' : 'hover:bg-white/[.04]',
                      )}
                    >
                      <PlatformIcon
                        platform={account.platform}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-[11px] font-semibold text-white/80"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{PLATFORM_LABEL[account.platform]}</span>
                        <span className="block truncate text-xs text-white/45">{account.platform_username}</span>
                        {/* Was die Plattform ohne Freigabe nicht zulässt, z. B. private Uploads bis zum YouTube-Audit. */}
                        {capabilities?.[account.platform] && !capabilities[account.platform].canAutoPublish && capabilities[account.platform].notice ? (
                          <span className="mt-1 block text-[11px] leading-snug text-white/40">{capabilities[account.platform].notice}</span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full ring-1 transition',
                          on ? 'bg-primary text-primary-foreground ring-primary' : 'ring-foreground/25',
                        )}
                      >
                        {on ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : connection.loading ? (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-5 text-xs text-white/45">
              <Loader2 className="size-3.5 animate-spin" /> Kanäle werden geladen …
            </p>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs leading-relaxed text-white/45">
              <p>{setupError ?? 'Noch kein Kanal verbunden.'}</p>
              {setupError ? null : (
                <Link href="/dashboard/connections" className="mt-2 inline-block font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  Kanal verbinden
                </Link>
              )}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2.5 text-xs font-medium text-white/45">Zeitpunkt</h3>
          <div role="radiogroup" aria-label="Zeitpunkt" className="grid grid-cols-2 gap-1 rounded-xl bg-white/[.05] p-1">
            {([['now', 'Sofort'], ['later', 'Einplanen']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={when === value}
                onClick={() => setWhen(value)}
                className={cn(
                  'rounded-lg py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                  when === value ? 'bg-white/[.12] text-white shadow-sm' : 'text-white/50 hover:text-white/80',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {when === 'later' ? (
            <input
              type="datetime-local"
              aria-label="Datum und Uhrzeit"
              value={at}
              min={toLocalInput(new Date(openedAt))}
              onChange={(event) => setAt(event.target.value)}
              className="mt-2 w-full glass-field rounded-xl px-3 py-2 text-sm text-foreground [color-scheme:dark] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
          ) : null}
          {inPast ? <p className="mt-1.5 text-xs text-amber-400">Der Zeitpunkt liegt in der Vergangenheit.</p> : null}
        </section>

        <section>
          <label htmlFor="publish-caption" className="mb-2.5 flex items-baseline justify-between text-xs font-medium text-white/45">
            Beschreibung
            <span className="font-normal tabular-nums text-white/30">{caption.length}/2200</span>
          </label>
          <textarea
            id="publish-caption"
            value={caption}
            maxLength={2200}
            rows={5}
            onChange={(event) => setCaption(event.target.value)}
            className="w-full resize-none glass-field rounded-xl px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            placeholder="Was soll unter dem Clip stehen?"
          />
        </section>
      </div>

      <footer className="border-t border-border bg-background px-6 py-5 max-lg:sticky max-lg:bottom-0">
        <button
          type="button"
          onClick={() => { void submit() }}
          disabled={!ready}
          className="liquid flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-[transform,filter] duration-500 ease-spring hover:brightness-110 active:scale-[0.98] active:duration-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {when === 'now' ? 'Jetzt veröffentlichen' : 'Einplanen'}
          {chosen.length > 1 ? <span className="font-normal opacity-75">· {chosen.length} Kanäle</span> : null}
        </button>
        <p className="mt-2.5 text-center text-[11px] leading-relaxed text-white/40">
          Veröffentlicht wird der Clip so, wie er gerade bearbeitet ist.
        </p>
      </footer>
    </>
  )
}

function defaultCaption(clip: Clip) {
  const tags = clip.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')
  return [clip.description?.trim() || clip.title, tags].filter(Boolean).join('\n\n')
}

/** Beim Absenden gegen die echte Uhrzeit geprüft, nicht gegen die beim Öffnen. */
function isPast(date: Date) {
  return date.getTime() < Date.now()
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatWhen(date: Date) {
  return date.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
