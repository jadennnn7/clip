'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronRight, CircleCheck, Loader, Menu, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ACTIVE_STATUSES } from '@/lib/link-import'
import { usePublishingQueue, usePublishingQueueSync } from '@/stores/publishing-queue-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { refreshBillingUsage, useBillingUsage, useBillingUsageSync } from '@/stores/billing-usage-store'
import { formatCredits } from '@/lib/credit-format'
import { TopUpDialog } from '@/components/dashboard/TopUpDialog'
import { findNavItem } from '@/components/dashboard/nav-items'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRefraction } from '@/components/ui/liquid-refraction'
import { useSidebar } from '@/components/ui/sidebar'

export type NoticeTone = 'attention' | 'running' | 'done'

export interface Notice {
  id: string
  tone: NoticeTone
  title: string
  detail: string
}

/** Wie lange ein fertig geschnittenes Projekt als Meldung stehen bleibt. */
const DONE_NOTICE_MS = 24 * 60 * 60 * 1000

/**
 * Meldungen aus dem Workspace: was hakt, was läuft, was gerade fertig wurde.
 *
 * Abgeleitet aus denselben Daten, die Übersicht, Bibliothek und Kalender
 * zeigen. Eine eigene Meldungsliste würde genau so lange stimmen, bis sich
 * ein Status ändert.
 */
function useWorkspaceNotices(): Notice[] {
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const projects = useWorkspaceStore((state) => state.projects)
  const clips = useWorkspaceStore((state) => state.clips)
  const needsReview = usePublishingQueue((state) => state.jobs?.filter((job) => job.status === 'needs_review').length ?? 0)
  // Einmal beim Einhängen: „Gerade fertig" soll sich nicht bei jedem Render verschieben.
  const [now] = React.useState(() => Date.now())
  if (!hydrated) return []

  const failed = projects.filter((project) => project.status === 'error')
  const running = projects.filter((project) => ACTIVE_STATUSES.includes(project.status))
  const finished = projects.filter((project) =>
    project.status === 'ready' && project.trigger_run_id && now - Date.parse(project.updated_at) < DONE_NOTICE_MS)
  const clipCount = (projectId: string) => clips.filter((clip) => clip.project_id === projectId).length

  return [
    ...failed.map((project): Notice => ({
      id: `failed-${project.id}`,
      tone: 'attention',
      title: 'Verarbeitung fehlgeschlagen',
      detail: project.error_message ?? project.title,
    })),
    ...(needsReview > 0
      ? [{
          id: 'needs-review',
          tone: 'attention',
          title: 'Freigabe nötig',
          detail: needsReview === 1
            ? 'Ein Clip wartet auf deine Freigabe, bevor er veröffentlicht wird.'
            : `${needsReview} Clips warten auf deine Freigabe, bevor sie veröffentlicht werden.`,
        } satisfies Notice]
      : []),
    ...(running.length > 0
      ? [{
          id: 'running',
          tone: 'running',
          title: running.length === 1 ? 'Ein Video wird geschnitten' : `${running.length} Videos werden geschnitten`,
          detail: running.map((project) => project.title).join(' · '),
        } satisfies Notice]
      : []),
    ...finished.map((project): Notice => ({
      id: `ready-${project.id}`,
      tone: 'done',
      title: `${clipCount(project.id)} Clips fertig`,
      detail: project.title,
    })),
  ]
}

const TONE_ICON: Record<NoticeTone, React.ComponentType<{ className?: string }>> = {
  attention: TriangleAlert,
  running: Loader,
  done: CircleCheck,
}

const TONE_CLASS: Record<NoticeTone, string> = {
  attention: 'text-amber-600 dark:text-amber-400',
  running: 'text-primary',
  done: 'text-emerald-600 dark:text-emerald-400',
}

/**
 * Kopfleiste des Dashboards.
 *
 * Sie trägt die drei Dinge, die überall gelten und nirgends in den Seiteninhalt
 * gehören: Was läuft gerade, was fordert Aufmerksamkeit, wie viel Guthaben ist
 * übrig. Alles andere — Titel, Beschreibung, Aktionen — bleibt Sache der Seite.
 *
 * Das Guthaben stand vorher zusätzlich in der Seitenleiste. Zwei Anzeigen
 * derselben Zahl auf einem Bildschirm sind eine Anzeige zu viel; die
 * Seitenleiste ist im Normalzustand ohnehin auf Symbolbreite eingeklappt, die
 * Zahl war dort also die meiste Zeit unsichtbar.
 */
