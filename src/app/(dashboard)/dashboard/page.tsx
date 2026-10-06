'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Clock, FolderOpen } from 'lucide-react'
import { ProcessingClipCard } from '@/components/clips/ProcessingClipCard'
import { RecentClipCard } from '@/components/dashboard/RecentClipCard'
import { VideoLibrary } from '@/components/clips/VideoLibrary'
import { ACTIVE_STATUSES, isLinkProject, mediaUrl } from '@/lib/link-import'
import { IntakeBar } from '@/components/dashboard/IntakeBar'
import { PublishTargets } from '@/components/dashboard/PublishTargets'
import { EditorLinkDialog } from '@/components/dashboard/EditorLinkDialog'
import { ScrollRow } from '@/components/dashboard/ScrollRow'
import { useWorkspaceStore } from '@/stores/workspace-store'
/**
 * Übersicht.
 *
 * Drei Dinge, sonst nichts: ein neues Video anlegen, da weitermachen, wo man
 * war, und die Projekte finden. Vorher standen dazwischen eine Statuszeile,
 * eine Shader-Bühne und sieben Werkzeug-Kacheln — alles davon gibt es in
 * Sidebar und Kopfleiste schon einmal. Der Platz, der dadurch frei wird, ist
 * gewollt: Abstand ist hier das Gliederungsmittel, nicht Rahmen und Flächen.
 */
export default function DashboardPage() {
  const projects = useWorkspaceStore((state) => state.projects)
  const clips = useWorkspaceStore((state) => state.clips)
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const outputFormats = useWorkspaceStore((state) => state.outputFormats)
  const projectSettings = useWorkspaceStore((state) => state.projectSettings)
  const [editorDialogOpen, setEditorDialogOpen] = useState(false)
  // Fünf, weil fünf Karten genau in die Spalte passen — die sechste würde nur
  // Blätterpfeile erzwingen.
  const recentClips = [...clips].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5)
  // Videos, die gerade geschnitten werden, stehen in der Reihe vorn.
  const processing = projects.filter((project) => isLinkProject(project) && ACTIVE_STATUSES.includes(project.status))
  const projectById = new Map(projects.map((project) => [project.id, project]))

  return <div className="h-full overflow-y-auto">
    <div className="relative mx-auto w-full max-w-5xl px-5 pt-10 pb-28 sm:px-10 sm:pt-20">
      {/* Lichthof hinter dem Einstieg: Das hellste Glas der Seite sitzt über
          der hellsten Stelle des Grunds — dort, wo jedes Projekt anfängt. */}
      {/* Nur hinter dem Hero — nicht bis in die Projekte-Sektion durchscheinen,
          sonst entsteht dort wieder der Bubbly-Lichtfleck. */}
      {/* Blau wie der Schein über dem Hero der Landing-Page: Wer vom Login
          kommt, landet im selben Licht. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[22rem] bg-[radial-gradient(ellipse_50%_55%_at_50%_40%,var(--brand-glow),transparent_72%)]" />

      <header className="relative mx-auto max-w-2xl text-center">
        {/* Wohin die Clips gehen, bevor der Link kommt: Wer hier einen Kanal
            ausschaltet, weiß beim Einfügen schon, was passiert. */}
        <div className="rise-in mb-10 sm:mb-12"><PublishTargets /></div>

        {/* Verlauf in der Schrift: Die Zeile liest sich wie unter Glas, oben
            voll, unten leicht zurückgenommen. Die Pointe steht im Blau des
            Logos — wie „Null Aufwand." auf der Landing-Page. Im Hellen der
            tiefe Ton, der helle hätte auf Weiß keinen Kontrast. */}
        <h1 className="rise-in-blur pb-1 font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-[3.4rem] sm:leading-[1.05]">
          <span className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">Was schneiden wir </span>
          <span className="bg-gradient-to-b from-brand-deep to-primary bg-clip-text text-transparent dark:from-brand-light dark:via-brand dark:to-brand">heute?</span>
        </h1>
        
        <div className="rise-in mt-6" style={{ animationDelay: '80ms' }}><IntakeBar /></div>
      </header>

      {/* Zuletzt Bearbeitetes vor dem Projektraster: Weitermachen ist häufiger
          als Stöbern, und das Raster mit Suche und Filtern ist Verwaltung. */}
      {!hydrated ? (
        <div aria-hidden className="relative mt-24 flex gap-5 overflow-hidden pt-12">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="w-[156px] shrink-0">
              <div className="aspect-[9/16] animate-pulse rounded-xl bg-foreground/[0.06]" />
              <div className="mt-2.5 px-0.5">
                <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-foreground/[0.07]" />
                <div className="mt-2 flex justify-between">
                  <div className="h-5 w-8 animate-pulse rounded-full bg-foreground/[0.06]" />
                  <div className="h-3 w-6 animate-pulse rounded-full bg-foreground/[0.05]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : recentClips.length > 0 || processing.length > 0 ? (
        <div className="relative mt-24">
          <ScrollRow
            icon={Clock}
            title="Zuletzt bearbeitet"
            action={
              <div className="mr-1 flex items-center gap-2">
                <Link
                  href="/dashboard/clips"
                  className="transition-ui inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Alle Clips
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            }
          >
            {processing.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/clips/${project.id}`}
                className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl"
              >
                <ProcessingClipCard project={project} compact />
              </Link>
            ))}
            {recentClips.map((clip) => (
              <RecentClipCard
                key={clip.id}
                clip={clip}
                href={`/dashboard/clips/${clip.project_id}?clip=${clip.id}`}
                previewSrc={projectById.has(clip.project_id) ? mediaUrl(projectById.get(clip.project_id)!) : null}
                sourceAspect={projectById.get(clip.project_id)?.width && projectById.get(clip.project_id)?.height
                  ? projectById.get(clip.project_id)!.width! / projectById.get(clip.project_id)!.height!
                  : undefined}
                outputFormat={outputFormats[clip.id] ?? projectSettings[clip.project_id]?.aspectRatio ?? '9:16'}
              />
            ))}
          </ScrollRow>
        </div>
      ) : null}

      <section className="relative mt-16" aria-labelledby="projects-heading">
        <div className="flex min-h-9 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="projects-heading" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight"><FolderOpen className="size-4 self-center text-primary" />Projekte</h2>
        </div>
        <div className="mt-6">
          <VideoLibrary showStats={false} />
        </div>
      </section>

      <EditorLinkDialog open={editorDialogOpen} onOpenChange={setEditorDialogOpen} />
    </div>
  </div>
}
