'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Clock, FileVideo, Plus, Scissors, Sparkles } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { RecentClipCard } from '@/components/dashboard/RecentClipCard'
import { mediaUrl } from '@/lib/link-import'
import { useStartNewProject } from '@/components/dashboard/new-project'
import { cn } from '@/lib/utils'

export default function EditorHubPage() {
  const projects = useWorkspaceStore((state) => state.projects)
  const clips = useWorkspaceStore((state) => state.clips)
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const outputFormats = useWorkspaceStore((state) => state.outputFormats)
  const projectSettings = useWorkspaceStore((state) => state.projectSettings)
  const startNewProject = useStartNewProject()

  const readyProjects = projects.filter((p) => p.status === 'ready')
  const recentClips = [...clips].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4)
  const latestClip = recentClips[0]
  const projectById = new Map(projects.map((p) => [p.id, p]))

  const quickEditorHref = latestClip
    ? `/dashboard/projects/${latestClip.project_id}?clip=${latestClip.id}`
    : readyProjects[0]
      ? `/dashboard/projects/${readyProjects[0].id}`
      : '/dashboard/projects/mock'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Kopfbereich */}
        <header className="relative flex flex-wrap items-end justify-between gap-4 pb-8 border-b border-foreground/[0.08]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="glass-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-foreground/80 uppercase">
                <Scissors className="size-3 text-muted-foreground" />
                Schnittplatz
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Video-Editor</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Schneide deine Videos Bild für Bild, passe Untertitel und Stile an, setze Overlays und rendere fertige Clips.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href={quickEditorHref}
              className={buttonVariants({ variant: 'default' })}
            >
              <Scissors className="size-4" />
              Direkt zum Editor
            </Link>
          </div>
        </header>

        {/* Demo-Projekt Spotlight-Banner */}
        <div className="relative mt-8 overflow-hidden rounded-[1.5rem] glass-tile p-6 sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -bottom-16 size-64 rounded-full bg-white/10 dark:bg-white/5 blur-3xl"
          />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl glass p-2.5 shadow-sm">
                <Image
                  src="/bubble-editor.png"
                  alt="Editor"
                  width={44}
                  height={44}
                  className="size-full object-contain drop-shadow-sm"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-medium">Interaktiver Demo-Editor</h2>
                  <span className="rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-foreground/15">
                    Sofort startklar
                  </span>
                </div>
                <p className="mt-1 max-w-lg text-xs text-muted-foreground leading-relaxed">
                  Teste alle Editor-Funktionen ohne eigenes Video: Podcast #47 mit 600 s Quellmaterial, KI-generierten Clips, Wellenform, Remotion-Vorschau und animierten Untertiteln.
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/projects/mock"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'shrink-0 rounded-full border-foreground/15 bg-foreground/[0.04] hover:bg-foreground/[0.08] text-foreground gap-2'
              )}
            >
              <Sparkles className="size-3.5 text-muted-foreground" />
              Demo öffnen
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Zuletzt bearbeitete Clips */}
        {recentClips.length > 0 ? (
          <section className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
                <Clock className="size-4 text-muted-foreground" />
                Zuletzt bearbeitet
              </h2>
              <Link
                href="/dashboard/clips"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Alle Clips anzeigen
                <ArrowRight className="size-3" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-4">
              {recentClips.map((clip) => (
                <RecentClipCard
                  key={clip.id}
                  clip={clip}
                  className="w-full shrink"
                  href={`/dashboard/projects/${clip.project_id}?clip=${clip.id}`}
                  previewSrc={projectById.has(clip.project_id) ? mediaUrl(projectById.get(clip.project_id)!) : null}
                  sourceAspect={projectById.get(clip.project_id)?.width && projectById.get(clip.project_id)?.height
                    ? projectById.get(clip.project_id)!.width! / projectById.get(clip.project_id)!.height!
                    : undefined}
                  outputFormat={outputFormats[clip.id] ?? projectSettings[clip.project_id]?.aspectRatio ?? '9:16'}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Deine Projekte im Editor */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <FileVideo className="size-4 text-muted-foreground" />
              Bereite Projekte
            </h2>
            <button
              type="button"
              onClick={startNewProject}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="size-3" />
              Neues Video importieren
            </button>
          </div>

          {!hydrated ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-28 animate-pulse rounded-[1.25rem] bg-foreground/[0.05]" />
              <div className="h-28 animate-pulse rounded-[1.25rem] bg-foreground/[0.05]" />
            </div>
          ) : readyProjects.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {readyProjects.map((project) => (
                <div
                  key={project.id}
                  className="glass-tile group relative flex items-center justify-between gap-4 rounded-[1.25rem] p-4 transition-all duration-200 hover:shadow-md"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-foreground">
                      {project.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(project.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                      {project.duration_seconds ? ` · ${Math.round(project.duration_seconds)}s` : ''}
                    </p>
                  </div>

                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      'shrink-0 rounded-full gap-1.5'
                    )}
                  >
                    <Scissors className="size-3.5" />
                    Editor
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-tile flex flex-col items-center justify-center rounded-[1.25rem] py-12 text-center p-6">
              <FileVideo className="size-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">Noch keine eigenen Videos bereit</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Füge oben auf dem Dashboard einen Link ein oder lade ein Video hoch. In der Zwischenzeit kannst du das Demo-Projekt testen!
              </p>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href="/dashboard/projects/mock"
                  className={buttonVariants({ variant: 'default', size: 'sm' })}
                >
                  <Sparkles className="size-3.5" />
                  Demo-Editor öffnen
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startNewProject}
                >
                  <Plus className="size-3.5" />
                  Neues Video
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
