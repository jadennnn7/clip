import type { PostAnalytics } from '@/types/analytics'
import type { SocialPlatform } from '@/types/database'

export type Period = '7d' | '30d' | '90d' | 'all'
export type PlatformFilter = SocialPlatform | 'all'

export const PERIODS: Array<{ value: Period; label: string; days: number | null }> = [
  { value: '7d', label: '7 Tage', days: 7 },
  { value: '30d', label: '30 Tage', days: 30 },
  { value: '90d', label: '90 Tage', days: 90 },
  { value: 'all', label: 'Gesamt', days: null },
]

const DAY_MS = 86_400_000

const numberFormat = new Intl.NumberFormat('de-DE')
const compactFormat = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 })

/** Bis zur Million genau („129.000"), darüber kompakt („1,3 Mio."). */
export function formatCount(value: number | null): string {
  if (value === null) return '–'
  return value < 1_000_000 ? numberFormat.format(value) : compactFormat.format(value)
}

export function formatPercent(value: number | null): string {
  if (value === null) return '–'
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: value < 10 ? 1 : 0 })} %`
}

export function formatDay(value: string | number): string {
  return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

export function formatRelative(value: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(value)) / 60_000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Min.`
  return `um ${new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
}

export function filterPosts(posts: PostAnalytics[], period: Period, platform: PlatformFilter, now = Date.now()) {
  const days = PERIODS.find((entry) => entry.value === period)?.days ?? null
  const since = days === null ? -Infinity : now - days * DAY_MS
  return posts.filter((post) =>
    (platform === 'all' || post.platform === platform) && Date.parse(post.publishedAt) >= since)
}

/** Summiert nur, was gemessen wurde. `null`, wenn kein einziger Wert vorliegt. */
function sum(posts: PostAnalytics[], key: 'views' | 'likes' | 'comments'): number | null {
  const measured = posts.filter((post) => post[key] !== null)
  return measured.length ? measured.reduce((total, post) => total + post[key]!, 0) : null
}

export function totals(posts: PostAnalytics[]) {
  const withViews = posts.filter((post) => post.views !== null)
  const viewsForRate = withViews.reduce((total, post) => total + post.views!, 0)
  const interactions = withViews.reduce((total, post) => total + (post.likes ?? 0) + (post.comments ?? 0), 0)
  return {
    views: sum(posts, 'views'),
    likes: sum(posts, 'likes'),
    comments: sum(posts, 'comments'),
    // Nur über Beiträge mit Aufrufen: Likes ohne Aufrufe würden die Quote aufblähen.
    engagement: viewsForRate > 0 ? (interactions / viewsForRate) * 100 : null,
    measuredViews: withViews.length,
    count: posts.length,
  }
}

export type TrendMetric = 'views' | 'likes' | 'comments'

export const TREND_METRICS: Array<{ value: TrendMetric; label: string }> = [
  { value: 'views', label: 'Aufrufe' },
  { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Kommentare' },
]

export interface Bucket {
  start: number
  end: number
  label: string
  /** Kurzform für die Achse. */
  tick: string
  views: number
  likes: number
  comments: number
  posts: number
}

function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Aufrufe nach Veröffentlichungstag. Bis 30 Tage eine Säule pro Tag, darüber
 * eine pro Woche — 90 Tagessäulen wären zu dünn, um sie zu treffen.
 */
export function viewBuckets(posts: PostAnalytics[], period: Period, now = Date.now()): Bucket[] {
  const days = PERIODS.find((entry) => entry.value === period)?.days
    ?? Math.max(14, Math.ceil((now - Math.min(now, ...posts.map((post) => Date.parse(post.publishedAt)))) / DAY_MS) + 1)
  const step = days > 31 ? 7 : 1
  const count = Math.ceil(days / step)
  const end = startOfDay(now) + DAY_MS
  const buckets: Bucket[] = Array.from({ length: count }, (_, index) => {
    const bucketEnd = end - (count - 1 - index) * step * DAY_MS
    const bucketStart = bucketEnd - step * DAY_MS
    return {
      start: bucketStart,
      end: bucketEnd,
      label: step === 1 ? formatDay(bucketStart) : `${formatDay(bucketStart)} – ${formatDay(bucketEnd - DAY_MS)}`,
      tick: formatDay(bucketStart),
      views: 0,
      likes: 0,
      comments: 0,
      posts: 0,
    }
  })
  for (const post of posts) {
    const time = Date.parse(post.publishedAt)
    const bucket = buckets.find((entry) => time >= entry.start && time < entry.end)
    if (!bucket) continue
    bucket.posts += 1
    bucket.views += post.views ?? 0
    bucket.likes += post.likes ?? 0
    bucket.comments += post.comments ?? 0
  }
  return buckets
}

function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const result = new Array<number>(values.length)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j++
    // Gleichstände teilen sich den mittleren Rang.
    for (let k = i; k <= j; k++) result[order[k].index] = (i + j) / 2
    i = j + 1
  }
  return result
}

/**
 * Rangkorrelation nach Spearman: Unabhängig davon, wie weit Aufrufe streuen,
 * zählt nur, ob ein höherer Score auch mehr Aufrufe bedeutet.
 */
export function spearman(pairs: Array<[number, number]>): number | null {
  if (pairs.length < 3) return null
  const x = ranks(pairs.map((pair) => pair[0]))
  const y = ranks(pairs.map((pair) => pair[1]))
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
  const mx = mean(x)
  const my = mean(y)
  let numerator = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < x.length; i++) {
    numerator += (x[i] - mx) * (y[i] - my)
    dx += (x[i] - mx) ** 2
    dy += (y[i] - my) ** 2
  }
  return dx && dy ? numerator / Math.sqrt(dx * dy) : null
}

/** Saubere Schrittweite: 1, 2, 2,5 oder 5 mal eine Zehnerpotenz. */
function niceStep(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

/** Achsenwerte 0, 2.000, 4.000 … statt 0, 1.250, 2.500 — höchstens `count` Abschnitte. */
export function niceTicks(peak: number, count = 4): number[] {
  const step = Math.max(1, niceStep(peak / count))
  const max = Math.max(step, Math.ceil(peak / step) * step)
  return Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step)
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}
