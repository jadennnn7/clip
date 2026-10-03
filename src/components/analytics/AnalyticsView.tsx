'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { RotateCw } from 'lucide-react'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { Button } from '@/components/ui/button'
import type { useAnalytics } from '@/lib/analytics-client'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { SocialPlatform } from '@/types/database'
import { ChannelList } from './ChannelList'
import { KpiCards, type Kpi } from './KpiCards'
import { Panel, Segmented } from './Panel'
import { PostTable, type PostRow } from './PostTable'
import { ScoreDistribution } from './ScoreDistribution'
import { ScoreScatter } from './ScoreScatter'
import { StatusList } from './StatusList'
import { TrendChart } from './TrendChart'
import {
  filterPosts, formatCount, formatPercent, formatRelative, median, PERIODS, spearman, totals, TREND_METRICS, viewBuckets,
  type Period, type PlatformFilter, type TrendMetric,
} from './metrics'

const PLATFORM_ORDER: SocialPlatform[] = ['youtube', 'instagram', 'tiktok']
/** Unter fünf Punkten sagt eine Rangkorrelation nichts. */
const MIN_SCATTER_POINTS = 5

function Notice({ tone = 'neutral', title, text, action }: { tone?: 'neutral' | 'warning'; title: string; text: string; action?: ReactNode }) {
  return (
    <div role="status" className="glass-tile flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 sm:px-5">
      <span aria-hidden className={cn('size-2 shrink-0 self-start rounded-full max-sm:mt-1.5 sm:self-center', tone === 'warning' ? 'bg-amber-500' : 'bg-foreground/40')} />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{title}</span>{' '}
        <span className="text-muted-foreground">{text}</span>
      </p>
      {action}
    </div>
  )
}

function strength(rho: number): string {
  const value = Math.abs(rho)
  const level = value >= 0.5 ? 'stark' : value >= 0.3 ? 'mittel' : value >= 0.1 ? 'schwach' : 'kein'
  if (level === 'kein') return 'Kein erkennbarer Zusammenhang zwischen Score und Aufrufen.'
  return `${level[0].toUpperCase()}${level.slice(1)}er ${rho > 0 ? 'positiver' : 'negativer'} Zusammenhang: Clips mit höherem Score erzielen ${rho > 0 ? 'mehr' : 'weniger'} Aufrufe.`
}

/**
 * Analytics: Kennzahlen der veröffentlichten Clips von den Plattformen,
 * dazu Kanäle, Veröffentlichungsstand und die Score-Prognose aus dem
 * Workspace. Das Raster steht immer — auch ohne Daten, dann mit sachlichen
 * Leerzuständen statt Illustrationen.
 *
 * Die Daten kommen als Props, damit die Ansicht ohne Server prüfbar bleibt.
 */
