'use client'

import type { Clip, Project } from '@/types/database'
import type { BrandKit, OutputFormat, ProjectPublishing, ProjectSettings } from '@/types/workspace'
import {
  brandKitToRow, clipToRow, projectToRow, rowToClip, rowToProject, WORKSPACE_SCHEMA_MISSING,
  type BrandKitRow, type ClipRow, type ProjectRow, type WorkspaceSnapshot,
} from '@/lib/workspace-rows'

/**
 * Abgleich des Workspace mit der Datenbank.
 *
 * Der Store bleibt die Quelle für die Oberfläche; dieses Modul merkt sich, was
 * zuletzt auf dem Server lag, und schickt nach jeder Änderung — kurz
 * gebündelt — nur die Unterschiede an `/api/workspace`. Ob sich etwas geändert
 * hat, entscheidet zuerst die Objektreferenz (der Store ändert nie in place),
 * danach der Inhalt: Ein neu erzeugtes, aber gleiches Objekt löst keinen
 * Upload aus.
 *
 * Einträge, die dieses Gerät neu anlegt, gehen als `created` raus und werden
 * nur eingefügt, wenn es sie noch nicht gibt. Übernehmen zwei offene Geräte
 * dasselbe Pipeline-Ergebnis (gleiche Clip-IDs), überschreibt das zweite
 * deshalb nicht, was auf dem ersten inzwischen bearbeitet wurde.
 */

export interface WorkspaceData {
  projects: Project[]
  clips: Clip[]
  favoriteClipIds: string[]
  brandKits: BrandKit[]
  projectSettings: Record<string, ProjectSettings>
  removedWords: Record<string, number[]>
  outputFormats: Record<string, OutputFormat>
  projectPublishing: Record<string, ProjectPublishing>
}

export const EMPTY_WORKSPACE: WorkspaceData = {
  projects: [],
  clips: [],
  favoriteClipIds: [],
  brandKits: [],
  projectSettings: {},
  removedWords: {},
  outputFormats: {},
  projectPublishing: {},
}

interface ChangeSet<T> { projects: ProjectRow[]; clips: ClipRow[]; brandKits: T[] }

interface WorkspaceRequest {
  created: ChangeSet<BrandKitRow>
  updated: ChangeSet<BrandKitRow>
  deleted: { projectIds: string[]; clipIds: string[]; brandKitIds: string[] }
  initialize?: boolean
}

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

export class WorkspaceLoadError extends Error {}

/** `schema-missing`: Die Migration fehlt — der Browser bleibt beim lokalen Speicher. */
export async function fetchWorkspace(): Promise<WorkspaceSnapshot | 'schema-missing'> {
  const response = await fetch('/api/workspace', { cache: 'no-store' }).catch(() => null)
  if (!response) throw new WorkspaceLoadError('Der Server ist gerade nicht erreichbar.')
  const data = await response.json().catch(() => null) as (WorkspaceSnapshot & { error?: string; code?: string }) | null
  if (response.status === 503 && data?.code === WORKSPACE_SCHEMA_MISSING) return 'schema-missing'
  if (!response.ok || !data || !Array.isArray(data.projects) || !Array.isArray(data.clips) || !Array.isArray(data.brandKits)) {
    throw new WorkspaceLoadError(typeof data?.error === 'string' ? data.error : 'Dein Workspace konnte nicht geladen werden.')
  }
  return data
}

