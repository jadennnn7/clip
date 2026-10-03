'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowUpRight, EyeOff } from 'lucide-react'
import { ClipThumbnail } from '@/components/clips/ClipThumbnail'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'
import type { PostAnalytics } from '@/types/analytics'
import type { Clip } from '@/types/database'
import { formatCount, formatDay, formatPercent } from './metrics'

type SortKey = 'views' | 'likes' | 'comments' | 'engagement' | 'publishedAt'

export interface PostRow {
  post: PostAnalytics
  /** Der Clip im lokalen Workspace, falls er sich zuordnen lässt. */
  clip?: Clip
  editorHref?: string
  sourceAspect?: number
}

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'views', label: 'Aufrufe' },
  { key: 'likes', label: 'Likes', className: 'max-md:hidden' },
  { key: 'comments', label: 'Komm.', className: 'max-md:hidden' },
  { key: 'engagement', label: 'Engagement', className: 'max-sm:hidden' },
]

// Auf dem Telefon ohne Rangspalte: Der Titel braucht jeden Pixel.
const GRID = 'grid grid-cols-[minmax(0,1fr)_4rem_2rem] items-center gap-x-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_5.5rem_2rem] md:grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem_5.5rem_2rem]'

function engagement(post: PostAnalytics): number | null {
  if (!post.views) return null
  return (((post.likes ?? 0) + (post.comments ?? 0)) / post.views) * 100
}

function sortValue(post: PostAnalytics, key: SortKey): number | null {
  if (key === 'engagement') return engagement(post)
  if (key === 'publishedAt') return Date.parse(post.publishedAt)
  return post[key]
}

function Thumb({ row }: { row: PostRow }) {
  const box = 'relative h-10 w-[22.5px] shrink-0 overflow-hidden rounded-[5px] bg-foreground/[0.06] ring-1 ring-foreground/10 ring-inset'
  if (row.clip) {
    return (
      <div className={box}>
        <ClipThumbnail clip={row.clip} outputFormat="9:16" sourceAspect={row.sourceAspect} captionSize={6} showScore={false} showCaption={false} sizes="23px" />
      </div>
    )
  }
  if (row.post.thumbnailUrl) {
    return <div className={box}><Image src={row.post.thumbnailUrl} alt="" fill unoptimized className="object-cover" /></div>
  }
  return <div className={cn(box, 'flex items-center justify-center')}><PlatformLogo platform={row.post.platform} className="size-3 text-muted-foreground" /></div>
}

/**
 * Alle veröffentlichten Clips, sortierbar. Die Zeile führt in den Editor,
 * der Pfeil auf die Plattform — zwei Ziele, zwei getrennte Klickflächen.
 */
export function PostTable({ rows, emptyText, dimmed = false }: { rows: PostRow[]; emptyText: string; dimmed?: boolean }) {
  const [sort, setSort] = useState<SortKey>('views')
  const [expanded, setExpanded] = useState(false)
  const sorted = [...rows].sort((a, b) => {
    const left = sortValue(a.post, sort)
    const right = sortValue(b.post, sort)
    if (left === right) return b.post.viralityScore - a.post.viralityScore
    if (left === null) return 1
    if (right === null) return -1
    return right - left
  })
  const visible = expanded ? sorted : sorted.slice(0, 10)

  return (
    <div className={cn('flex flex-1 flex-col transition-opacity duration-300', dimmed && 'opacity-50')}>
      <div className={cn(GRID, 'border-b border-foreground/[0.06] bg-foreground/[0.02] px-4 py-2 text-[11px] text-muted-foreground sm:px-5')}>
        <span className="text-center max-sm:hidden">#</span>
        <button type="button" onClick={() => setSort('publishedAt')} className={cn('inline-flex items-center gap-1 justify-self-start rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50', sort === 'publishedAt' && 'text-foreground')}>
          Clip {sort === 'publishedAt' ? <><ArrowDown className="size-3" /><span className="sr-only">(neueste zuerst)</span></> : null}
        </button>
        {COLUMNS.map((column) => (
          <button
            key={column.key}
            type="button"
            onClick={() => setSort(column.key)}
            aria-pressed={sort === column.key}
            className={cn('inline-flex items-center justify-end gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50', sort === column.key && 'font-medium text-foreground', column.className)}
          >
            {sort === column.key ? <ArrowDown className="size-3" /> : null}
            {column.label}
          </button>
        ))}
        <span />
      </div>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">{emptyText}</p>
      ) : null}

      <ol className="divide-y divide-foreground/[0.05]">
        {visible.map((row, index) => {
          const { post } = row
          const rate = engagement(post)
          const title = (
            <>
              <p className="line-clamp-2 text-sm leading-snug font-medium text-foreground/90 group-hover:text-foreground sm:line-clamp-1">{post.title}</p>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] text-muted-foreground">
                <PlatformLogo platform={post.platform} className="size-3" />
                <span className="shrink-0">{formatDay(post.publishedAt)}</span>
                <span className="shrink-0 text-muted-foreground/40 max-sm:hidden">·</span>
                <span className="shrink-0 max-sm:hidden">Score {post.viralityScore}</span>
                {!post.isPublic ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/[0.06] px-1.5 py-px"><EyeOff className="size-2.5" />Privat</span>
                ) : null}
                {post.notice ? <span className="truncate" title={post.notice}>· {post.notice}</span> : null}
              </p>
            </>
          )
          return (
            <li key={post.jobId} className={cn(GRID, 'group transition-ui px-4 py-2.5 hover:bg-foreground/[0.025] sm:px-5')}>
              <span className="text-center text-xs text-muted-foreground tabular-nums max-sm:hidden">{index + 1}</span>
              <div className="flex min-w-0 items-center gap-3">
                <Thumb row={row} />
                {row.editorHref ? (
                  <Link href={row.editorHref} className="min-w-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50">{title}</Link>
                ) : (
                  <div className="min-w-0">{title}</div>
                )}
              </div>
              <span className={cn('text-right text-sm font-semibold tabular-nums', post.views === null && 'text-muted-foreground/50')}>{formatCount(post.views)}</span>
              <span className={cn('text-right text-sm tabular-nums max-md:hidden', post.likes === null && 'text-muted-foreground/50')}>{formatCount(post.likes)}</span>
              <span className={cn('text-right text-sm tabular-nums max-md:hidden', post.comments === null && 'text-muted-foreground/50')}>{formatCount(post.comments)}</span>
              <span className={cn('text-right text-sm tabular-nums max-sm:hidden', rate === null && 'text-muted-foreground/50')}>{formatPercent(rate)}</span>
              {post.url ? (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`„${post.title}" auf ${PLATFORM_LABEL[post.platform]} öffnen`}
                  className="transition-ui justify-self-end rounded-full p-1.5 text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ArrowUpRight className="size-4" />
                </a>
              ) : <span />}
            </li>
          )
        })}
      </ol>

      {sorted.length > 10 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="transition-ui w-full border-t border-foreground/[0.06] px-4 py-2.5 text-xs text-muted-foreground outline-none hover:bg-foreground/[0.025] hover:text-foreground focus-visible:bg-foreground/[0.04]"
        >
          {expanded ? 'Weniger anzeigen' : `Alle ${sorted.length} Clips anzeigen`}
        </button>
      ) : null}
    </div>
  )
}
