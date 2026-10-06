'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, Check, ChevronDown, Loader2, Plus, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { isLocalVideoProject } from '@/lib/local-media'
import { accountsInPlan, useSocialAccounts, type PlatformCapability } from '@/lib/publishing-client'
import { ensureUploaded } from '@/lib/render-client'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'
import { refreshPublishingQueue } from '@/stores/publishing-queue-store'
import type { Clip, Project, SocialAccount, SocialPlatform } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'
import type { TikTokPostOptions } from '@/types/tiktok'
import { clipOutputDuration } from '@/lib/clip-export'
import { TikTokPostSettings } from './TikTokPostSettings'

type When = 'now' | 'later'

/** YouTube schneidet Titel nach 100 Zeichen ab (`services/social/youtube.ts`). */
const TITLE_MAX = 100
const CAPTION_MAX = 2200

/**
 * Veröffentlichen direkt aus der Clip-Vorschau: verbundene Kanäle wählen,
 * Zeitpunkt, Titel und Beschreibung. Das Ergebnis landet in derselben Queue
 * wie im Kalender. Der Klick ist die Freigabe — auch Kanäle mit
 * Freigabe-Queue warten danach nicht noch einmal. Gerendert wird der Clip so,
 * wie er gerade bearbeitet ist.
 *
 * Was wohin geht, steht genau da, wo man es eingibt: Der Titel ist der
 * YouTube-Titel und die erste Zeile auf Instagram; TikTok bekommt die
 * Beschreibung sowie die pro Beitrag gewählten Veröffentlichungsoptionen.
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
  // Bezugspunkt für Vorschläge und „liegt in der Vergangenheit“; beim Absenden wird mit der echten Uhrzeit nachgeprüft.
  const [openedAt] = useState(() => Date.now())
  const [slots] = useState(() => suggestedSlots(new Date(openedAt)))
  const [at, setAt] = useState(() => slots[0]?.value ?? toLocalInput(nextFullHour(new Date(openedAt))))
  const [customTime, setCustomTime] = useState(false)
  const [title, setTitle] = useState(() => clip.title.slice(0, TITLE_MAX))
  const [caption, setCaption] = useState(() => defaultCaption(clip))
  const [tiktokPosts, setTikTokPosts] = useState<Record<string, TikTokPostOptions | undefined>>({})

  const chosen = accounts.filter((account) => selected.has(account.id))
  const chosenPlatforms = new Set(chosen.map((account) => account.platform))
  const usesTitle = chosenPlatforms.has('youtube') || chosenPlatforms.has('instagram')
  const tiktokAccounts = chosen.filter((account) => account.platform === 'tiktok')
  const publishAt = when === 'now' ? null : new Date(at)
  const inPast = publishAt !== null && (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() < openedAt)
  const ready = chosen.length > 0 && !inPast && !submitting && (!usesTitle || title.trim().length > 0) && tiktokAccounts.every((account) => Boolean(tiktokPosts[account.id]))
  const restricted = chosen.filter((account) => capabilities?.[account.platform] && !capabilities[account.platform].canAutoPublish)

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) {
      next.delete(id)
      setTikTokPosts((posts) => ({ ...posts, [id]: undefined }))
    }
    else next.add(id)
    setPicked(next)
  }

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
          // Der Titel gilt nur für diese Veröffentlichung; der Clip selbst bleibt unverändert.
          clip: { ...clip, title: title.trim() || clip.title },
          removedWords,
          outputFormat,
          accountIds: chosen.map((account) => account.id),
          publishAt: publishAt?.toISOString() ?? null,
          caption: caption.trim(),
          tiktokPosts: Object.fromEntries(tiktokAccounts.map((account) => [account.id, tiktokPosts[account.id]])),
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
        {/* ── Kanäle ─────────────────────────────────────────────── */}
        <section aria-labelledby="publish-channels">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h3 id="publish-channels" className={SECTION_LABEL}>Kanäle</h3>
            {accounts.length > 1 ? (
              <button
                type="button"
                onClick={() => { if (chosen.length === accounts.length) setTikTokPosts({}); setPicked(chosen.length === accounts.length ? new Set() : new Set(accounts.map((account) => account.id))) }}
                className="rounded text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {chosen.length === accounts.length ? 'Keinen wählen' : 'Alle wählen'}
              </button>
            ) : null}
          </div>

          {accounts.length ? (
            <ul className="space-y-1.5">
              {accounts.map((account) => (
                <li key={account.id}>
                  <ChannelRow
                    account={account}
                    capability={capabilities?.[account.platform]}
                    on={selected.has(account.id)}
                    onToggle={() => toggle(account.id)}
                  />
                </li>
              ))}
            </ul>
          ) : connection.loading ? (
            <ul aria-label="Kanäle werden geladen" className="space-y-1.5">
              {[0, 1].map((index) => (
                <li key={index} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                  <span className="size-9 shrink-0 animate-pulse rounded-full bg-foreground/[0.07]" />
                  <span className="flex-1 space-y-1.5">
                    <span className="block h-3 w-28 animate-pulse rounded-full bg-foreground/[0.07]" />
                    <span className="block h-2.5 w-40 animate-pulse rounded-full bg-foreground/[0.05]" />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs leading-relaxed text-muted-foreground">
              <p>{setupError ?? 'Noch kein Kanal verbunden.'}</p>
              {setupError ? null : (
                <Link href="/dashboard/connections" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-foreground/[0.12]">
                  <Plus className="size-3.5" />Kanal verbinden
                </Link>
              )}
            </div>
          )}

          {/* Die langen Plattform-Hinweise nur auf Nachfrage — in jeder Zeile
              ausgeschrieben lasen sie sich wie Fehlermeldungen. */}
          {restricted.length ? (
            <details className="group/notes mt-2.5 rounded-xl bg-foreground/[0.03] text-xs">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 [&::-webkit-details-marker]:hidden">
                Was auf {restricted.length === 1 ? PLATFORM_LABEL[restricted[0].platform] : 'den Plattformen'} passiert
                <ChevronDown className="size-3.5 shrink-0 transition-transform duration-200 group-open/notes:rotate-180" />
              </summary>
              <ul className="space-y-2.5 px-3 pb-3">
                {[...new Set(restricted.map((account) => account.platform))].map((platform) => (
                  <li key={platform} className="flex gap-2.5 leading-relaxed">
                    <PlatformLogo platform={platform} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">{PLATFORM_DETAIL[platform] ?? capabilities?.[platform]?.notice}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        {/* ── Zeitpunkt ──────────────────────────────────────────── */}
        <section aria-labelledby="publish-when">
          <h3 id="publish-when" className={cn(SECTION_LABEL, 'mb-2.5')}>Zeitpunkt</h3>
          <div role="radiogroup" aria-labelledby="publish-when" className="grid grid-cols-2 gap-1 rounded-xl bg-white/[.05] p-1">
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
            <div className="rise-in mt-2.5">
              {/* Ein Tipp statt Datumsfeld: die Zeiten, zu denen die meisten
                  ohnehin posten. Alles andere über „Eigene". */}
              <div role="radiogroup" aria-label="Vorgeschlagene Zeiten" className="grid grid-cols-4 gap-1.5">
                {slots.map((slot) => {
                  const active = !customTime && at === slot.value
                  return (
                    <button
                      key={slot.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => { setCustomTime(false); setAt(slot.value) }}
                      className={cn(SLOT, active ? SLOT_ACTIVE : SLOT_IDLE)}
                    >
                      <span className="text-[10px] text-muted-foreground">{slot.day}</span>
                      <span className="text-sm font-semibold tabular-nums">{slot.time}</span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  role="radio"
                  aria-checked={customTime}
                  onClick={() => setCustomTime(true)}
                  className={cn(SLOT, customTime ? SLOT_ACTIVE : SLOT_IDLE)}
                >
                  <CalendarClock className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Eigene</span>
                </button>
              </div>
              {customTime ? (
                <input
                  type="datetime-local"
                  aria-label="Datum und Uhrzeit"
                  value={at}
                  min={toLocalInput(new Date(openedAt))}
                  onChange={(event) => setAt(event.target.value)}
                  className="mt-2 w-full glass-field rounded-xl px-3 py-2 text-sm text-foreground [color-scheme:dark] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                />
              ) : null}
              {inPast ? (
                <p className="mt-2 text-xs text-amber-400">Der Zeitpunkt liegt in der Vergangenheit.</p>
              ) : publishAt ? (
                <p className="mt-2 text-xs text-muted-foreground">Geht raus am <span className="font-medium text-foreground">{formatWhen(publishAt)}</span></p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ── Titel ──────────────────────────────────────────────── */}
        {usesTitle ? (
          <section>
            <label htmlFor="publish-title" className={cn(SECTION_LABEL, 'mb-2.5 flex items-baseline justify-between')}>
              Titel
              <Counter value={title.length} max={TITLE_MAX} />
            </label>
            {/* Zweizeilig, damit ein 100-Zeichen-Titel ganz zu sehen ist —
                Zeilenumbrüche nimmt ein Titel trotzdem nicht an. */}
            <textarea
              id="publish-title"
              value={title}
              maxLength={TITLE_MAX}
              rows={2}
              onChange={(event) => setTitle(event.target.value.replace(/\s*\n\s*/g, ' '))}
              onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }}
              placeholder="Worum geht es in dem Clip?"
              className="w-full resize-none glass-field rounded-xl px-3 py-2.5 text-sm font-medium leading-snug text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {chosenPlatforms.has('youtube') && chosenPlatforms.has('instagram') ? 'Titel auf YouTube, erste Zeile auf Instagram.'
                : chosenPlatforms.has('youtube') ? 'Titel des Shorts auf YouTube.' : 'Erste Zeile der Bildunterschrift auf Instagram.'}
            </p>
          </section>
        ) : null}

        {/* ── Beschreibung ───────────────────────────────────────── */}
        <section>
          <label htmlFor="publish-caption" className={cn(SECTION_LABEL, 'mb-2.5 flex items-baseline justify-between')}>
            Beschreibung
            <Counter value={caption.length} max={CAPTION_MAX} />
          </label>
          <textarea
            id="publish-caption"
            value={caption}
            maxLength={CAPTION_MAX}
            rows={4}
            onChange={(event) => setCaption(event.target.value)}
            className="w-full resize-none glass-field rounded-xl px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            placeholder="Was soll unter dem Clip stehen? #hashtags gehören ans Ende."
          />
          {chosenPlatforms.has('tiktok') ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <PlatformLogo platform="tiktok" className="mt-0.5 size-3 shrink-0" />
              Auf TikTok erscheint diese Beschreibung unter dem direkt veröffentlichten Video.
            </p>
          ) : null}
        </section>
        {tiktokAccounts.map((account) => (
          <TikTokPostSettings key={account.id} accountId={account.id} durationSeconds={clipOutputDuration(clip)} onChange={(options) => setTikTokPosts((posts) => ({ ...posts, [account.id]: options }))} />
        ))}
      </div>

      <footer className="border-t border-border bg-background px-6 py-5 max-lg:sticky max-lg:bottom-0">
        <button
          type="button"
          onClick={() => { void submit() }}
          disabled={!ready}
          className="liquid flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-[transform,filter] duration-500 ease-spring hover:brightness-110 active:scale-[0.98] active:duration-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : when === 'now' ? <Send className="size-4" /> : <CalendarClock className="size-4" />}
          {when === 'now' ? 'Jetzt veröffentlichen' : 'Einplanen'}
          {chosen.length ? (
            <span className="font-normal opacity-75">
              · {when === 'later' && publishAt && !inPast ? formatShort(publishAt) : `${chosen.length} ${chosen.length === 1 ? 'Kanal' : 'Kanäle'}`}
            </span>
          ) : null}
        </button>
        <p className="mt-2.5 text-center text-[11px] leading-relaxed text-white/40">
          {chosen.length === 0 && accounts.length ? 'Wähle mindestens einen Kanal.'
            : usesTitle && !title.trim() ? 'Gib dem Clip einen Titel.'
              : tiktokAccounts.some((account) => !tiktokPosts[account.id]) ? 'Wähle die TikTok-Sichtbarkeit und bestätige die Veröffentlichung.'
              : 'Veröffentlicht wird der Clip so, wie er gerade bearbeitet ist.'}
        </p>
      </footer>
    </>
  )
}

const SECTION_LABEL = 'text-xs font-medium text-white/45'
const SLOT = 'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
const SLOT_ACTIVE = 'bg-white/[.1] ring-1 ring-primary/60 text-white'
const SLOT_IDLE = 'bg-white/[.04] text-white/80 hover:bg-white/[.07]'

/** Ausgeschrieben, was die Plattform mit dem Clip macht — die Kurzform steht in der Zeile. */
const PLATFORM_DETAIL: Partial<Record<SocialPlatform, string>> = {
  youtube: 'Bis YouTube die App von Ocuris geprüft hat, werden Uploads privat gespeichert. Öffentlich stellst du den Short danach selbst in YouTube Studio.',
}

/** Kurz und ohne Fachbegriffe: Was passiert mit dem Clip auf dieser Plattform? */
function outcome(platform: SocialPlatform, capability: PlatformCapability | undefined): { label: string; live: boolean } {
  if (capability?.canAutoPublish) return { label: 'Geht direkt online', live: true }
  if (platform === 'tiktok') return { label: capability?.publicDirectPost ? 'Direkt mit deiner Sichtbarkeit' : 'Direct Post · vorerst privat', live: Boolean(capability?.publicDirectPost) }
  if (platform === 'youtube') return { label: 'Vorerst privat', live: false }
  return { label: 'Noch nicht freigeschaltet', live: false }
}

function ChannelRow({ account, capability, on, onToggle }: {
  account: SocialAccount
  capability: PlatformCapability | undefined
  on: boolean
  onToggle: () => void
}) {
  const result = outcome(account.platform, capability)
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
        on ? 'bg-white/[.07] ring-1 ring-white/[.08]' : 'opacity-70 hover:bg-white/[.04] hover:opacity-100',
      )}
    >
      <span className="relative shrink-0">
        <Avatar className="size-9">
          {account.avatar_url ? <AvatarImage src={account.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-white/[.07]"><PlatformLogo platform={account.platform} className="size-4" /></AvatarFallback>
        </Avatar>
        {account.avatar_url ? (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-background ring-1 ring-white/10">
            <PlatformLogo platform={account.platform} className="size-2" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {account.platform_username ?? PLATFORM_LABEL[account.platform]}
          {/* Sichtbar steht die Plattform im Logo. */}
          <span className="sr-only">, {PLATFORM_LABEL[account.platform]}</span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-white/45">
          <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', result.live ? 'bg-emerald-400' : 'bg-amber-400')} />
          <span className="truncate">{result.label}</span>
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full ring-1 transition',
          on ? 'bg-primary text-primary-foreground ring-primary' : 'ring-foreground/25',
        )}
      >
        {on ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  )
}

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span className={cn('font-normal tabular-nums', value >= max * 0.9 ? 'text-amber-400' : 'text-white/30')}>
      {value}/{max}
    </span>
  )
}

/**
 * Titel steht im eigenen Feld; YouTube setzt ihn als Titel, Instagram stellt
 * ihn der Bildunterschrift voran. In der Beschreibung noch einmal, stünde er
 * dort doppelt.
 */
function defaultCaption(clip: Clip) {
  const tags = clip.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')
  const description = clip.description?.trim()
  return [description && description !== clip.title.trim() ? description : '', tags].filter(Boolean).join('\n\n')
}

/** Drei Zeiten, die in mindestens einer halben Stunde liegen: mittags, abends, am nächsten Morgen. */
function suggestedSlots(now: Date): Array<{ value: string; day: string; time: string }> {
  const at = (dayOffset: number, hour: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() + dayOffset)
    date.setHours(hour, 0, 0, 0)
    return date
  }
  return [at(0, 12), at(0, 18), at(0, 21), at(1, 9), at(1, 12), at(1, 18), at(2, 12)]
    .filter((date) => date.getTime() >= now.getTime() + 30 * 60_000)
    .slice(0, 3)
    .map((date) => ({
      value: toLocalInput(date),
      day: date.getDate() === now.getDate() ? 'Heute' : date.getDate() === at(1, 0).getDate() ? 'Morgen' : date.toLocaleDateString('de-DE', { weekday: 'short' }),
      time: date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    }))
}

function nextFullHour(date: Date) {
  const next = new Date(date)
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return next
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
  return date.toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Für den Knopf: „Heute 18:00", „Morgen 09:00", sonst Wochentag und Datum. */
function formatShort(date: Date) {
  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (date.toDateString() === today.toDateString()) return `Heute ${time}`
  if (date.toDateString() === tomorrow.toDateString()) return `Morgen ${time}`
  return `${date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}