export function snapshotToData(snapshot: WorkspaceSnapshot, owner: string): WorkspaceData {
  const data: WorkspaceData = { ...EMPTY_WORKSPACE, projectSettings: {}, removedWords: {}, outputFormats: {}, projectPublishing: {} }
  const projects: Project[] = []
  for (const row of snapshot.projects) {
    const { project, settings, publishing } = rowToProject(row, owner)
    projects.push(project)
    if (settings) data.projectSettings[project.id] = settings
    if (publishing) data.projectPublishing[project.id] = publishing
  }
  const clips: Clip[] = []
  const favorites: string[] = []
  for (const row of snapshot.clips) {
    const { clip, removedWords, outputFormat, favorite } = rowToClip(row, owner)
    clips.push(clip)
    if (removedWords.length) data.removedWords[clip.id] = removedWords
    if (outputFormat) data.outputFormats[clip.id] = outputFormat
    if (favorite) favorites.push(clip.id)
  }
  // Neueste Projekte zuerst — so, wie der Store neue Projekte einreiht.
  projects.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return {
    ...data,
    projects,
    clips,
    favoriteClipIds: favorites,
    brandKits: snapshot.brandKits.map((kit) => ({ id: kit.id, name: kit.name, style: kit.style })),
  }
}

/**
 * Ergänzt `base` um alles aus `extra`, was es dort noch nicht gibt. Was schon
 * existiert, bleibt, wie es in `base` steht; Clips ohne Projekt fallen weg.
 */
