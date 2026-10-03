import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, PublishingApiError } from '@/services/publishing/auth'
import { WORKSPACE_SCHEMA_MISSING, type BrandKitRow, type ClipRow, type ProjectRow, type WorkspaceSnapshot } from '@/lib/workspace-rows'

/**
 * Der Workspace eines Kontos: Projekte, Clips und Brand Kits.
 *
 * GET lädt alles, POST schreibt einen Stapel Änderungen. Beides läuft mit der
 * Session des Nutzers, also unter RLS — die Route setzt `user_id` zwar selbst,
 * die Mandantentrennung erzwingt aber die Datenbank.
 */

const NO_STORE = { 'Cache-Control': 'private, no-store' }
/** Vercel nimmt höchstens 4,5 MB pro Request an; der Browser teilt größere Stapel auf. */
const MAX_BODY_BYTES = 4 * 1024 * 1024
/** PostgREST liefert höchstens 1.000 Zeilen pro Abfrage. */
const PAGE_SIZE = 1000

class WorkspaceError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message)
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof WorkspaceError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE })
  }
  if (error instanceof PublishingApiError) return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE })
  console.error('[workspace]', error)
  return Response.json({ error: 'Der Workspace konnte nicht gespeichert werden. Bitte versuche es erneut.' }, { status: 500, headers: NO_STORE })
}

interface DatabaseError { code?: string; message?: string }

/** Tabelle oder Spalte fehlt: Die Migration `20260929000000_workspace.sql` ist noch nicht eingespielt. */
function isMissingSchema(error: DatabaseError): boolean {
  return ['PGRST205', 'PGRST204', '42P01', '42703'].includes(error.code ?? '') ||
    /could not find the (table|.*column)|schema cache/i.test(error.message ?? '')
}

function databaseFailure(error: DatabaseError, operation: string): never {
  if (isMissingSchema(error)) {
    throw new WorkspaceError(503, 'Die Datenbank für den Workspace ist noch nicht eingerichtet. Bitte die Migration supabase/migrations/20260929000000_workspace.sql ausführen.', WORKSPACE_SCHEMA_MISSING)
  }
  console.error(`[workspace] ${operation}`, { code: error.code, message: error.message })
  throw new WorkspaceError(502, 'Der Workspace konnte gerade nicht mit der Datenbank abgeglichen werden. Bitte versuche es erneut.')
}

async function authenticate(): Promise<{ db: SupabaseClient; userId: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new WorkspaceError(503, 'Ohne Anmeldung liegt der Workspace nur in diesem Browser.')
  }
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) throw new WorkspaceError(401, 'Bitte melde dich an.')
  return { db, userId: user.id }
}

