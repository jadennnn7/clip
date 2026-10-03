'use client'

import { create } from 'zustand'
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from '../../remotion/captions/presets'
import { clipOutputDuration } from '@/lib/clip-export'
import { createHookOverlay, draftHookTitle, HOOK_SECONDS, isHookOverlay } from '@/lib/hook-title'
import type { CaptionStyle, Clip, Project } from '@/types/database'
import type { BrandKit, OutputFormat, ProjectSettings, ProjectPublishing } from '@/types/workspace'
import {
  createRemoteSync, EMPTY_WORKSPACE, fetchWorkspace, mergeMissing, snapshotToData,
  type RemoteSync, type WorkspaceData,
} from './workspace-sync'

const STORAGE_KEY = 'omegaclip-workspace-v1'
/**
 * Besitzer des Workspace ohne Anmeldung (Demo-Modus ohne Supabase). Er
 * liest und schreibt den ursprünglichen, ungeteilten Schlüssel.
 */
export const LOCAL_WORKSPACE_OWNER = 'local'

/**
 * Jedes Konto hat seinen eigenen Workspace im Browser. Wer sich abmeldet und
 * jemand anderes anmeldet, sieht sonst die Projekte des Vorgängers.
 */
export function storageKey(owner: string): string {
  return owner === LOCAL_WORKSPACE_OWNER ? STORAGE_KEY : `${STORAGE_KEY}:${owner}`
}
/**
 * Version des gespeicherten Workspace. 2: Clips haben einen Hook-Titel, und
 * der Standard-Untertitel ist `clean`. Version 1 wird beim Laden einmalig
 * hochgezogen (siehe `upgradeClips`).
 */
const STORAGE_VERSION = 2

interface WorkspaceState extends WorkspaceData {
  /** Wessen Workspace geladen ist; `null`, solange niemand feststeht. */
  owner: string | null
  hydrated: boolean
  persistenceError: string | null
  hydrate: (owner: string) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  /**
   * Löscht erst auf dem Server, dann im Browser. Lehnt der Server ab, bleibt
   * das Projekt vollständig erhalten und das Promise wird mit einer lesbaren
   * Meldung abgelehnt.
   */
  deleteProject: (id: string) => Promise<void>
  saveProjectClips: (projectId: string, clips: Clip[], removedWords?: Record<string, number[]>) => void
  updateClip: (id: string, patch: Partial<Clip>) => void
  duplicateClip: (id: string) => string | null
  deleteClips: (ids: string[]) => void
  toggleFavorite: (id: string) => void
  saveBrandKit: (kit: BrandKit) => void
  deleteBrandKit: (id: string) => void
  applyBrandKit: (kitId: string, clipIds: string[]) => void
  setOutputFormat: (clipId: string, format: OutputFormat) => void
  setProjectPublishing: (projectId: string, value: ProjectPublishing) => void
  createProjectDraft: (input: {
    title: string
    source_type: Project['source_type']
    source_url: string | null
    rights_confirmed: boolean
    settings: ProjectSettings
  }) => string
}

function pickData(state: WorkspaceData): WorkspaceData {
  return {
    projects: state.projects,
    clips: state.clips,
    favoriteClipIds: state.favoriteClipIds,
    brandKits: state.brandKits,
    projectSettings: state.projectSettings,
    removedWords: state.removedWords,
    outputFormats: state.outputFormats,
    projectPublishing: state.projectPublishing,
  }
}

/**
 * Löscht eine Ressource auf dem Server. Was dort schon fehlt (404), gilt als
 * gelöscht; jede andere Antwort wird mit der Meldung des Servers abgelehnt.
 */
async function deleteOnServer(path: string): Promise<void> {
  const response = await fetch(path, { method: 'DELETE', cache: 'no-store' }).catch(() => null)
  if (!response) throw new Error('Der Server ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es erneut.')
  if (response.ok || response.status === 404) return
  const data = await response.json().catch(() => null) as { error?: unknown } | null
  throw new Error(typeof data?.error === 'string' ? data.error : 'Der Server hat das Löschen abgelehnt. Bitte versuche es erneut.')
}

/**
 * Räumt die Serverseite eines Projekts ab. Zuerst die Quelle — der
 * Pipeline-Job stoppt dabei auch die geplanten Veröffentlichungen und darf
 * ablehnen, solange ein Upload läuft. Die Renders folgen erst danach, damit
 * eine Ablehnung die fertigen Clips nicht schon angefasst hat.
 */
