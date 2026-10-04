'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCheck, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, ExternalLink, FileVideo, Grid, Heart, List, MoreHorizontal, Palette, Pencil, RotateCw, Scissors, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ClipCard } from '@/components/clips/ClipCard'
import { ClipSheet } from '@/components/clips/ClipSheet'
import type { ClipPublishingEmptyState } from '@/components/publishing/ClipPublishingStatus'
import { GhostClipCard, ProcessingBanner, sourceLine } from '@/components/clips/ProcessingClipCard'
import { DeleteProjectDialog, RenameProjectDialog, processProject } from '@/components/clips/ProjectDialogs'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EDITOR_ENABLED } from '@/lib/features'
import { ACTIVE_STATUSES, expectedClipCount, isLinkProject, mediaUrl } from '@/lib/link-import'
import { usePublishingJobs, type PublishingJobSummary } from '@/lib/publishing-client'
import { cn } from '@/lib/utils'
import { jobsForClip, refreshPublishingQueue, usePublishingQueue } from '@/stores/publishing-queue-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { OutputFormat } from '@/types/workspace'

type Sort = 'score' | 'time' | 'duration'

/**
 * Die Seite eines Videos: seine Clips, sonst nichts.
 *
 * Oben das Video selbst — Quelle, Länge, Einstieg in den Editor —, darunter
 * die Clips im gewählten Ausgabeformat, nach Score sortiert. Solange das Video noch
 * geschnitten wird, steht oben die Ladeanimation und unten halten
 * Platzhalter den Platz für die Clips frei.
 */
