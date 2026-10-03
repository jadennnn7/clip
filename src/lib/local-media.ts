'use client'

import type { Project } from '@/types/database'
import type { ProjectSettings } from '@/types/workspace'
import { useWorkspaceStore } from '@/stores/workspace-store'

const DB_NAME = 'omegaclip-local-media'
const DB_VERSION = 1
const STORE_NAME = 'videos'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

interface VideoMetadata {
  duration_seconds: number | null
  width: number | null
  height: number | null
}

function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    const url = URL.createObjectURL(file)
    const finish = (metadata: VideoMetadata) => { URL.revokeObjectURL(url); resolve(metadata) }
    video.onloadedmetadata = () => finish({
      duration_seconds: Number.isFinite(video.duration) ? video.duration : null,
      width: video.videoWidth || null,
      height: video.videoHeight || null,
    })
    video.onerror = () => finish({ duration_seconds: null, width: null, height: null })
    video.src = url
  })
}

/**
 * A local-upload project has no source_key, unlike the mock/demo project
 * which fakes one to exercise the same UI without a real file behind it.
 */
export function isLocalVideoProject(project: Project): boolean {
  return project.source_type === 'upload' && project.source_key === null
}

// Videos live in IndexedDB, not localStorage — a 500 MB file would blow the quota.
export async function importLocalVideo(file: File, settings: ProjectSettings): Promise<string> {
  const { createProjectDraft, updateProject, deleteProject } = useWorkspaceStore.getState()
  const id = createProjectDraft({
    title: settings.topic.trim() || file.name.replace(/\.[^./]+$/, '') || 'Neues Projekt',
    source_type: 'upload',
    source_url: null,
    rights_confirmed: true,
    settings,
  })
  try {
    await withStore<IDBValidKey>('readwrite', (store) => store.put(file, id))
  } catch (cause) {
    // Noch nichts hochgeladen — das Löschen auf dem Server ist hier nur Formsache.
    void deleteProject(id).catch(() => {})
    throw new Error('Die Videodatei konnte nicht lokal gespeichert werden. Möglicherweise ist der Speicherplatz des Browsers voll.', { cause })
  }
  updateProject(id, await readVideoMetadata(file))
  return id
}

export async function getLocalVideo(projectId: string): Promise<Blob | null> {
  const value = await withStore<Blob | undefined>('readonly', (store) => store.get(projectId))
  return value instanceof Blob ? value : null
}

export async function deleteLocalVideo(id: string): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(id))
}