async function deleteProjectOnServer(project: Project, clips: Clip[]): Promise<void> {
  if (project.source_type === 'upload') await deleteOnServer(`/api/uploads/${project.id}`)
  else if (project.trigger_run_id) await deleteOnServer(`/api/pipeline/${project.trigger_run_id}`)
  await Promise.all(clips.flatMap((clip) => clip.render_job_id ? [deleteOnServer(`/api/render/${clip.render_job_id}`)] : []))
}

/** Fertige Clips sind nur Kopien; ein übrig gebliebener Render ist kein Grund, das Löschen zu blockieren. */
function deleteRenders(clips: Clip[]) {
  for (const clip of clips) if (clip.render_job_id) void deleteOnServer(`/api/render/${clip.render_job_id}`).catch(() => {})
}

function withoutKeys<T>(record: Record<string, T>, keys: Set<string>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key)))
}

function pruneClips(state: WorkspaceData, removed: Set<string>): Partial<WorkspaceData> {
  return {
    clips: state.clips.filter((clip) => !removed.has(clip.id)),
    favoriteClipIds: state.favoriteClipIds.filter((id) => !removed.has(id)),
    outputFormats: withoutKeys(state.outputFormats, removed),
    removedWords: withoutKeys(state.removedWords, removed),
  }
}

/**
 * Ein neuer Workspace ist leer — Projekte und Clips entstehen aus eigenen
 * Videos. Nur die Brand-Kits sind Vorlagen, keine Beispieldaten.
 */
function seedBrandKits(): BrandKit[] {
  return [
    { id: 'brand-studio', name: 'Studio', style: { ...CAPTION_PRESETS.minimal } },
    { id: 'brand-impact', name: 'Signal', style: { ...CAPTION_PRESETS.karaoke } },
  ]
}

const seedData: WorkspaceData = { ...EMPTY_WORKSPACE, brandKits: seedBrandKits() }

/**
 * Entfernt die Beispielprojekte früherer Versionen aus einem gespeicherten
 * Workspace — samt ihren Clips, Favoriten und Planungseinträgen. Eigene
 * Projekte bleiben unberührt; die Beispiele erkennt man an `mock-user`.
 */
function withoutSamples(data: WorkspaceData): WorkspaceData | null {
  const samples = new Set(data.projects.filter((project) => project.user_id === 'mock-user').map((project) => project.id))
  if (samples.size === 0) return null
  const sampleClips = new Set(data.clips.filter((clip) => samples.has(clip.project_id)).map((clip) => clip.id))
  return {
    ...data,
    ...pruneClips(data, sampleClips),
    projects: data.projects.filter((project) => !samples.has(project.id)),
    projectSettings: withoutKeys(data.projectSettings, samples),
    projectPublishing: withoutKeys(data.projectPublishing, samples),
  } as WorkspaceData
}

/** Der frühere Standard, unverändert übernommen — also nie bewusst gewählt. */
function isLegacyDefaultStyle(style: CaptionStyle): boolean {
  const legacy = CAPTION_PRESETS.hormozi
  return Object.keys(style).every((key) => key === 'enabled' || key in legacy) &&
    (Object.keys(legacy) as Array<keyof CaptionStyle>).every((key) => style[key] === legacy[key])
}

/**
 * Bringt Clips aus Version 1 auf den heutigen Stand: Wer noch nie ein
 * Overlay hatte, bekommt einen Hook-Titel, und Untertitel im alten Standard
 * bekommen den heutigen. Selbst gestaltete Untertitel bleiben, wie sie sind.
 * Läuft nur einmal — sonst würde ein später bewusst gewähltes „Hormozi"
 * beim nächsten Laden wieder ersetzt.
 */
function upgradeClips(clips: Clip[]): Clip[] {
  return clips.map((clip) => {
    const patch: Partial<Clip> = {}
    if (clip.overlays === undefined) {
      const text = draftHookTitle(clip)
      patch.overlays = text ? [createHookOverlay(text, clipOutputDuration(clip))] : []
    }
    if (isLegacyDefaultStyle(clip.caption_style)) {
      patch.caption_style = { ...DEFAULT_CAPTION_STYLE, ...(clip.caption_style.enabled === false ? { enabled: false } : {}) }
    }
    if (Object.keys(patch).length === 0) return clip
    // Der fertige Render zeigt den alten Stand.
    return { ...clip, ...patch, render_status: 'pending', render_key: null }
  })
}