export function TopBar() {
  useBillingUsageSync()
  usePublishingQueueSync()
  const { usage: credits, loading: creditsLoading } = useBillingUsage()
  const notices = useWorkspaceNotices()
  const pathname = usePathname()
  const { setMobileOpen } = useSidebar()
  const remaining = credits ? credits.available : null
  const attention = notices.filter((notice) => notice.tone === 'attention').length
  const current = findNavItem(pathname)
  // Die Aktionsinsel ist die Glasfläche, unter der Inhalt durchläuft —
  // hier sieht man die Brechung am deutlichsten.
  const refractActions = useRefraction<HTMLDivElement>({ depth: 26, bezel: 16, blur: 3 })
  const [topUpOpen, setTopUpOpen] = React.useState(false)

  return (
    // Links der Pfad ohne Fläche, rechts die Glasinsel mit dem, was einen
    // betrifft. Dazwischen bleibt der Inhalt sichtbar und läuft unter einer
    // weichen Randunschärfe durch. Die Leiste selbst ist für Zeiger
    // durchlässig, nur die Inseln fangen Klicks.
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-(--app-top) items-start gap-2 px-3 pt-3 sm:px-4">
      <div aria-hidden className="scroll-edge absolute inset-0 -bottom-4" />

      <div className="pointer-events-auto relative flex h-11 min-w-0 items-center gap-1 rounded-full pr-4 pl-1.5">
        <button
          type="button"
          aria-label="Navigation öffnen"
          onClick={() => setMobileOpen(true)}
          className="liquid-press flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
        >
          <Menu className="size-4" />
        </button>

        {/* Pfadzeile: Wo bin ich? Die Seite selbst sagt es im Titel noch
            einmal größer — hier geht es um die Orientierung im Workspace. */}
        <nav aria-label="Pfad" className="flex min-w-0 items-center gap-1.5 pl-1 text-sm md:pl-2.5">
          <Link
            href="/dashboard"
            className="hidden shrink-0 text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Workspace
          </Link>
          {current ? (
            <>
              <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/50 sm:block" />
              {pathname === current.href ? (
                <span aria-current="page" className="flex min-w-0 items-center gap-2 font-medium">
                  <current.icon className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{current.label}</span>
                </span>
              ) : (
                <Link
                  href={current.href}
                  className="flex min-w-0 items-center gap-2 font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <current.icon className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{current.label}</span>
                </Link>
              )}
            </>
          ) : null}
        </nav>
      </div>

      <div
        ref={refractActions}
        className="pointer-events-auto ml-auto relative flex h-10 shrink-0 items-center gap-1 rounded-full border border-white/[0.12] bg-zinc-900/60 dark:bg-black/60 p-1 shadow-[0_8px_32px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl transition-all"
      >
        {/* Subtiler Glanzstreif am oberen Glasrand */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />

        {/* --- Benachrichtigungen --- */}
        <Popover>
          <PopoverTrigger
            aria-label={
              attention > 0
                ? `Benachrichtigungen, ${attention} erfordern Aufmerksamkeit`
                : 'Benachrichtigungen'
            }
            className="group relative flex size-8 items-center justify-center rounded-full text-muted-foreground/80 outline-none transition-all duration-150 hover:bg-white/[0.08] hover:text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-white/[0.08] aria-expanded:text-foreground"
          >
            <Bell className="size-4 transition-transform duration-200 group-hover:scale-105" />
            {/* Pulsierender Akzent-Punkt für ungelesene Mitteilungen */}
            {attention > 0 ? (
              <span className="absolute top-1.5 right-1.5 flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.9)] ring-1.5 ring-black" />
              </span>
            ) : null}
          </PopoverTrigger>

          <PopoverContent align="end" sideOffset={10} className="w-80 gap-0 p-0 rounded-2xl border-white/[0.1] bg-popover/90 backdrop-blur-xl shadow-2xl">
            <div className="flex items-baseline justify-between px-3.5 py-3">
              <p className="text-sm font-medium">Benachrichtigungen</p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {notices.length}
              </span>
            </div>

            <div className="flex max-h-80 flex-col overflow-y-auto border-t border-foreground/[0.06] p-1.5">
              {notices.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Nichts Neues.
                </p>
              ) : (
                notices.map((notice) => {
                  const Icon = TONE_ICON[notice.tone]
                  return (
                    <div
                      key={notice.id}
                      className="flex items-start gap-2.5 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-foreground/[0.04]"
                    >
                      <Icon
                        className={cn(
                          'mt-0.5 size-3.5 shrink-0',
                          TONE_CLASS[notice.tone],
                          notice.tone === 'running' && 'animate-spin [animation-duration:2.4s]',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{notice.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {notice.detail}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Eleganter Gradient-Trenner */}
        <span aria-hidden className="h-4 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />

        {/* --- Guthaben --- */}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={topUpOpen}
          aria-label={remaining !== null ? `${formatCredits(remaining)} Credits verfügbar – Tarife anzeigen` : creditsLoading ? 'Tarife anzeigen – Guthaben wird geladen' : 'Tarife anzeigen – Guthaben nicht verfügbar'}
          onClick={() => { setTopUpOpen(true); void refreshBillingUsage() }}
          className="group relative flex h-8 items-center gap-2 rounded-full pl-2 pr-3 outline-none transition-all duration-150 hover:bg-white/[0.08] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-white/[0.08]"
        >
          {/* Credit-Symbol mit weichem Glow in seinem eigenen Blau */}
          <div className="relative flex size-5 shrink-0 items-center justify-center">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full bg-brand-deep/60 opacity-40 blur-[6px] transition-opacity duration-300 group-hover:opacity-90 dark:bg-brand/70"
            />
            <Image
              src="/Token.png"
              alt=""
              width={125}
              height={125}
              className="relative size-5 object-contain transition-transform duration-200 group-hover:scale-105"
            />
          </div>
          <span className="text-[13px] font-semibold tabular-nums tracking-tight text-foreground/90 transition-colors group-hover:text-foreground">
            {remaining !== null ? formatCredits(remaining) : creditsLoading ? <Loader className="size-3.5 animate-spin" /> : '–'}
          </span>
        </button>
      </div>

      <TopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </header>
  )
}
