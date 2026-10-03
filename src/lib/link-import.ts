'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { create } from 'zustand'
import { segmentToClip } from '@/lib/pipeline-clips'
import { pipelineClipId } from '@/lib/pipeline-clip-id'
import { classifyLink } from '@/lib/links'
import { LOCAL_WORKSPACE_OWNER, useWorkspaceStore } from '@/stores/workspace-store'
import type { Project, ProjectStatus } from '@/types/database'
import type { PipelineJob, StartPipelineResponse, PipelinePublishingPlan } from '@/types/pipeline'
import type { ProjectSettings } from '@/types/workspace'

/**
 * Browser-Seite der Link-Pipeline.
 *
 * Das Projekt entsteht sofort im Workspace, die Arbeit läuft auf dem Server.
 * `usePipelineSync` fragt laufende Jobs ab — egal, auf welcher Seite der
 * Nutzer gerade ist — und übernimmt die fertigen Segmente als Clips.
 */

export const ACTIVE_STATUSES: ProjectStatus[] = ['queued', 'downloading', 'transcribing', 'analyzing', 'reframing']

const POLL_MS = 1500

/** Fortschritt innerhalb eines Schritts. Flüchtig — er gehört nicht in den gespeicherten Workspace. */
export const usePipelineProgress = create<Record<string, { progress: number | null; message: string | null }>>(() => ({}))

/**
 * Wie viele Clips aus einer Quelle etwa entstehen — dieselbe Regel wie
 * `clipCountFor` in der Pipeline (ein Clip pro zwei Minuten).
 * Für die Platzhalter, solange geschnitten wird.
 */
export function expectedClipCount(durationSeconds: number | null): number {
  if (!durationSeconds) return 3
  return Number.isFinite(durationSeconds) ? Math.max(1, Math.floor(durationSeconds / 120)) : 1
}

export function isLinkProject(project: Project): boolean {
  return project.source_type !== 'upload' && Boolean(project.trigger_run_id)
}

export function mediaUrl(project: Project): string | null {
  return isLinkProject(project) ? `/api/pipeline/${project.trigger_run_id}/media` : null
}

/**
 * Startet die Verarbeitung eines Links.
 *
 * Mit `projectId` wird ein bestehendes Projekt (Entwurf oder Fehler) neu
 * angestoßen, statt ein zweites anzulegen.
 */
export async function startLinkImport(url: string, settings: ProjectSettings, projectId?: string): Promise<{ projectId: string; title: string; publishing?: PipelinePublishingPlan }> {
  const link = classifyLink(url)
  if (!link) throw new Error('Bitte einen gültigen HTTPS-Link von YouTube oder Google Drive einfügen.')

  const response = await fetch('/api/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: link.url, settings, rightsConfirmed: true }),
  }).catch(() => null)
  if (!response) throw new Error('Der Server ist nicht erreichbar. Läuft `npm run dev`?')
  const data = await response.json().catch(() => null) as (StartPipelineResponse & { error?: string }) | null
  if (!response.ok || !data?.jobId) throw new Error(data?.error ?? 'Der Link konnte nicht verarbeitet werden.')

  const store = useWorkspaceStore.getState()
  const now = new Date().toISOString()
  const patch: Partial<Project> = {
    status: 'queued',
    trigger_run_id: data.jobId,
    error_message: null,
    source_url: link.url,
    thumbnail_url: data.thumbnailUrl,
    duration_seconds: data.durationSeconds,
    rights_confirmed: true,
    rights_confirmed_at: now,
  }

  const existing = projectId ? store.projects.find((project) => project.id === projectId) : undefined
  if (existing) {
    if (existing.trigger_run_id && existing.trigger_run_id !== data.jobId) void deleteJob(existing.trigger_run_id)
    store.updateProject(existing.id, patch)
    store.setProjectPublishing(existing.id, { plan: data.publishing })
    return { projectId: existing.id, title: existing.title, publishing: data.publishing }
  }

  const id = store.createProjectDraft({
    title: data.title,
    source_type: data.source,
    source_url: link.url,
    rights_confirmed: true,
    settings,
  })
  store.updateProject(id, patch)
  store.setProjectPublishing(id, { plan: data.publishing })
  return { projectId: id, title: data.title, publishing: data.publishing }
}

/** Räumt Video und Zwischenstände eines Jobs auf dem Server ab. */
export function deleteJob(jobId: string): Promise<void> {
  return fetch(`/api/pipeline/${jobId}`, { method: 'DELETE' }).then(() => undefined, () => undefined)
}


type Navigate = (href: string) => void

/**
 * Mit Konto dieselben IDs, die auch der Worker für die Veröffentlichungen
 * vergibt (siehe `pipelineClipId`); im Demo-Modus zufällige.
 */
function clipIdsFor(job: PipelineJob, count: number): Promise<string[]> {
  const { owner } = useWorkspaceStore.getState()
  return Promise.all(Array.from({ length: count }, (_, index) =>
    owner && owner !== LOCAL_WORKSPACE_OWNER ? pipelineClipId(owner, job.id, index) : crypto.randomUUID()))
}