/** Bis hierhin kamen Clips aus Links mit ausgeblendeten Untertiteln an (`segmentToClip`). */
const CAPTIONS_ON_BY_DEFAULT_SINCE = Date.parse('2026-10-02T09:15:00Z')
/** Bis hierhin stand der Hook-Titel über dem ganzen Clip statt `HOOK_SECONDS` lang. */
const SHORT_HOOK_SINCE = Date.parse('2026-10-02T09:30:00Z')
/** Bis hierhin war `clean` der Standard-Untertitel, seitdem `hormozi`. */
const HORMOZI_DEFAULT_SINCE = Date.parse('2026-10-02T09:37:00Z')
const FRAME_SECONDS = 1 / 30

/**
 * Zieht Clips auf die heutigen Voreinstellungen, die nur anders aussehen,
 * weil sie vorher entstanden sind: Untertitel, die die alte Voreinstellung
 * ausgeblendet hatte, Untertitel im alten Standard `clean` und Hook-Titel
 * über den ganzen Clip. Wer den Clip seitdem bearbeitet hat, hat einen
 * späteren `updated_at` — dessen Entscheidung bleibt. Läuft bei jedem Laden;
 * einmal angepasst, passt kein Clip mehr.
 */
function applyCurrentDefaults(clips: Clip[]): Clip[] {
  let changed = false
  const result = clips.map((clip) => {
    const touched = Date.parse(clip.updated_at)
    const patch: Partial<Clip> = {}
    let style = clip.caption_style
    if (touched < CAPTIONS_ON_BY_DEFAULT_SINCE && style.enabled === false &&
      (style.preset === 'clean' || isLegacyDefaultStyle(style))) {
      style = { ...style, enabled: true }
    }
    if (touched < HORMOZI_DEFAULT_SINCE && style.preset === 'clean') {
      style = { ...DEFAULT_CAPTION_STYLE, ...(style.enabled === false ? { enabled: false } : {}) }
    }
    if (style !== clip.caption_style) patch.caption_style = style
    if (touched < SHORT_HOOK_SINCE && Array.isArray(clip.overlays)) {
      const duration = clipOutputDuration(clip)
      const overlays = clip.overlays.map((overlay) => isHookOverlay(overlay) && overlay.start < FRAME_SECONDS &&
        overlay.end >= duration - FRAME_SECONDS && overlay.end > HOOK_SECONDS + FRAME_SECONDS
        ? { ...overlay, end: HOOK_SECONDS }
        : overlay)
      if (overlays.some((overlay, index) => overlay !== clip.overlays![index])) patch.overlays = overlays
    }
    if (Object.keys(patch).length === 0) return clip
    changed = true
    // Der fertige Render zeigt den alten Stand.
    return { ...clip, ...patch, render_status: 'pending' as const, render_key: null }
  })
  return changed ? result : clips
}

interface StoredWorkspace {
  data: WorkspaceData
  /** Beim Lesen hochgezogen oder bereinigt — die gespeicherte Fassung ist veraltet. */
  changed: boolean
  /** Kam aus dem gemeinsamen Schlüssel von vor der Trennung nach Konten. */
  fromLegacy: boolean
}

/**
 * Der im Browser gespeicherte Workspace; `null`, wenn keiner da ist. Wirft,
 * wenn die gespeicherten Daten nicht lesbar sind.
 */
function readBrowserWorkspace(owner: string): StoredWorkspace | null {
  let raw = localStorage.getItem(storageKey(owner))
  // Vor der Trennung nach Konten lag der Workspace unter einem gemeinsamen
  // Schlüssel. Das erste Konto, das sich danach in diesem Browser anmeldet,
  // übernimmt ihn — und nur dieses.
  const legacy = owner === LOCAL_WORKSPACE_OWNER || raw ? null : localStorage.getItem(STORAGE_KEY)
  if (legacy) raw = legacy
  if (!raw) return null
  const saved = JSON.parse(raw)
  const data = saved?.data as WorkspaceData | undefined
  if ((saved?.version !== 1 && saved?.version !== STORAGE_VERSION) || !data ||
    !Array.isArray(data.projects) || !Array.isArray(data.clips) ||
    !Array.isArray(data.brandKits) || !Array.isArray(data.favoriteClipIds) ||
    !data.projects.every((project) => typeof project.id === 'string' && typeof project.title === 'string') ||
    !data.clips.every((clip) => typeof clip.id === 'string' && Array.isArray(clip.words) && clip.caption_style)) {
    throw new Error('Invalid workspace')
  }
  let loaded = pickData({ ...seedData, ...data })
  const outdated = saved.version !== STORAGE_VERSION
  if (outdated) loaded = { ...loaded, clips: upgradeClips(loaded.clips) }
  const current = applyCurrentDefaults(loaded.clips)
  const restored = current !== loaded.clips
  if (restored) loaded = { ...loaded, clips: current }
  const cleaned = withoutSamples(loaded)
  return { data: cleaned ?? loaded, changed: outdated || restored || Boolean(cleaned), fromLegacy: Boolean(legacy) }
}

