'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CircleAlert, Loader2 } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { getLocalVideo, isLocalVideoProject } from '@/lib/local-media'
import { isLinkProject, mediaUrl, usePipelineProgress } from '@/lib/link-import'
import { MOCK_PROJECT_ID, MOCK_VIDEO_SRC, mockClips, mockProject, mockWaveform } from '@/lib/mock-data'
import { buttonVariants } from '@/components/ui/button'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import type { Project } from '@/types/database'
import type { PipelineJob } from '@/types/pipeline'
import { EditorShell } from './EditorShell'

export function ProjectEditor({ projectId, initialClipId, initialTab }: { projectId: string; initialClipId?: string; initialTab?: string }) {
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const stored = useWorkspaceStore((state) => state.projects.find((item) => item.id === projectId))
  // Die Demo der Landingpage liegt nicht im Workspace — sie läuft auf den
  // Beispieldaten und speichert nichts.
  const demo = !stored && projectId === MOCK_PROJECT_ID
  const project = stored ?? (demo ? mockProject : undefined)
  const [media, setMedia] = useState<{ url: string; error?: string } | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const local = project ? isLocalVideoProject(project) : false
  const linkJobId = project && isLinkProject(project) && project.status === 'ready' ? project.trigger_run_id : null

  useEffect(() => {
    if (!local) return
    let active = true
    let url: string | null = null
    getLocalVideo(projectId).then((blob) => {
      if (!active) return
      if (blob) {
        url = URL.createObjectURL(blob)
        setMedia({ url })
      } else setMedia({ url: '', error: 'Die Videodatei ist auf diesem Gerät nicht mehr verfügbar. Importiere sie erneut als neues Projekt.' })
    }).catch(() => {
      if (active) setMedia({ url: '', error: 'Die lokale Videodatei konnte nicht geöffnet werden.' })
    })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [projectId, local])

  // Link-Projekte: Video und Wellenform liegen beim Pipeline-Job auf dem Server.
  useEffect(() => {
    if (!linkJobId) return
    let active = true
    fetch(`/api/pipeline/${linkJobId}`, { cache: 'no-store' }).then(async (response) => {
      if (!active) return
      if (response.status === 404) {
        setMedia({ url: '', error: 'Das Video dieses Projekts liegt nicht mehr auf dem Server. Füge den Link erneut ein, um es neu zu laden.' })
        return
      }
      const job = await response.json() as PipelineJob
      if (active) setPeaks(job.result?.peaks ?? [])
    }).catch(() => { /* Ohne Wellenform bleibt die Timeline benutzbar. */ })
    return () => { active = false }
  }, [linkJobId])

  const duration = project?.duration_seconds ?? 60
  const waveform = useMemo(
    () => (projectId === MOCK_PROJECT_ID ? mockWaveform : { duration, peaks }),
    [projectId, duration, peaks],
  )

  if (!hydrated || (local && !media)) return <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Workspace wird geladen …</div>
  if (!project) return <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"><h1 className="text-xl font-medium">Projekt nicht gefunden</h1><p className="max-w-md text-sm text-muted-foreground">Dieses Projekt wurde entfernt oder ist nicht in diesem Browser gespeichert.</p><Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}><ArrowLeft className="size-4" /> Zur Projektübersicht</Link></div>
  if (isLinkProject(project) && project.status !== 'ready') return <PipelineWaiting project={project} />

  return <EditorShell
    project={project}
    videoSrc={local ? media?.url ?? '' : linkJobId ? mediaUrl(project) ?? '' : project.id === MOCK_PROJECT_ID ? MOCK_VIDEO_SRC : ''}
    mediaError={media?.error}
    waveform={waveform}
    initialClipId={initialClipId}
    initialTab={initialTab}
    initialClips={demo ? mockClips : undefined}
  />
}

/** Direkt aufgerufenes Link-Projekt, dessen Clips noch entstehen (oder gescheitert sind). */
function PipelineWaiting({ project }: { project: Project }) {
  const detail = usePipelineProgress((state) => state[project.id])
  const failed = project.status === 'error'
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      {failed ? <CircleAlert className="size-6 text-destructive" /> : <Loader2 className="size-6 animate-spin text-muted-foreground" />}
      <h1 className="text-xl font-medium">{failed ? 'Verarbeitung fehlgeschlagen' : 'Clips werden erstellt'}</h1>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{project.title}</p>
      {failed ? (
        <p className="max-w-md text-sm text-destructive">{project.error_message}</p>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <StatusBadge status={project.status} />
          {detail?.progress != null ? <span className="font-mono text-muted-foreground tabular-nums">{Math.round(detail.progress * 100)} %</span> : null}
        </p>
      )}
      <Link href={`/dashboard/clips/${project.id}`} className={buttonVariants({ variant: 'outline' })}><ArrowLeft className="size-4" /> Zur Seite des Videos</Link>
    </div>
  )
}
