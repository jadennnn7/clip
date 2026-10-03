'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Library, Search, X } from 'lucide-react'
import { VideoCard } from '@/components/clips/VideoCard'
import { DeleteProjectDialog, RenameProjectDialog, processProject } from '@/components/clips/ProjectDialogs'
import { Button } from '@/components/ui/button'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { Clip, Project } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Die Video-Liste der Bibliothek: ein Eintrag pro Quelle, Suche und Zähler.
 */
export function VideoLibrary({ showStats = true }: { showStats?: boolean }) {
  const projects = useWorkspaceStore((state) => state.projects)
  const clips = useWorkspaceStore((state) => state.clips)
  const favoriteCount = useWorkspaceStore((state) => state.favoriteClipIds.length)
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'clips'>('recent')
  const [renaming, setRenaming] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)

  const clipsByProject = new Map<string, Clip[]>()
  for (const clip of clips) clipsByProject.set(clip.project_id, [...(clipsByProject.get(clip.project_id) ?? []), clip])

  const needle = query.trim().toLocaleLowerCase('de')
  const videos = projects
    .filter((project) => {
      if (!needle) return true
      const own = project.title.toLocaleLowerCase('de').includes(needle)
      return own || (clipsByProject.get(project.id) ?? []).some((clip) =>
        `${clip.title} ${clip.hook_text ?? ''} ${clip.hashtags.join(' ')}`.toLocaleLowerCase('de').includes(needle))
    })
    .sort((a, b) =>
      sort === 'name' ? a.title.localeCompare(b.title, 'de')
        : sort === 'clips' ? (clipsByProject.get(b.id)?.length ?? 0) - (clipsByProject.get(a.id)?.length ?? 0)
          : b.created_at.localeCompare(a.created_at))

  return (
    <>
      {showStats ? (
        <div className="grid grid-cols-3 divide-x border-y py-4">
          {[
            { label: 'Videos', value: projects.length },
            { label: 'Clips', value: clips.length },
            { label: 'Favoriten', value: favoriteCount },
          ].map((stat, index) => (
            <div key={stat.label} className={cn('min-w-0', index > 0 && 'pl-4 sm:pl-6')}>
              <p className="font-mono text-2xl tracking-tight tabular-nums">{stat.value.toString().padStart(2, '0')}</p>
              <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className={cn('mb-6 flex flex-wrap items-center gap-2', showStats ? 'mt-6' : 'mt-0')}>
        <label className="flex h-10 w-full items-center gap-2 rounded-lg border bg-background px-3 md:max-w-sm">
          <Search className="size-4 text-muted-foreground" />
          <input
            aria-label="Videos und Clips durchsuchen"
            placeholder="Video, Clip oder Hashtag suchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {query ? (
            <button type="button" aria-label="Suche zurücksetzen" onClick={() => setQuery('')}>
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
        <select
          aria-label="Videos sortieren"
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          className="h-9 min-w-0 rounded-lg border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-auto"
        >
          <option value="recent">Neueste zuerst</option>
          <option value="clips">Meiste Clips</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {!hydrated ? (
        <p role="status" className="py-20 text-center text-sm text-muted-foreground">
          Deine Bibliothek wird geladen…
        </p>
      ) : videos.length > 0 ? (
        <ul className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((project, index) => (
            <VideoCard
              key={project.id}
              project={project}
              clips={clipsByProject.get(project.id) ?? []}
              delay={Math.min(index, 9) * 45}
              onRename={() => setRenaming(project)}
              onDelete={() => setDeleting(project)}
              onProcess={
                project.source_url && project.source_type !== 'upload' && (project.status === 'draft' || project.status === 'error')
                  ? () => processProject(project)
                  : undefined
              }
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-5 py-20 text-center">
          <Library className="mb-4 size-9 text-primary" />
          <h2 className="text-base font-medium">
            {projects.length ? 'Kein Video passt zur Suche' : 'Deine Bibliothek wartet auf das erste Video'}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {projects.length
              ? 'Versuche einen anderen Suchbegriff.'
              : 'Füge oben einen YouTube- oder Drive-Link ein — das Video erscheint hier, seine Clips auf der Seite des Videos.'}
          </p>
          {projects.length ? (
            <Button className="mt-5" variant="outline" onClick={() => setQuery('')}>
              Suche zurücksetzen
            </Button>
          ) : (
            <Button className="mt-5" nativeButton={false} render={<Link href="/dashboard" />}>
              Video hinzufügen
            </Button>
          )}
        </div>
      )}

      <RenameProjectDialog project={renaming} onClose={() => setRenaming(null)} />
      <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}