function forgetBrowserWorkspace(owner: string) {
  try {
    localStorage.removeItem(storageKey(owner))
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* Speicher gesperrt: bleibt eben liegen */ }
}

/** Aus dem Browser übernommene Einträge gehören ab jetzt dem angemeldeten Konto. */
function ownedBy(data: WorkspaceData, owner: string): WorkspaceData {
  return {
    ...data,
    projects: data.projects.map((project) => ({ ...project, user_id: owner })),
    clips: data.clips.map((clip) => ({ ...clip, user_id: owner })),
  }
}

const LOAD_RETRY_MS = [1000, 3000, 10_000]
/** Wer länger weg war, bekommt beim Zurückkommen den Stand der anderen Geräte. */
const REFRESH_AFTER_HIDDEN_MS = 60_000

/**
 * Der Workspace eines angemeldeten Kontos liegt in der Datenbank
 * (`/api/workspace`, siehe `workspace-sync.ts`). Der localStorage bleibt für
 * den Demo-Modus ohne Supabase und als Übergang, solange die Migration fehlt.
 * Was ein Browser noch lokal gespeichert hat, wird beim ersten Laden einmalig
 * in die Datenbank übernommen.
 */
export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  /** `null` bis feststeht, wohin gespeichert wird. */
  let storage: 'browser' | 'database' | null = null
  let remote: RemoteSync | null = null
  let loading: string | null = null
  let detach: (() => void) | null = null

  const commit = (patch: Partial<WorkspaceData>) => {
    set(patch)
    if (storage === 'database') {
      remote?.schedule()
      return
    }
    // Vor dem Laden steht nicht fest, wessen Workspace das ist. Gespeichert
    // wird erst danach — sonst überschriebe der leere Anfangszustand den
    // gespeicherten Workspace.
    const { owner } = get()
    if (storage !== 'browser' || owner === null) return
    try {
      localStorage.setItem(storageKey(owner), JSON.stringify({ version: STORAGE_VERSION, data: pickData(get()) }))
      if (get().persistenceError) set({ persistenceError: null })
    } catch {
      set({ persistenceError: 'Dein Browser konnte die Änderungen nicht speichern. Bitte exportiere wichtige Clips, bevor du die Seite schließt.' })
    }
  }

  const reset = () => {
    remote?.dispose()
    remote = null
    detach?.()
    detach = null
    loading = null
    storage = null
  }

  const hydrateBrowser = (owner: string, keep?: WorkspaceData) => {
    storage = 'browser'
    try {
      const stored = readBrowserWorkspace(owner)
      if (stored && (stored.changed || stored.fromLegacy)) {
        localStorage.setItem(storageKey(owner), JSON.stringify({ version: STORAGE_VERSION, data: stored.data }))
        if (stored.fromLegacy) localStorage.removeItem(STORAGE_KEY)
      }
      const base = stored?.data ?? seedData
      set({ ...(keep ? mergeMissing(base, keep) : base), hydrated: true })
      // Während des Ladens Angelegtes gleich mitspeichern.
      if (keep?.projects.length || keep?.clips.length) commit({})
    } catch {
      set({ hydrated: true, persistenceError: 'Der gespeicherte Workspace konnte nicht geladen werden. Es wird ein leerer Workspace angezeigt.' })
    }
  }

  const hydrateDatabase = async (owner: string) => {
    storage = null
    loading = owner
    let snapshot: Awaited<ReturnType<typeof fetchWorkspace>> | undefined
    for (let attempt = 0; snapshot === undefined; attempt += 1) {
      try {
        snapshot = await fetchWorkspace()
      } catch (cause) {
        if (loading !== owner) return
        if (attempt >= 1) {
          set({ persistenceError: `${cause instanceof Error ? cause.message : 'Dein Workspace konnte nicht geladen werden.'} Es wird automatisch erneut versucht.` })
        }
        await new Promise((resolve) => setTimeout(resolve, LOAD_RETRY_MS[Math.min(attempt, LOAD_RETRY_MS.length - 1)]))
        if (loading !== owner) return
      }
    }
    if (loading !== owner) return
    loading = null
    // Was während des Ladens schon entstanden ist, bleibt erhalten.
    const early = pickData(get())

    if (snapshot === 'schema-missing') {
      console.warn('[omegaclip] Die Workspace-Tabellen fehlen — der Workspace bleibt vorerst im Browser. Migration: supabase/migrations/20260929000000_workspace.sql')
      set({ persistenceError: null })
      hydrateBrowser(owner, early)
      return
    }

    const server = snapshotToData(snapshot, owner)
    let stored: StoredWorkspace | null = null
    try { stored = readBrowserWorkspace(owner) } catch { /* unlesbar: nichts zu übernehmen */ }
    let data = server
    if (stored) data = mergeMissing(data, ownedBy(stored.data, owner))
    else if (!snapshot.initialized) data = mergeMissing(data, { ...EMPTY_WORKSPACE, brandKits: seedBrandKits() })
    data = mergeMissing(data, early)
    // Nach `remote.reset(server)` als Änderung erkannt und hochgeladen.
    const current = applyCurrentDefaults(data.clips)
    if (current !== data.clips) data = { ...data, clips: current }

    let migrated = !stored
    remote = createRemoteSync({
      read: () => pickData(get()),
      report: (message) => set({ persistenceError: message }),
      // Erst wenn alles in der Datenbank ist, darf die Kopie im Browser weg.
      onSynced: () => {
        if (migrated) return
        migrated = true
        forgetBrowserWorkspace(owner)
      },
    })
    remote.reset(server)
    if (!snapshot.initialized) remote.markInitialize()
    storage = 'database'
    set({ ...data, hydrated: true, persistenceError: null })
    if (data !== server || !snapshot.initialized) void remote.flush()

    let hiddenAt = 0
    const visibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      if (!hiddenAt || Date.now() - hiddenAt < REFRESH_AFTER_HIDDEN_MS) return
      hiddenAt = 0
      void refresh(owner)
    }
    document.addEventListener('visibilitychange', visibility)
    detach = () => document.removeEventListener('visibilitychange', visibility)
  }

  /** Stand der anderen Geräte übernehmen — nur, wenn hier nichts aussteht. */
  const refresh = async (owner: string) => {
    if (!remote || remote.pending()) return
    const snapshot = await fetchWorkspace().catch(() => null)
    if (!snapshot || snapshot === 'schema-missing' || get().owner !== owner || !remote || remote.pending()) return
    const server = snapshotToData(snapshot, owner)
    remote.reset(server)
    set(server)
  }

  return {
    ...seedData,
    owner: null,
    hydrated: false,
    persistenceError: null,
    hydrate: (owner) => {
      if (typeof window === 'undefined') return
      if (get().owner === owner && (get().hydrated || loading === owner)) return
      // Ein anderes Konto im selben Tab: nichts vom vorherigen darf stehen bleiben.
      reset()
      if (owner === LOCAL_WORKSPACE_OWNER) {
        set({ ...seedData, owner, hydrated: false, persistenceError: null })
        hydrateBrowser(owner)
        return
      }
      set({ ...EMPTY_WORKSPACE, owner, hydrated: false, persistenceError: null })
      void hydrateDatabase(owner)
    },
    updateProject: (id, patch) => commit({
      projects: get().projects.map((project) => project.id === id
        ? { ...project, ...patch, id: project.id, user_id: project.user_id, updated_at: new Date().toISOString() }
        : project),
    }),
    deleteProject: async (id) => {
      const project = get().projects.find((candidate) => candidate.id === id)
      if (!project) return
      // Erst der Server: Meldet er einen laufenden Upload oder einen Fehler,
      // bleibt das Projekt samt Clips und Planung, wie es war.
      await deleteProjectOnServer(project, get().clips.filter((clip) => clip.project_id === id))
      // Neu lesen — während der Anfrage kann sich der Workspace geändert haben.
      const state = get()
      const ids = new Set(state.clips.filter((clip) => clip.project_id === id).map((clip) => clip.id))
      commit({
        ...pruneClips(state, ids),
        projects: state.projects.filter((candidate) => candidate.id !== id),
        projectSettings: withoutKeys(state.projectSettings, new Set([id])),
        projectPublishing: withoutKeys(state.projectPublishing, new Set([id])),
      })
      // Das Video in IndexedDB kann Gigabytes groß sein und gehört niemandem mehr.
      void import('@/lib/local-media').then(({ deleteLocalVideo }) => deleteLocalVideo(id)).catch(() => {})
      // Erst zurückkehren, wenn auch die Datenbank Bescheid weiß. Scheitert
      // das, versucht der Abgleich es weiter und meldet sich selbst.
      await remote?.flush()
    },
    saveProjectClips: (projectId, clips, removedWords) => {
      const state = get()
      if (!state.projects.some((project) => project.id === projectId)) return
      const incoming = clips.filter((clip) => clip.project_id === projectId)
      const keep = new Set(incoming.map((clip) => clip.id))
      const removed = new Set(state.clips.filter((clip) => clip.project_id === projectId && !keep.has(clip.id)).map((clip) => clip.id))
      const pruned = pruneClips(state, removed)
      commit({
        ...pruned,
        clips: [...state.clips.filter((clip) => clip.project_id !== projectId), ...incoming],
        removedWords: {
          ...pruned.removedWords,
          ...Object.fromEntries(Object.entries(removedWords ?? {}).filter(([id]) => keep.has(id))),
        },
      })
    },
    updateClip: (id, patch) => commit({ clips: get().clips.map((clip) => clip.id === id
      ? { ...clip, ...patch, id: clip.id, project_id: clip.project_id, updated_at: new Date().toISOString() }
      : clip) }),
    duplicateClip: (id) => {
      const state = get()
      const clip = state.clips.find((candidate) => candidate.id === id)
      if (!clip) return null
      const copyId = crypto.randomUUID()
      const now = new Date().toISOString()
      commit({
        clips: [...state.clips, { ...structuredClone(clip), id: copyId, title: `${clip.title} (Kopie)`, render_status: 'pending', render_key: null, render_job_id: null, created_at: now, updated_at: now }],
        removedWords: { ...state.removedWords, [copyId]: [...(state.removedWords[id] ?? [])] },
        outputFormats: {
          ...state.outputFormats,
          [copyId]: state.outputFormats[id] ?? state.projectSettings[clip.project_id]?.aspectRatio ?? '9:16',
        },
      })
      return copyId
    },
    deleteClips: (ids) => {
      const removed = new Set(ids)
      deleteRenders(get().clips.filter((clip) => removed.has(clip.id)))
      commit(pruneClips(get(), removed))
    },
    toggleFavorite: (id) => {
      if (!get().clips.some((clip) => clip.id === id)) return
      commit({ favoriteClipIds: get().favoriteClipIds.includes(id)
        ? get().favoriteClipIds.filter((candidate) => candidate !== id)
        : [...get().favoriteClipIds, id] })
    },
    saveBrandKit: (kit) => {
      if (!kit.name.trim()) return
      const value = { ...kit, name: kit.name.trim() }
      commit({ brandKits: get().brandKits.some((candidate) => candidate.id === kit.id)
        ? get().brandKits.map((candidate) => candidate.id === kit.id ? value : candidate)
        : [...get().brandKits, value] })
    },
    deleteBrandKit: (id) => commit({ brandKits: get().brandKits.filter((kit) => kit.id !== id) }),
    applyBrandKit: (kitId, clipIds) => {
      const kit = get().brandKits.find((candidate) => candidate.id === kitId)
      if (!kit) return
      const ids = new Set(clipIds)
      commit({ clips: get().clips.map((clip) => ids.has(clip.id)
        ? { ...clip, caption_style: { ...kit.style }, render_status: 'pending', render_key: null, updated_at: new Date().toISOString() }
        : clip) })
    },
    setOutputFormat: (clipId, format) => commit({ outputFormats: { ...get().outputFormats, [clipId]: format } }),
    setProjectPublishing: (projectId, value) => commit({ projectPublishing: { ...get().projectPublishing, [projectId]: value } }),
    createProjectDraft: (input) => {
      const { owner } = get()
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const project: Project = {
        id, user_id: owner && owner !== LOCAL_WORKSPACE_OWNER ? owner : 'local-user', title: input.title.trim() || 'Neues Projekt',
        source_type: input.source_type, source_url: input.source_url,
        source_key: null, proxy_key: null, audio_key: null, waveform_key: null,
        thumbnail_url: null, duration_seconds: null, width: null, height: null, fps: 30,
        status: 'draft', error_message: null, trigger_run_id: null,
        rights_confirmed: input.rights_confirmed,
        rights_confirmed_at: input.rights_confirmed ? now : null,
        created_at: now, updated_at: now,
      }
      commit({ projects: [project, ...get().projects], projectSettings: { ...get().projectSettings, [id]: { ...input.settings } } })
      return id
    },
  }
})