export function AnalyticsView({ data, error, loading, refreshing, refresh }: ReturnType<typeof useAnalytics>) {
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const clips = useWorkspaceStore((state) => state.clips)
  const projects = useWorkspaceStore((state) => state.projects)
  const projectPublishing = useWorkspaceStore((state) => state.projectPublishing)
  const [period, setPeriod] = useState<Period>('30d')
  const [platformChoice, setPlatformChoice] = useState<PlatformFilter>('all')
  const [metric, setMetric] = useState<TrendMetric>('views')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const allPosts = data?.posts ?? []
  const platforms = PLATFORM_ORDER.filter((platform) =>
    data?.channels.some((channel) => channel.platform === platform) || allPosts.some((post) => post.platform === platform))
  const platform = platformChoice !== 'all' && platforms.includes(platformChoice) ? platformChoice : 'all'
  const matches = (value: SocialPlatform) => platform === 'all' || value === platform

  const posts = filterPosts(allPosts, period, platform, now)
  const sums = totals(posts)
  const buckets = viewBuckets(posts, period, now)
  const channels = (data?.channels ?? []).filter((channel) => matches(channel.platform))
  const queue = (data?.queue ?? []).filter((entry) => matches(entry.platform))
  const measured = posts.filter((post) => post.views !== null)
  const rho = measured.length >= MIN_SCATTER_POINTS ? spearman(measured.map((post) => [post.viralityScore, post.views!])) : null
  const periodDays = PERIODS.find((entry) => entry.value === period)!.days
  const periodText = periodDays ? `Letzte ${periodDays} Tage` : 'Gesamter Zeitraum'

  const projectByRun = new Map(projects.flatMap((project) => project.trigger_run_id ? [[project.trigger_run_id, project] as const] : []))
  const clipById = new Map(clips.map((clip) => [clip.id, clip]))
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const rows: PostRow[] = posts.map((post) => {
    // Neuere Aufträge kennen ihren Clip; ältere nur die Segment-Position.
    const byId = post.clipId ? clipById.get(post.clipId) : undefined
    const project = byId ? projectById.get(byId.project_id) : projectByRun.get(post.sourceJobId)
    const clipId = byId?.id ?? (project ? projectPublishing[project.id]?.clipIds?.[post.clipIndex] : undefined)
    const clip = clipId ? clipById.get(clipId) : undefined
    return {
      post,
      clip,
      editorHref: project && clip ? `/dashboard/projects/${project.id}?clip=${clip.id}` : undefined,
      sourceAspect: project?.width && project.height ? project.width / project.height : undefined,
    }
  })

  // Freigaben führen in das Projekt, in dem die meisten Clips warten.
  const waitingByRun = new Map<string, number>()
  for (const entry of queue) {
    if (entry.status === 'needs_review') waitingByRun.set(entry.sourceJobId, (waitingByRun.get(entry.sourceJobId) ?? 0) + entry.count)
  }
  const busiestRun = [...waitingByRun.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const reviewProject = busiestRun ? projectByRun.get(busiestRun) : undefined
  const reviewHref = reviewProject ? `/dashboard/clips/${reviewProject.id}` : '/dashboard/clips'
  const waiting = [...waitingByRun.values()].reduce((sum, count) => sum + count, 0)
  const queueTotal = queue.reduce((sum, entry) => sum + entry.count, 0)

  const followerValues = channels.map((channel) => channel.followers).filter((value): value is number => value !== null)
  const followers = followerValues.length ? followerValues.reduce((sum, value) => sum + value, 0) : null
  const per = (value: number | null) => value === null || sums.count === 0 ? 'Keine veröffentlichten Clips' : `Ø ${formatCount(Math.round(value / sums.count))} je Clip`
  const missingViews = sums.count - sums.measuredViews
  const kpis: Kpi[] = [
    {
      label: 'Aufrufe',
      value: sums.count === 0 ? '0' : formatCount(sums.views),
      unavailable: sums.count > 0 && sums.views === null,
      note: sums.count === 0 ? 'Keine veröffentlichten Clips' : missingViews > 0 ? `${sums.count} Clips, ${missingViews} ohne Aufrufzahl` : `${sums.count} ${sums.count === 1 ? 'Clip' : 'Clips'}`,
    },
    { label: 'Likes', value: sums.count === 0 ? '0' : formatCount(sums.likes), unavailable: sums.count > 0 && sums.likes === null, note: per(sums.likes) },
    { label: 'Kommentare', value: sums.count === 0 ? '0' : formatCount(sums.comments), unavailable: sums.count > 0 && sums.comments === null, note: per(sums.comments) },
    { label: 'Engagement-Rate', value: formatPercent(sums.engagement), unavailable: sums.engagement === null, note: 'Interaktionen je Aufruf' },
    { label: 'Follower', value: formatCount(followers), unavailable: followers === null, note: `${channels.length} ${channels.length === 1 ? 'Kanal' : 'Kanäle'}` },
  ]

  const ranked = [...clips].sort((a, b) => b.virality_score - a.virality_score)
  const scores = ranked.map((clip) => clip.virality_score)
  const avgScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null
  const strong = scores.filter((score) => score >= 80).length

  const metricLabel = TREND_METRICS.find((entry) => entry.value === metric)!.label
  const showData = Boolean(data?.configured)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-20 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Veröffentlichte Clips auf allen Kanälen
              {data ? ` · ${refreshing ? 'wird aktualisiert …' : `Stand ${formatRelative(data.fetchedAt, now)}`}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Zeitraum"
              value={period}
              onChange={setPeriod}
              options={PERIODS.map((entry) => ({ value: entry.value, label: entry.label }))}
            />
            {platforms.length > 1 ? (
              <Segmented
                label="Plattform"
                value={platform}
                onChange={setPlatformChoice}
                options={[
                  { value: 'all' as PlatformFilter, label: 'Alle' },
                  ...platforms.map((value) => ({
                    value: value as PlatformFilter,
                    ariaLabel: PLATFORM_LABEL[value],
                    label: <><PlatformLogo platform={value} className="size-3.5" /><span className="max-md:hidden">{PLATFORM_LABEL[value].split(' ')[0]}</span></>,
                  })),
                ]}
              />
            ) : null}
            <Button variant="outline" size="icon" onClick={refresh} disabled={refreshing || loading} aria-label="Kennzahlen aktualisieren" title="Aktualisieren">
              <RotateCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-4">
          {loading && !data ? (
            <>
              <div aria-hidden className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: 5 }, (_, index) => <div key={index} className="glass-tile shimmer h-[5.5rem] rounded-xl" />)}
              </div>
              <div aria-hidden className="glass-tile shimmer h-80 rounded-xl" />
            </>
          ) : !showData ? (
            <Notice
              tone="warning"
              title="Kennzahlen nicht verfügbar."
              text={data?.error ?? error ?? 'Die Kennzahlen konnten nicht geladen werden.'}
              action={<Button variant="outline" size="sm" onClick={refresh}>Erneut versuchen</Button>}
            />
          ) : (
            <>
              {error ? (
                <Notice tone="warning" title="Aktualisierung fehlgeschlagen." text={`${error} Angezeigt wird der letzte Stand.`} />
              ) : null}
              {data!.channels.length === 0 ? (
                <Notice
                  title="Kein Kanal verbunden."
                  text="Verbinde YouTube, Instagram oder TikTok, damit Clips veröffentlicht und hier ausgewertet werden."
                  action={<Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/connections" />}>Kanäle verbinden</Button>}
                />
              ) : waiting > 0 ? (
                <Notice
                  tone="warning"
                  title={`${waiting} ${waiting === 1 ? 'Clip wartet' : 'Clips warten'} auf Freigabe.`}
                  text="Sie werden erst nach deiner Freigabe veröffentlicht und anschließend hier ausgewertet."
                  action={<Button variant="outline" size="sm" nativeButton={false} render={<Link href={reviewHref} />}>Freigabe öffnen</Button>}
                />
              ) : null}

              <KpiCards items={kpis} dimmed={refreshing} />

              <Panel
                id="trend-heading"
                title={metricLabel}
                description={`Summe je Veröffentlichungstag · ${periodText}`}
                action={<Segmented label="Kennzahl" value={metric} onChange={setMetric} options={TREND_METRICS} />}
              >
                <div className="px-3 pt-5 pb-4 sm:px-5">
                  <TrendChart
                    buckets={buckets}
                    metric={metric}
                    dimmed={refreshing}
                    emptyTitle="Keine Daten für diesen Zeitraum"
                    emptyText={allPosts.length === 0 ? 'Kennzahlen erscheinen, sobald der erste Clip veröffentlicht ist.' : 'In diesem Zeitraum wurde kein Clip veröffentlicht.'}
                  />
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-3">
                <Panel
                  id="clips-heading"
                  title="Veröffentlichte Clips"
                  description={`${posts.length} ${posts.length === 1 ? 'Clip' : 'Clips'} · ${periodText}`}
                  className="lg:col-span-2"
                >
                  <PostTable rows={rows} dimmed={refreshing} emptyText={allPosts.length === 0 ? 'Noch keine veröffentlichten Clips.' : 'Keine Clips in diesem Zeitraum.'} />
                </Panel>

                <div className="flex flex-col gap-4">
                  <Panel
                    id="channels-heading"
                    title="Kanäle"
                    action={<Link href="/dashboard/connections" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Verwalten</Link>}
                  >
                    <ChannelList channels={channels} />
                  </Panel>
                  <Panel
                    id="status-heading"
                    title="Veröffentlichungen"
                    action={<span className="text-xs text-muted-foreground tabular-nums">{queueTotal} gesamt</span>}
                  >
                    <StatusList queue={queue} />
                  </Panel>
                </div>
              </div>
            </>
          )}

          {hydrated && ranked.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel id="score-heading" title="Virality-Score" description={`Prognose für ${ranked.length} ${ranked.length === 1 ? 'Clip' : 'Clips'} im Workspace`}>
                <div className="grid grid-cols-3 border-b border-foreground/[0.06]">
                  {[
                    { label: 'Durchschnitt', value: avgScore ?? '–' },
                    { label: 'Median', value: median(scores) ?? '–' },
                    { label: 'Score ab 80', value: `${strong} von ${ranked.length}` },
                  ].map((stat, index) => (
                    <div key={stat.label} className={cn('px-4 py-3 sm:px-5', index > 0 && 'border-l border-foreground/[0.06]')}>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="px-4 pt-5 pb-4 sm:px-5">
                  <ScoreDistribution clips={ranked} />
                </div>
              </Panel>

              <Panel
                id="accuracy-heading"
                title="Score und Aufrufe"
                description={rho !== null
                  ? `Rangkorrelation ${rho.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${measured.length} Clips`
                  : 'Wie gut die Prognose die tatsächliche Reichweite trifft'}
              >
                {rho !== null ? (
                  <div className="flex flex-1 flex-col px-3 pt-4 pb-3 sm:px-5">
                    <p className="mb-3 text-xs text-muted-foreground">{strength(rho)}</p>
                    <ScoreScatter posts={measured} dimmed={refreshing} />
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                    <p className="text-sm font-medium">Noch nicht genug Daten</p>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      Die Auswertung benötigt mindestens {MIN_SCATTER_POINTS} veröffentlichte Clips mit Aufrufzahlen. Aktuell: {measured.length}.
                    </p>
                  </div>
                )}
              </Panel>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