async function selectAll<T>(db: SupabaseClient, table: string, operation: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table).select('*')
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) databaseFailure(error, operation)
    rows.push(...(data as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

export async function GET() {
  try {
    const { db, userId } = await authenticate()
    const [projects, clips, kits, profile] = await Promise.all([
      selectAll<ProjectRow & { user_id: string }>(db, 'projects', 'Projekte laden'),
      selectAll<ClipRow & { user_id: string }>(db, 'clips', 'Clips laden'),
      selectAll<BrandKitRow & { user_id: string }>(db, 'brand_kits', 'Brand Kits laden'),
      db.from('profiles').select('workspace_initialized_at').eq('id', userId).maybeSingle(),
    ])
    if (profile.error) databaseFailure(profile.error, 'Profil laden')
    const snapshot: WorkspaceSnapshot = {
      initialized: Boolean(profile.data?.workspace_initialized_at),
      projects: projects.map(({ user_id: _userId, ...row }) => row),
      clips: clips.map(({ user_id: _userId, ...row }) => row),
      brandKits: kits.map(({ id, name, style }) => ({ id, name, style })),
    }
    return Response.json(snapshot, { headers: NO_STORE })
  } catch (error) {
    return errorResponse(error)
  }
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

// `guid` statt `uuid`: Postgres nimmt jede 8-4-4-4-12-Hex-ID an, auch ohne
// RFC-Varianten-Bits — ältere Browser-Workspaces dürfen nicht hängen bleiben.
const id = z.guid()
const text = (max: number) => z.string().max(max)
const optionalText = (max: number) => text(max).nullable()
const timestamp = z.string().min(1).max(64)
const jsonObject = z.record(z.string(), z.unknown())

const projectRow = z.object({
  id,
  title: text(500),
  source_type: z.enum(['upload', 'youtube', 'drive']),
  source_url: optionalText(4000),
  source_key: optionalText(1000),
  proxy_key: optionalText(1000),
  audio_key: optionalText(1000),
  waveform_key: optionalText(1000),
  thumbnail_url: optionalText(200_000),
  duration_seconds: z.number().min(0).max(1e7).nullable(),
  width: z.number().int().min(0).max(100_000).nullable(),
  height: z.number().int().min(0).max(100_000).nullable(),
  fps: z.number().min(0).max(1000).nullable(),
  status: z.enum(['draft', 'queued', 'downloading', 'transcribing', 'analyzing', 'reframing', 'ready', 'error']),
  error_message: optionalText(5000),
  trigger_run_id: optionalText(200),
  rights_confirmed: z.boolean(),
  rights_confirmed_at: timestamp.nullable(),
  settings: jsonObject.nullable(),
  publishing: jsonObject.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
})

const clipRow = z.object({
  id,
  project_id: id,
  title: text(1000),
  description: text(20_000),
  hashtags: z.array(text(300)).max(200),
  hook_text: optionalText(5000),
  start_seconds: z.number().min(0).max(1e7),
  end_seconds: z.number().min(0).max(1e7),
  virality_score: z.number().int().min(0).max(100),
  score_reasoning: optionalText(50_000),
  editorial: jsonObject.nullable(),
  analysis_source: z.enum(['ai', 'heuristic']).nullable(),
  analysis_notice: optionalText(5000),
  words: z.array(z.unknown()).max(50_000),
  caption_style: jsonObject,
  crop_keyframes: z.array(z.unknown()).max(200_000),
  segments: z.array(z.unknown()).max(10_000).nullable(),
  overlays: z.array(z.unknown()).max(1000),
  video_settings: jsonObject.nullable(),
  render_status: z.enum(['pending', 'queued', 'rendering', 'ready', 'error']),
  render_key: optionalText(1000),
  render_job_id: optionalText(200),
  render_error: optionalText(5000),
  thumbnail_url: optionalText(200_000),
  removed_words: z.array(z.number().int().min(0)).max(50_000),
  output_format: z.enum(['9:16', '1:1', '16:9']).nullable(),
  is_favorite: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
})

const brandKitRow = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  style: jsonObject,
})

const rowSet = z.object({
  projects: z.array(projectRow).max(500),
  clips: z.array(clipRow).max(2000),
  brandKits: z.array(brandKitRow).max(200),
})

const changesSchema = z.object({
  /** Neu auf dem Gerät: nur einfügen, falls es die ID noch nicht gibt. */
  created: rowSet,
  /** Bekannt und geändert: überschreiben. */
  updated: rowSet,
  deleted: z.object({
    projectIds: z.array(id).max(5000),
    clipIds: z.array(id).max(20_000),
    brandKitIds: z.array(z.string().min(1).max(100)).max(1000),
  }),
  initialize: z.boolean().optional(),
})

type Rejected = { kind: 'project' | 'clip' | 'brandKit'; id: string }

/** Datenfehler (Postgres-Klassen 22/23, RLS, Trigger) liegen am Datensatz, nicht an der Verbindung. */
function isRowError(error: DatabaseError): boolean {
  return /^2[23]/.test(error.code ?? '') || ['42501', 'P0001'].includes(error.code ?? '')
}

/**
 * Ein ungültiger Datensatz darf nicht den ganzen Stapel blockieren — sonst
 * scheiterte jeder weitere Speicherversuch an ihm. Scheitert der Stapel an den
 * Daten, wird Zeile für Zeile gespeichert und zurückgemeldet, welche
 * abgelehnt wurden.
 */
async function upsertRows(
  db: SupabaseClient, table: string, rows: Record<string, unknown>[],
  options: { onConflict: string; ignoreDuplicates: boolean },
  kind: Rejected['kind'], rejected: Rejected[],
) {
  if (rows.length === 0) return
  const { error } = await db.from(table).upsert(rows, options)
  if (!error) return
  if (!isRowError(error)) databaseFailure(error, `${table} speichern`)
  for (const row of rows) {
    const single = await db.from(table).upsert(row, options)
    if (!single.error) continue
    if (!isRowError(single.error)) databaseFailure(single.error, `${table} speichern`)
    console.warn(`[workspace] ${table} abgelehnt`, { id: row.id, code: single.error.code, message: single.error.message })
    rejected.push({ kind, id: String(row.id) })
  }
}

/** IDs stehen bei DELETE in der URL — in Portionen, damit sie kurz bleibt. */
async function deleteIds(db: SupabaseClient, table: string, ids: string[], userId: string, operation: string) {
  for (let index = 0; index < ids.length; index += 200) {
    const { error } = await db.from(table).delete().eq('user_id', userId).in('id', ids.slice(index, index + 200))
    if (error) databaseFailure(error, operation)
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const { db, userId } = await authenticate()

    const body = await request.text()
    if (body.length > MAX_BODY_BYTES) throw new WorkspaceError(413, 'Zu viele Änderungen auf einmal.')
    let json: unknown
    try { json = JSON.parse(body) } catch { throw new WorkspaceError(400, 'Ungültige Anfrage.') }
    const parsed = changesSchema.safeParse(json)
    if (!parsed.success) {
      console.warn('[workspace] ungültiger Stapel', parsed.error.issues.slice(0, 5))
      throw new WorkspaceError(400, 'Einige Änderungen hatten ein ungültiges Format und wurden nicht gespeichert.')
    }
    const { created, updated, deleted, initialize } = parsed.data
    const rejected: Rejected[] = []
    const own = <T>(rows: T[]) => rows.map((row) => ({ ...row, user_id: userId }))
    const create = { ignoreDuplicates: true }
    const overwrite = { ignoreDuplicates: false }

    // Projekte vor ihren Clips, Löschen zuletzt.
    await upsertRows(db, 'projects', own(created.projects), { onConflict: 'id', ...create }, 'project', rejected)
    await upsertRows(db, 'projects', own(updated.projects), { onConflict: 'id', ...overwrite }, 'project', rejected)
    await upsertRows(db, 'clips', own(created.clips), { onConflict: 'id', ...create }, 'clip', rejected)
    await upsertRows(db, 'clips', own(updated.clips), { onConflict: 'id', ...overwrite }, 'clip', rejected)
    await upsertRows(db, 'brand_kits', own(created.brandKits), { onConflict: 'user_id,id', ...create }, 'brandKit', rejected)
    await upsertRows(db, 'brand_kits', own(updated.brandKits), { onConflict: 'user_id,id', ...overwrite }, 'brandKit', rejected)

    await deleteIds(db, 'clips', deleted.clipIds, userId, 'Clips löschen')
    await deleteIds(db, 'brand_kits', deleted.brandKitIds, userId, 'Brand Kits löschen')
    // Die Clips gelöschter Projekte gehen per ON DELETE CASCADE mit.
    await deleteIds(db, 'projects', deleted.projectIds, userId, 'Projekte löschen')

    if (initialize) {
      const { error } = await db.from('profiles').update({ workspace_initialized_at: new Date().toISOString() })
        .eq('id', userId).is('workspace_initialized_at', null)
      if (error) databaseFailure(error, 'Workspace markieren')
    }

    return Response.json({ ok: true, rejected }, { headers: NO_STORE })
  } catch (error) {
    return errorResponse(error)
  }
}