export function ProjectClips({ projectId }: { projectId: string }) {
  const router = useRouter()
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const project = useWorkspaceStore((state) => state.projects.find((candidate) => candidate.id === projectId))
  const allClips = useWorkspaceStore((state) => state.clips)
  const favoriteClipIds = useWorkspaceStore((state) => state.favoriteClipIds)
  const brandKits = useWorkspaceStore((state) => state.brandKits)
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite)
  const applyBrandKit = useWorkspaceStore((state) => state.applyBrandKit)
  const deleteClips = useWorkspaceStore((state) => state.deleteClips)
  const outputFormats = useWorkspaceStore((state) => state.outputFormats)
  const projectOutputFormat = useWorkspaceStore((state) => state.projectSettings[projectId]?.aspectRatio ?? '9:16')
  const publishing = useWorkspaceStore((state) => state.projectPublishing[projectId])
  // Nur wenn der Lauf wirklich Veröffentlichungen eingeplant hat, gibt es
  // etwas abzufragen — sonst bleibt die Queue still.
  const sourceJobId = project?.trigger_run_id && publishing?.summary?.queuedCount ? project.trigger_run_id : null
  const publishingJobs = usePublishingJobs(sourceJobId)
  // Von Hand veröffentlichte Clips stehen in der gemeinsamen Queue.
  const sharedJobs = usePublishingQueue((state) => state.jobs)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('score')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [kitId, setKitId] = useState('')
  const [deletingClips, setDeletingClips] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
  // Der offene Clip steht in der Adresse (`?clip=…`), damit man ihn teilen
  // und nach einem Neuladen wiederfinden kann. Die Id bleibt nach dem
  // Schließen stehen, damit die Bühne mit ihrem Inhalt ausblenden kann.
  const searchParams = useSearchParams()
  const [sheet, setSheet] = useState(() => ({ clipId: searchParams.get('clip'), open: searchParams.has('clip') }))
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [bannerVisible, setBannerVisible] = useState(true)

  if (!hydrated) {
    return <ProjectClipsSkeleton outputFormat={projectOutputFormat} />
  }
  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-medium">Video nicht gefunden</h1>
        <p className="max-w-md text-sm text-muted-foreground">Dieses Video wurde gelöscht oder ist nicht in diesem Browser gespeichert.</p>
        <Link href="/dashboard/clips" className={buttonVariants({ variant: 'outline' })}><ArrowLeft className="size-4" />Zur Clip-Bibliothek</Link>
      </div>
    )
  }

  const clips = allClips.filter((clip) => clip.project_id === project.id)
  const processing = isLinkProject(project) && ACTIVE_STATUSES.includes(project.status)
  const failed = project.status === 'error'
  const unprocessed = !processing && !failed && clips.length === 0
  const canProcess = Boolean(project.source_url) && project.source_type !== 'upload'
  const selectedIds = selected.filter((id) => clips.some((clip) => clip.id === id))
  const activeKit = brandKits.find((kit) => kit.id === kitId)
  const previewSrc = mediaUrl(project)
  const sourceAspect = project.width && project.height ? project.width / project.height : undefined

  const needle = query.trim().toLocaleLowerCase('de')
  const visible = clips
    .filter((clip) => (!onlyFavorites || favoriteClipIds.includes(clip.id)) &&
      (!needle || `${clip.title} ${clip.description} ${clip.hook_text ?? ''} ${clip.hashtags.join(' ')}`.toLocaleLowerCase('de').includes(needle)))
    .sort((a, b) =>
      sort === 'time' ? a.start_seconds - b.start_seconds
        : sort === 'duration' ? (a.end_seconds - a.start_seconds) - (b.end_seconds - b.start_seconds)
          : b.virality_score - a.virality_score)
  const activeIndex = visible.findIndex((candidate) => candidate.id === sheet.clipId)
  const prevClip = activeIndex > 0 ? visible[activeIndex - 1] : null
  const nextClip = activeIndex >= 0 && activeIndex < visible.length - 1 ? visible[activeIndex + 1] : null

  const showClip = (clipId: string | null) => {
    setSheet(clipId ? { clipId, open: true } : { ...sheet, open: false })
    const url = new URL(window.location.href)
    if (clipId) url.searchParams.set('clip', clipId)
    else url.searchParams.delete('clip')
    window.history.replaceState(null, '', url)
  }
  const projectJobs: PublishingJobSummary[] = sourceJobId ? publishingJobs.data?.jobs ?? [] : sharedJobs ?? []
  const jobsByClip = new Map(clips.map((clip) => [clip.id, jobsForClip(projectJobs, clip.id, project?.trigger_run_id ?? null, publishing)]))
  const refreshJobs = () => {
    publishingJobs.refresh()
    void refreshPublishingQueue()
  }
  const publishingState: ClipPublishingEmptyState =
    !sourceJobId ? 'none'
      : publishingJobs.loading ? 'loading'
        : publishingJobs.error || publishingJobs.data?.configured === false ? 'unavailable'
          : !publishing?.clipIds && publishingJobs.data?.jobs.length ? 'unlinked'
            : 'none'
  const toggleSelected = (id: string) => setSelected((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id])
  const selectClass = 'h-9 min-w-0 rounded-lg border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[80rem] px-4 py-10 sm:px-6">
        {/* --- Zurück zur Übersicht ------------------------------------ */}
        <Link
          href="/dashboard/clips"
          className="group mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Zurück zur Clip-Bibliothek"
        >
          <ChevronLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          <span>Clip-Bibliothek</span>
        </Link>
        {/* --- Das Video ------------------------------------------------- */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start border-b border-border pb-6">
          <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-muted border border-border sm:w-56">
            {project.thumbnail_url ?? clips.find((clip) => clip.thumbnail_url)?.thumbnail_url ? (
              <Image
                src={(project.thumbnail_url ?? clips.find((clip) => clip.thumbnail_url)?.thumbnail_url)!}
                alt=""
                fill
                unoptimized
                sizes="224px"
                className={cn(project.thumbnail_url ? 'object-cover' : 'object-contain', failed && 'grayscale')}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center"><FileVideo className="size-7 text-muted-foreground/50" /></div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl leading-tight font-semibold tracking-tight text-foreground sm:text-2xl">{project.title}</h1>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {[
                sourceLine(project),
                new Date(project.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }),
                processing ? 'wird geschnitten' : `${clips.length} ${clips.length === 1 ? 'Clip' : 'Clips'}`,
              ].join(' · ')}
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              {EDITOR_ENABLED && (project.status === 'ready' || clips.length > 0) ? (
                <Button nativeButton={false} render={<Link href={`/dashboard/projects/${project.id}`} />}><Scissors />Im Editor öffnen</Button>
              ) : null}
              {project.source_url ? (
                <Button variant="outline" nativeButton={false} render={<a href={project.source_url} target="_blank" rel="noreferrer" />}><ExternalLink />Original ansehen</Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" />} aria-label="Weitere Aktionen">
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {canProcess && (failed || unprocessed) ? (
                    <DropdownMenuItem onClick={() => processProject(project)}><RotateCw />{failed ? 'Erneut versuchen' : 'Clips erstellen'}</DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => setRenaming(true)}><Pencil />Umbenennen</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDeletingProject(true)} className="text-destructive"><Trash2 />Video löschen</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* --- Zustand des Videos -------------------------------------- */}
        {processing ? <div className="mt-6"><ProcessingBanner project={project} /></div> : null}

        {failed ? (
          <section className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/[0.06] p-5 sm:flex-row sm:items-center">
            <CircleAlert className="size-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Das Video konnte nicht geschnitten werden</p>
              <p className="mt-1 text-sm text-muted-foreground">{project.error_message ?? 'Unbekannter Fehler.'}</p>
            </div>
            {canProcess ? <Button variant="outline" onClick={() => processProject(project)}><RotateCw />Erneut versuchen</Button> : null}
          </section>
        ) : null}

        {unprocessed ? (
          <section className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border px-5 py-14 text-center">
            <Scissors className="mb-4 size-8 text-muted-foreground/70" />
            <h2 className="text-base font-medium text-foreground">Noch keine Clips</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {canProcess
                ? 'Aus diesem Video wurden noch keine Clips geschnitten.'
                : EDITOR_ENABLED ? 'Öffne das Video im Editor, um Clips von Hand zu schneiden.' : 'Für dieses Video lassen sich gerade keine Clips erstellen.'}
            </p>
            {canProcess ? (
              <Button className="mt-5" onClick={() => processProject(project)}><Scissors />Clips erstellen</Button>
            ) : EDITOR_ENABLED ? (
              <Button className="mt-5" nativeButton={false} render={<Link href={`/dashboard/projects/${project.id}`} />}>Im Editor öffnen</Button>
            ) : null}
          </section>
        ) : null}

        {/* --- OpusClip Toolbar / Subheader ---------------------------- */}
        {clips.length > 0 || processing ? (
          <section className="mt-6" aria-labelledby="clips-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
              <div className="flex items-center gap-3">
                {/* Grid & List view toggle */}
                <div className="flex items-center rounded-lg bg-foreground/[0.04] p-0.5 ring-1 ring-border ring-inset">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="Rasteransicht"
                    className={cn(
                      'flex size-7 items-center justify-center rounded-md transition-colors',
                      viewMode === 'grid' ? 'bg-foreground/10 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Grid className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-label="Listenansicht"
                    className={cn(
                      'flex size-7 items-center justify-center rounded-md transition-colors',
                      viewMode === 'list' ? 'bg-foreground/10 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <List className="size-3.5" />
                  </button>
                </div>

                {/* Dropdown / Label: Original-Clips (23) */}
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground/90">
                  <span>Original-Clips</span>
                  <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
                    ({clips.length})
                  </span>
                </div>
              </div>

              {/* Right: Search, Filter, Auswählen & Arrows */}
              <div className="flex items-center gap-2">
                <label className="hidden md:flex h-8 items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 text-xs ring-1 ring-border ring-inset focus-within:ring-ring sm:w-48 lg:w-60">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    aria-label="Clips durchsuchen"
                    placeholder="Suchen..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none"
                  />
                  {query ? (
                    <button aria-label="Suche zurücksetzen" onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  ) : null}
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setSelecting(!selecting)
                    if (selecting) setSelected([])
                  }}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
                    selecting ? 'bg-primary text-primary-foreground' : 'control',
                  )}
                >
                  <CheckSquare className="size-3.5" />
                  <span>Auswählen</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyFavorites(!onlyFavorites)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
                    onlyFavorites ? 'bg-foreground/10 text-foreground ring-1 ring-foreground/20 ring-inset' : 'control',
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                  <span>Filter</span>
                </button>

                {sheet.open && sheet.clipId ? (
                  <div className="flex items-center gap-1 pl-2 border-l border-border">
                    <button
                      type="button"
                      disabled={!prevClip}
                      onClick={() => prevClip && showClip(prevClip.id)}
                      aria-label="Vorheriger Clip"
                      title="Vorheriger Clip (↑)"
                      className="flex size-8 items-center justify-center control rounded-lg disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!nextClip}
                      onClick={() => nextClip && showClip(nextClip.id)}
                      aria-label="Nächster Clip"
                      title="Nächster Clip (↓)"
                      className="flex size-8 items-center justify-center control rounded-lg disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => showClip(null)}
                      aria-label="Schließen"
                      title="Schließen"
                      className="flex size-8 items-center justify-center control rounded-lg"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* --- OpusClip Automatische Überschrift Banner -------------------- */}
            {bannerVisible ? (
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass-tile rounded-2xl px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-semibold text-foreground">Automatische Überschrift</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-3xl">
                    Eine Überschrift wurde zu den ersten 5 Sekunden Ihrer Top-10-Videos hinzugefügt. Falls Sie diese nicht benötigen, klicken Sie auf „Deaktivieren“. Wenn Sie sie weiter verfeinern möchten, gehen Sie zu „Clip bearbeiten“.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBannerVisible(false)
                      toast.info('Automatische Überschriften deaktiviert')
                    }}
                    className="control rounded-lg px-3 py-1.5 text-xs font-medium"
                  >
                    Deaktivieren
                  </button>
                  <button
                    type="button"
                    onClick={() => setBannerVisible(false)}
                    aria-label="Banner schließen"
                    className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            ) : null}

            {selectedIds.length > 0 ? (
              <div className="sticky top-3 z-20 mt-4 flex flex-wrap items-center gap-2 glass rounded-2xl p-3">
                <span className="mr-2 text-xs font-medium text-foreground">{selectedIds.length} ausgewählt</span>
                <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground" onClick={() => setSelected(visible.map((clip) => clip.id))}>Alle sichtbaren</button>
                <select aria-label="Brand-Kit für ausgewählte Clips" value={kitId} onChange={(event) => setKitId(event.target.value)} className={cn(selectClass, 'max-w-48')}>
                  <option value="">Brand-Kit auswählen</option>
                  {brandKits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}
                </select>
                <Button size="sm" disabled={!activeKit} onClick={() => { if (activeKit) { applyBrandKit(activeKit.id, selectedIds); toast.success(`${activeKit.name} auf ${selectedIds.length} Clips angewendet`) } }}><Palette />Anwenden</Button>
                <Button size="sm" variant="destructive" onClick={() => setDeletingClips(true)}><Trash2 />Löschen</Button>
                <Button variant="ghost" size="icon-sm" aria-label="Auswahl aufheben" className="ml-auto" onClick={() => setSelected([])}><X /></Button>
              </div>
            ) : null}

            {/* --- Clips Grid -------------------------------------------- */}
            <div className={cn(
              'mt-6',
              viewMode === 'grid'
                ? 'grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                : 'flex flex-col gap-4',
            )}>
              {processing
                ? Array.from({ length: expectedClipCount(project.duration_seconds) }, (_, index) => (
                  <GhostClipCard key={index} delay={index * 70} outputFormat={projectOutputFormat} layout={viewMode} />
                ))
                : visible.map((clip, index) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    delay={Math.min(index, 14) * 35}
                    favorite={favoriteClipIds.includes(clip.id)}
                    selected={selectedIds.includes(clip.id)}
                    selecting={selecting}
                    onFavorite={() => toggleFavorite(clip.id)}
                    onSelect={() => { setSelecting(true); toggleSelected(clip.id) }}
                    onOpen={() => showClip(clip.id)}
                    previewSrc={previewSrc}
                    sourceAspect={sourceAspect}
                    outputFormat={outputFormats[clip.id] ?? projectOutputFormat}
                    layout={viewMode}
                    publishingJobs={jobsByClip.get(clip.id) ?? []}
                    publishingState={publishingState}
                    onPublishingChanged={refreshJobs}
                  />
                ))}
            </div>

            {!processing && visible.length === 0 ? (
              <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border px-5 py-14 text-center">
                <p className="text-sm text-muted-foreground">{onlyFavorites ? 'Markiere Clips mit dem Herz, um sie hier wiederzufinden.' : 'Kein Clip passt zur Suche.'}</p>
                <Button className="mt-4" variant="outline" size="sm" onClick={() => { setQuery(''); setOnlyFavorites(false) }}>Alle Clips anzeigen</Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <ClipSheet
        project={project}
        clips={visible}
        projectClips={clips}
        clipId={sheet.clipId}
        open={sheet.open}
        onNavigate={showClip}
        onClose={() => showClip(null)}
      />
      <Dialog open={deletingClips} onOpenChange={setDeletingClips}>
        <DialogContent>
          <DialogTitle>{selectedIds.length === 1 ? 'Clip löschen?' : `${selectedIds.length} Clips löschen?`}</DialogTitle>
          <DialogDescription>Die ausgewählten Clips und ihre Planungseinträge werden entfernt. Das Video bleibt erhalten.</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletingClips(false)}>Behalten</Button>
            <Button variant="destructive" onClick={() => { deleteClips(selectedIds); setSelected([]); setDeletingClips(false); toast.success('Clips gelöscht') }}>Löschen</Button>
          </div>
        </DialogContent>
      </Dialog>
      <RenameProjectDialog project={renaming ? project : null} onClose={() => setRenaming(false)} />
      <DeleteProjectDialog project={deletingProject ? project : null} onClose={() => setDeletingProject(false)} onDeleted={() => router.push('/dashboard/clips')} />
    </div>
  )
}

/**
 * Ladezustand: die Seite, wie sie gleich aussieht — Videokopf, Werkzeugleiste
 * und das Raster der Clips —, als schimmernde Platzhalter. Dieselben Maße wie
 * die fertige Seite, damit beim Erscheinen nichts springt; die Karten sind
 * dieselben wie für Clips, die gerade entstehen (`GhostClipCard`).
 */
function ProjectClipsSkeleton({ outputFormat }: { outputFormat: OutputFormat }) {
  const bar = 'shimmer rounded-full bg-foreground/[0.06]'
  return (
    <div role="status" aria-live="polite" className="h-full overflow-y-auto">
      <span className="sr-only">Clips werden geladen …</span>
      <div aria-hidden className="mx-auto max-w-[80rem] px-4 py-10 sm:px-6">
        <div className="mb-4 h-5 w-28 shimmer rounded-md bg-foreground/[0.04]" />
        <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start">
          <div className="shimmer relative aspect-video w-full shrink-0 rounded-xl border border-border bg-foreground/[0.04] sm:w-56" />
          <div className="min-w-0 flex-1 pt-1">
            <div className={cn(bar, 'h-6 w-3/4 sm:w-96')} />
            <div className={cn(bar, 'mt-3 h-3 w-1/2 sm:w-64')} />
            <div className="mt-5 flex items-center gap-2">
              <div className="shimmer h-9 w-40 rounded-lg bg-foreground/[0.06]" />
              <div className="shimmer h-9 w-36 rounded-lg bg-foreground/[0.04]" />
              <div className="shimmer size-9 rounded-full bg-foreground/[0.04]" />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-b border-border pb-3.5">
          <div className="flex items-center gap-3">
            <div className="shimmer h-9 w-[4.5rem] rounded-lg bg-foreground/[0.05]" />
            <div className="shimmer hidden h-9 w-56 rounded-lg bg-foreground/[0.04] sm:block" />
          </div>
          <div className="shimmer h-9 w-32 rounded-lg bg-foreground/[0.04]" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <GhostClipCard key={index} delay={index * 60} outputFormat={outputFormat} />
          ))}
        </div>
      </div>
    </div>
  )
}
