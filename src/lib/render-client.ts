'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { buildCompositionProps } from '@/lib/composition-props'
import { isLinkProject } from '@/lib/link-import'
import { getLocalVideo, isLocalVideoProject } from '@/lib/local-media'
import { MOCK_PROJECT_ID, MOCK_VIDEO_SRC } from '@/lib/mock-data'
import { useEditorStore } from '@/stores/editor-store'
import type { Clip, Project } from '@/types/database'
import type { RenderJob } from '@/types/render'
import type { OutputFormat } from '@/types/workspace'

/**
 * Browser-Seite des MP4-Renders.
 *
 * Der Render-Zustand steht am Clip selbst (`render_status`, `render_job_id`,
 * `render_key`), der Fortschritt in Prozent ist flüchtig. So zeigt die
 * Clip-Liste den Stand, und ein Render, der beim Verlassen des Editors noch
 * lief, wird beim nächsten Öffnen weiter verfolgt.
 */

export const useRenderProgress = create<Record<string, number | null>>(() => ({}))

const POLL_MS = 1500

/** Pfad des Videos innerhalb der App — der Server macht daraus die Adresse für den Renderer. */
function videoPathFor(project: Project): string | null {
  if (isLinkProject(project)) return `/api/pipeline/${project.trigger_run_id}/media`
  if (isLocalVideoProject(project)) return `/api/uploads/${project.id}`
  if (project.id === MOCK_PROJECT_ID) return MOCK_VIDEO_SRC
  return null
}

/**
 * Lokale Projekte halten ihr Video in der IndexedDB — der Renderer braucht es
 * aber auf dem Server bzw. in R2. Einmal pro Projekt hochladen genügt.
 */
export async function ensureUploaded(projectId: string): Promise<void> {
  const blob = await getLocalVideo(projectId)
  if (!blob) throw new Error('Die Videodatei ist auf diesem Gerät nicht mehr verfügbar.')
  const contentType = blob.type || 'video/mp4'
  const prepared = await fetch(`/api/uploads/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType }),
  })
  const data = await prepared.json().catch(() => null) as { uploadUrl?: string; uploaded?: boolean; error?: string } | null
  if (!prepared.ok || !data?.uploadUrl) throw new Error(data?.error ?? 'Der Upload konnte nicht vorbereitet werden.')
  if (data.uploaded) return
  const upload = await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob })
  if (!upload.ok) throw new Error('Das Video konnte nicht hochgeladen werden.')
}

export async function startClipRender({
  project,
  clip,
  removedWords,
  outputFormat,
}: {
  project: Project
  clip: Clip
  removedWords: number[]
  outputFormat: OutputFormat
}): Promise<void> {
  const videoPath = videoPathFor(project)
  if (!videoPath) throw new Error('Zu diesem Projekt gibt es kein Video, das sich rendern lässt.')

  const { setRenderState } = useEditorStore.getState()
  setRenderState(clip.id, { render_status: 'queued', render_error: null })
  try {
    if (isLocalVideoProject(project)) await ensureUploaded(project.id)
    // Ein älterer Render desselben Clips ist mit dem neuen überholt.
    if (clip.render_job_id) void deleteRender(clip.render_job_id)

    // Dieselben Props wie im Player: ausgeblendete Wörter, Schnitte, Overlays
    // und Look sind im MP4 genau so wie in der Vorschau. Nur die Videoadresse
    // bestimmt der Server.
    const { videoSrc: _videoSrc, ...props } = buildCompositionProps({
      clip,
      removedWords,
      videoSrc: '',
      sourceWidth: project.width ?? 1920,
      sourceHeight: project.height ?? 1080,
    })
    const response = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...props, videoPath, outputFormat, title: clip.title }),
    })
    const job = await response.json().catch(() => null) as (RenderJob & { error?: string }) | null
    if (!response.ok || !job?.id) throw new Error(job?.error ?? 'Der Render konnte nicht gestartet werden.')
    setRenderState(clip.id, { render_status: 'queued', render_job_id: job.id, render_key: null })
  } catch (error) {
    setRenderState(clip.id, { render_status: 'error', render_error: error instanceof Error ? error.message : 'Render fehlgeschlagen' })
    throw error
  }
}

export function deleteRender(renderId: string): Promise<void> {
  return fetch(`/api/render/${renderId}`, { method: 'DELETE' }).then(() => undefined, () => undefined)
}

export function downloadRender(url: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = ''
  link.click()
}

/** Verfolgt laufende Renders der Clips im Editor. */
export function useRenderSync() {
  // Als String: ein frisch gefiltertes Array wäre bei jedem Store-Update neu.
  const activeKey = useEditorStore((state) =>
    state.clips
      .filter((clip) => clip.render_job_id && (clip.render_status === 'queued' || clip.render_status === 'rendering'))
      .map((clip) => `${clip.id}:${clip.render_job_id}`)
      .join(','),
  )

  useEffect(() => {
    if (!activeKey) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      const active = useEditorStore.getState().clips.filter((clip) =>
        clip.render_job_id && (clip.render_status === 'queued' || clip.render_status === 'rendering'))

      await Promise.all(active.map(async (clip) => {
        const renderId = clip.render_job_id!
        const response = await fetch(`/api/render/${renderId}`, { cache: 'no-store' }).catch(() => null)
        if (cancelled || !response) return
        const { setRenderState, clips } = useEditorStore.getState()
        // In der Zwischenzeit bearbeitet oder neu gestartet: Dieses Ergebnis gilt nicht mehr.
        if (clips.find((candidate) => candidate.id === clip.id)?.render_job_id !== renderId) return

        if (response.status === 404) {
          setRenderState(clip.id, { render_status: 'error', render_error: 'Der Render ist auf dem Server nicht mehr vorhanden.' })
          return
        }
        const job = await response.json().catch(() => null) as RenderJob | null
        if (!job || cancelled) return
        useRenderProgress.setState({ [clip.id]: job.progress })

        if (job.status === 'ready') {
          const url = `/api/render/${renderId}/file`
          setRenderState(clip.id, { render_status: 'ready', render_key: url, render_error: null })
          toast.success(`„${clip.title}" ist gerendert`, {
            duration: 12000,
            action: { label: 'Herunterladen', onClick: () => downloadRender(url) },
          })
        } else if (job.status === 'error') {
          setRenderState(clip.id, { render_status: 'error', render_error: job.error })
          toast.error('Render fehlgeschlagen', { description: job.error ?? undefined })
        } else if (job.status !== clip.render_status) {
          setRenderState(clip.id, { render_status: job.status })
        }
      }))
      if (!cancelled) timer = setTimeout(tick, POLL_MS)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [activeKey])
}