export function mergeMissing(base: WorkspaceData, extra: WorkspaceData): WorkspaceData {
  const projectIds = new Set(base.projects.map((project) => project.id))
  const addedProjects = extra.projects.filter((project) => !projectIds.has(project.id))
  for (const project of addedProjects) projectIds.add(project.id)
  const clipIds = new Set(base.clips.map((clip) => clip.id))
  const addedClips = extra.clips.filter((clip) => !clipIds.has(clip.id) && projectIds.has(clip.project_id))
  const kitIds = new Set(base.brandKits.map((kit) => kit.id))
  const addedKits = extra.brandKits.filter((kit) => !kitIds.has(kit.id))
  if (!addedProjects.length && !addedClips.length && !addedKits.length) return base

  const pick = <T>(record: Record<string, T>, ids: { id: string }[]) =>
    Object.fromEntries(ids.flatMap(({ id }) => (id in record ? [[id, record[id]]] : [])))
  const addedClipIds = new Set(addedClips.map((clip) => clip.id))
  return {
    projects: [...addedProjects, ...base.projects].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    clips: [...base.clips, ...addedClips],
    favoriteClipIds: [...base.favoriteClipIds, ...extra.favoriteClipIds.filter((id) => addedClipIds.has(id))],
    brandKits: [...base.brandKits, ...addedKits],
    projectSettings: { ...base.projectSettings, ...pick(extra.projectSettings, addedProjects) },
    projectPublishing: { ...base.projectPublishing, ...pick(extra.projectPublishing, addedProjects) },
    removedWords: { ...base.removedWords, ...pick(extra.removedWords, addedClips) },
    outputFormats: { ...base.outputFormats, ...pick(extra.outputFormats, addedClips) },
  }
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/** Was zuletzt auf dem Server lag: die Bausteine eines Eintrags und sein Inhalt. */
interface SyncedEntry { refs: readonly unknown[]; json: string }

interface Synced {
  projects: Map<string, SyncedEntry>
  clips: Map<string, SyncedEntry>
  brandKits: Map<string, SyncedEntry>
}

interface Candidate<R> { id: string; refs: readonly unknown[]; row: R; json: string }

interface Plan {
  created: { projects: Candidate<ProjectRow>[]; clips: Candidate<ClipRow>[]; brandKits: Candidate<BrandKitRow>[] }
  updated: { projects: Candidate<ProjectRow>[]; clips: Candidate<ClipRow>[]; brandKits: Candidate<BrandKitRow>[] }
  /** Inhalt unverändert, nur neue Objekte — nur die Referenzen nachführen. */
  unchanged: { kind: keyof Synced; id: string; refs: readonly unknown[] }[]
  deleted: { projectIds: string[]; clipIds: string[]; brandKitIds: string[]; cascadedClipIds: string[] }
}

function entries(data: WorkspaceData) {
  const favorites = new Set(data.favoriteClipIds)
  return {
    projects: data.projects.map((project) => ({
      id: project.id,
      refs: [project, data.projectSettings[project.id], data.projectPublishing[project.id]] as const,
      build: () => projectToRow(project, data.projectSettings[project.id], data.projectPublishing[project.id]),
    })),
    clips: data.clips.map((clip) => ({
      id: clip.id,
      refs: [clip, data.removedWords[clip.id], data.outputFormats[clip.id], favorites.has(clip.id)] as const,
      build: () => clipToRow(clip, data.removedWords[clip.id], data.outputFormats[clip.id], favorites.has(clip.id)),
    })),
    brandKits: data.brandKits.map((kit) => ({ id: kit.id, refs: [kit] as const, build: () => brandKitToRow(kit) })),
  }
}

function sameRefs(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function snapshotOf(data: WorkspaceData): Synced {
  const all = entries(data)
  const map = <R>(list: { id: string; refs: readonly unknown[]; build: () => R }[]) =>
    new Map(list.map((entry) => [entry.id, { refs: entry.refs, json: JSON.stringify(entry.build()) }]))
  return { projects: map(all.projects), clips: map(all.clips), brandKits: map(all.brandKits) }
}

function plan(data: WorkspaceData, synced: Synced): Plan {
  const all = entries(data)
  const result: Plan = {
    created: { projects: [], clips: [], brandKits: [] },
    updated: { projects: [], clips: [], brandKits: [] },
    unchanged: [],
    deleted: { projectIds: [], clipIds: [], brandKitIds: [], cascadedClipIds: [] },
  }
  const compare = <K extends keyof Synced, R>(kind: K, list: { id: string; refs: readonly unknown[]; build: () => R }[], created: Candidate<R>[], updated: Candidate<R>[]) => {
    for (const entry of list) {
      const previous = synced[kind].get(entry.id)
      if (previous && sameRefs(previous.refs, entry.refs)) continue
      const row = entry.build()
      const json = JSON.stringify(row)
      if (previous?.json === json) result.unchanged.push({ kind, id: entry.id, refs: entry.refs })
      else (previous ? updated : created).push({ id: entry.id, refs: entry.refs, row, json })
    }
  }
  compare('projects', all.projects, result.created.projects, result.updated.projects)
  compare('clips', all.clips, result.created.clips, result.updated.clips)
  compare('brandKits', all.brandKits, result.created.brandKits, result.updated.brandKits)

  const projectIds = new Set(data.projects.map((project) => project.id))
  const clipIds = new Set(data.clips.map((clip) => clip.id))
  const kitIds = new Set(data.brandKits.map((kit) => kit.id))
  for (const id of synced.projects.keys()) if (!projectIds.has(id)) result.deleted.projectIds.push(id)
  const deletedProjects = new Set(result.deleted.projectIds)
  for (const [id, entry] of synced.clips) {
    if (clipIds.has(id)) continue
    // Clips gelöschter Projekte löscht die Datenbank per Cascade mit.
    const projectId = (JSON.parse(entry.json) as ClipRow).project_id
    ;(deletedProjects.has(projectId) ? result.deleted.cascadedClipIds : result.deleted.clipIds).push(id)
  }
  for (const id of synced.brandKits.keys()) if (!kitIds.has(id)) result.deleted.brandKitIds.push(id)
  return result
}

function isEmpty(plan: Plan) {
  const { created, updated, deleted } = plan
  return !created.projects.length && !created.clips.length && !created.brandKits.length &&
    !updated.projects.length && !updated.clips.length && !updated.brandKits.length &&
    !deleted.projectIds.length && !deleted.clipIds.length && !deleted.brandKitIds.length && !deleted.cascadedClipIds.length
}

/** Unter dem Limit der Route (4 MB) und dem von Vercel (4,5 MB) — mit Luft für die Hülle. */
const MAX_CHUNK_CHARS = 2_500_000
const MAX_CHUNK_CLIPS = 1500

interface Chunk { request: WorkspaceRequest; created: Plan['created']; updated: Plan['updated'] }

/**
 * Teilt einen Plan in Anfragen. Projekte gehen mit der ersten, damit ihre
 * Clips sie vorfinden; Brand Kits, Löschungen und die Markierung mit der
 * letzten.
 */
function chunk(plan: Plan, initialize: boolean): Chunk[] {
  const empty = (): Chunk => ({
    request: { created: { projects: [], clips: [], brandKits: [] }, updated: { projects: [], clips: [], brandKits: [] }, deleted: { projectIds: [], clipIds: [], brandKitIds: [] } },
    created: { projects: [], clips: [], brandKits: [] },
    updated: { projects: [], clips: [], brandKits: [] },
  })
  const chunks = [empty()]
  let size = 0
  let clipCount = 0
  const add = <R>(mode: 'created' | 'updated', kind: 'projects' | 'clips' | 'brandKits', candidate: Candidate<R>) => {
    let current = chunks[chunks.length - 1]
    if (kind === 'clips' && size > 0 && (size + candidate.json.length > MAX_CHUNK_CHARS || clipCount >= MAX_CHUNK_CLIPS)) {
      current = empty()
      chunks.push(current)
      size = 0
      clipCount = 0
    }
    ;(current.request[mode][kind] as R[]).push(candidate.row)
    ;(current[mode][kind] as Candidate<R>[]).push(candidate)
    size += candidate.json.length
    if (kind === 'clips') clipCount += 1
  }
  for (const candidate of plan.created.projects) add('created', 'projects', candidate)
  for (const candidate of plan.updated.projects) add('updated', 'projects', candidate)
  for (const candidate of plan.created.clips) add('created', 'clips', candidate)
  for (const candidate of plan.updated.clips) add('updated', 'clips', candidate)
  for (const candidate of plan.created.brandKits) add('created', 'brandKits', candidate)
  for (const candidate of plan.updated.brandKits) add('updated', 'brandKits', candidate)
  const last = chunks[chunks.length - 1].request
  last.deleted = { projectIds: plan.deleted.projectIds, clipIds: plan.deleted.clipIds, brandKitIds: plan.deleted.brandKitIds }
  if (initialize) last.initialize = true
  return chunks
}

class SyncRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

interface Rejected { kind: 'project' | 'clip' | 'brandKit'; id: string }

async function send(request: WorkspaceRequest): Promise<Rejected[]> {
  const response = await fetch('/api/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  }).catch(() => null)
  if (!response) throw new SyncRequestError('Keine Verbindung zum Server.', 0)
  const data = await response.json().catch(() => null) as { rejected?: Rejected[]; error?: string } | null
  if (!response.ok) throw new SyncRequestError(typeof data?.error === 'string' ? data.error : 'Speichern fehlgeschlagen.', response.status)
  return Array.isArray(data?.rejected) ? data.rejected : []
}

const DEBOUNCE_MS = 600
const RETRY_MS = [2000, 5000, 15_000, 30_000, 60_000]

export interface RemoteSync {
  /** Nach dem Laden: Das hier liegt auf dem Server. */
  reset(serverState: WorkspaceData): void
  /** Nach einer Änderung im Store. */
  schedule(): void
  /** Sofort speichern; `true`, wenn danach nichts mehr aussteht. */
  flush(): Promise<boolean>
  /** Beim nächsten erfolgreichen Speichern `workspace_initialized_at` setzen. */
  markInitialize(): void
  pending(): boolean
  dispose(): void
}

export function createRemoteSync({ read, report, onSynced }: {
  read: () => WorkspaceData
  /** Fehlermeldung für die Oberfläche; `null`, sobald wieder gespeichert wird. */
  report: (message: string | null) => void
  /** Nach jedem Speichern, nach dem nichts mehr aussteht. */
  onSynced?: () => void
}): RemoteSync {
  let synced: Synced = { projects: new Map(), clips: new Map(), brandKits: new Map() }
  let dirty = false
  let initialize = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<boolean> | null = null
  let again = false
  let failures = 0
  let disposed = false

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = undefined } }
  const later = (delay: number) => {
    clearTimer()
    if (!disposed) timer = setTimeout(() => { timer = undefined; void flush() }, delay)
  }

  const record = (chunk: Chunk) => {
    for (const mode of ['created', 'updated'] as const) {
      for (const candidate of chunk[mode].projects) synced.projects.set(candidate.id, { refs: candidate.refs, json: candidate.json })
      for (const candidate of chunk[mode].clips) synced.clips.set(candidate.id, { refs: candidate.refs, json: candidate.json })
      for (const candidate of chunk[mode].brandKits) synced.brandKits.set(candidate.id, { refs: candidate.refs, json: candidate.json })
    }
  }

  const run = async (): Promise<boolean> => {
    let rejectedCount = 0
    do {
      again = false
      dirty = false
      const current = plan(read(), synced)
      for (const { kind, id, refs } of current.unchanged) {
        const entry = synced[kind].get(id)
        if (entry) synced[kind].set(id, { ...entry, refs })
      }
      if (isEmpty(current) && !initialize) break
      const sendInitialize = initialize
      for (const part of chunk(current, sendInitialize)) {
        // Abgelehnte Einträge gelten trotzdem als gespeichert — sonst
        // scheiterte jeder weitere Versuch an denselben Daten.
        rejectedCount += (await send(part.request)).length
        record(part)
      }
      for (const id of current.deleted.projectIds) synced.projects.delete(id)
      for (const id of [...current.deleted.clipIds, ...current.deleted.cascadedClipIds]) synced.clips.delete(id)
      for (const id of current.deleted.brandKitIds) synced.brandKits.delete(id)
      if (sendInitialize) initialize = false
    } while ((again || dirty) && !disposed)
    return rejectedCount === 0
  }

  const flush = (): Promise<boolean> => {
    clearTimer()
    if (inFlight) { again = true; return inFlight }
    inFlight = run().then((clean) => {
      failures = 0
      report(clean ? null : 'Einige Änderungen hatten ein ungültiges Format und konnten nicht gespeichert werden.')
      if (!dirty) onSynced?.()
      return !dirty
    }, (cause: unknown) => {
      failures += 1
      dirty = true
      const status = cause instanceof SyncRequestError ? cause.status : 0
      // Ein einzelner Aussetzer ist kein Grund für eine Meldung.
      if (failures >= 2 || status === 401) {
        report(status === 401
          ? 'Deine Sitzung ist abgelaufen. Melde dich erneut an, damit deine Änderungen gespeichert werden.'
          : 'Deine Änderungen konnten nicht gespeichert werden. Es wird automatisch erneut versucht — lass diesen Tab bitte offen.')
      }
      later(RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)])
      return false
    }).finally(() => {
      inFlight = null
      // Eine Änderung zwischen dem letzten Durchgang und hier fand noch einen
      // laufenden Abgleich vor und hat deshalb keinen eigenen geplant.
      if (dirty && !timer) later(DEBOUNCE_MS)
    })
    return inFlight
  }

  // Wer den Tab schließt, während noch etwas aussteht, bekommt die Rückfrage
  // des Browsers — und das Speichern läuft sofort los.
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!dirty && !inFlight) return
    void flush()
    event.preventDefault()
  }
  const hidden = () => { if (document.visibilityState === 'hidden' && (dirty || timer)) void flush() }
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('visibilitychange', hidden)

  return {
    reset(serverState) {
      synced = snapshotOf(serverState)
    },
    schedule() {
      dirty = true
      if (inFlight) { again = true; return }
      // Nach Fehlern wartet der geplante Wiederholungsversuch.
      if (failures === 0) later(DEBOUNCE_MS)
    },
    flush,
    markInitialize() { initialize = true },
    pending: () => dirty || inFlight !== null || initialize,
    dispose() {
      disposed = true
      clearTimer()
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', hidden)
    },
  }
}