async function applyJob(projectId: string, job: PipelineJob, navigate: Navigate) {
  let store = useWorkspaceStore.getState()
  let project = store.projects.find((candidate) => candidate.id === projectId)
  // Inzwischen gelöscht oder neu gestartet: Die Antwort gehört nicht mehr dazu.
  if (!project || project.trigger_run_id !== job.id) return

  usePipelineProgress.setState({ [projectId]: { progress: job.progress, message: job.message } })

  if (job.status === 'error') {
    store.updateProject(projectId, { status: 'error', error_message: job.error })
    toast.error(`„${project.title}" konnte nicht geschnitten werden`, { description: job.error ?? undefined, duration: 10000 })
    return
  }

  if (job.status === 'ready' && job.result) {
    const now = new Date().toISOString()
    const result = job.result
    const ids = await clipIdsFor(job, result.segments.length)
    store = useWorkspaceStore.getState()
    project = store.projects.find((candidate) => candidate.id === projectId)
    if (!project || project.trigger_run_id !== job.id || project.status === 'ready') return
    const userId = project.user_id
    const clips = result.segments.map((segment, index) => segmentToClip(segment, projectId, now, result, ids[index], userId))
    store.saveProjectClips(projectId, clips)
    store.setProjectPublishing(projectId, {
      plan: job.publishing ?? store.projectPublishing[projectId]?.plan,
      summary: result.publishing,
      clipIds: clips.map((clip) => clip.id),
    })
    const settings = store.projectSettings[projectId]
    if (settings && settings.aspectRatio !== '9:16') {
      for (const clip of clips) store.setOutputFormat(clip.id, settings.aspectRatio)
    }
    store.updateProject(projectId, {
      status: 'ready',
      error_message: null,
      duration_seconds: job.result.durationSeconds,
      width: job.result.width,
      height: job.result.height,
      fps: job.result.fps,
      proxy_key: `pipeline/${job.id}/proxy.mp4`,
      ...(job.thumbnailUrl && !project.thumbnail_url ? { thumbnail_url: job.thumbnailUrl } : {}),
    })

    const hint = job.result.publishing?.notice
      ?? (job.result.publishing?.queuedCount ? `${job.result.publishing.automaticCount} automatisch eingeplant · ${job.result.publishing.reviewCount} warten auf Freigabe. Den aktuellen Status siehst du bei jedem Clip.` : job.publishing?.message)
      ?? job.result.notice
      ?? (job.result.analysis === 'heuristic' ? 'Regelbasiert ausgewählt. Mit GEMINI_API_KEY bewertet Gemini die Momente.' : undefined)
    toast.success(`${clips.length} ${clips.length === 1 ? 'Clip' : 'Clips'} aus „${project.title}" geschnitten`, {
      description: hint,
      duration: 12000,
      action: { label: 'Clips ansehen', onClick: () => navigate(`/dashboard/clips/${projectId}`) },
    })
    return
  }

  if (job.status !== project.status) store.updateProject(projectId, { status: job.status })
  // Im Cloud-Modus kennt erst der Worker das Vorschaubild (Google Drive) —
  // ein vorhandenes Bild wird nicht ersetzt.
  if (job.thumbnailUrl && !project.thumbnail_url) store.updateProject(projectId, { thumbnail_url: job.thumbnailUrl })
}

/** Hält laufende Link-Projekte mit ihren Jobs synchron. Einmal global eingebunden. */
export function usePipelineSync() {
  const router = useRouter()
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  // Ein String statt eines Arrays: Zustand vergleicht per Object.is, ein
  // frisch gefiltertes Array würde bei jedem Store-Update neu rendern.
  const activeKey = useWorkspaceStore((state) =>
    state.projects.filter((project) => isLinkProject(project) && ACTIVE_STATUSES.includes(project.status)).map((project) => project.id).join(','),
  )

  useEffect(() => {
    if (!hydrated || !activeKey) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      const active = useWorkspaceStore.getState().projects.filter((project) => isLinkProject(project) && ACTIVE_STATUSES.includes(project.status))
      await Promise.all(active.map(async (project) => {
        const response = await fetch(`/api/pipeline/${project.trigger_run_id}`, { cache: 'no-store' }).catch(() => null)
        if (cancelled || !response) return
        if (response.status === 404) {
          useWorkspaceStore.getState().updateProject(project.id, {
            status: 'error',
            error_message: 'Der Verarbeitungsauftrag ist auf dem Server nicht mehr vorhanden. Starte ihn erneut.',
          })
          return
        }
        if (!response.ok) return
        const job = await response.json().catch(() => null) as PipelineJob | null
        if (job && !cancelled) await applyJob(project.id, job, (href) => router.push(href))
      }))
      if (!cancelled) timer = setTimeout(tick, POLL_MS)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [hydrated, activeKey, router])
}
