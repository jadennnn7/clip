import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { deletePrefix, isR2Configured } from '@/lib/storage/r2'
import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { readPipeline, removePipeline } from '@/services/pipeline'
import { PublishingApiError } from '@/services/publishing/auth'
import { cancelPendingPublishing, hasInFlightPublishing } from '@/services/publishing/jobs'
import { removeRender } from '@/services/render'
import { deleteUpload } from '@/services/uploads'

/**
 * Löscht ein Konto mit allem, was daran hängt (Art. 17 DSGVO).
 *
 * Die Datenbank räumt sich selbst auf: Jede Tabelle hängt per ON DELETE
 * CASCADE am Profil, das Profil an `auth.users` — auch die Tokens der Kanäle
 * in `private.social_account_tokens`. Was außerhalb der Datenbank liegt, muss
 * vorher weg, denn danach fehlt die Liste, wo es liegt:
 *
 * 1. Veröffentlichungen stoppen. Ein Upload, der gerade läuft, lässt sich
 *    nicht zurückholen — dann lieber ablehnen als einen halben Post
 *    hinterlassen, genau wie beim Löschen eines Videos.
 * 2. Läufe anhalten und Dateien löschen: Quellen, Proxys, Uploads, Renders.
 * 3. Den Stripe-Kunden löschen. Das beendet ein laufendes Abo sofort und
 *    entfernt die hinterlegten Zahlungsmittel; Rechnungen bewahrt Stripe auf.
 * 4. Den Nutzer in Supabase Auth löschen.
 *
 * Was ablehnen kann, prüft vor dem ersten Löschen. Jeder Schritt ist
 * wiederholbar: Scheitert einer, bleibt das Konto bestehen, und ein zweiter
 * Versuch macht dort weiter, wo der erste aufgehört hat.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const db = createAdminClient()
  const customerId = await stripeCustomer(db, userId)
  if (customerId && !getStripe()) {
    // Ohne Stripe-Schlüssel ließe sich das Abo nicht beenden — es liefe nach
    // der Löschung weiter, ohne dass jemand es noch kündigen könnte.
    console.error('[account] STRIPE_SECRET_KEY fehlt, Konto hat einen Stripe-Kunden', userId)
    throw new PublishingApiError(503, 'Dein Abo lässt sich gerade nicht beenden, deshalb wurde nichts gelöscht. Bitte versuche es später erneut.')
  }

  if (await hasInFlightPublishing(userId)) throw new PublishingApiError(409, IN_FLIGHT_MESSAGE)
  await cancelPendingPublishing(userId)
  // Zwischen Prüfung und Stopp kann der Worker einen Auftrag übernommen haben.
  if (await hasInFlightPublishing(userId)) {
    throw new PublishingApiError(409, `${IN_FLIGHT_MESSAGE} Alle übrigen geplanten Veröffentlichungen sind bereits gestoppt.`)
  }

  await deleteFiles(db, userId)

  if (customerId) {
    await getStripe()!.customers.del(customerId).catch((error: { code?: string }) => {
      // Schon gelöscht — beim zweiten Versuch nach einem späteren Fehler.
      if (error?.code !== 'resource_missing') throw error
    })
  }

  const { error } = await db.auth.admin.deleteUser(userId)
  if (error && error.status !== 404) throw new Error(`Auth-Nutzer nicht gelöscht: ${error.message}`)
}

const IN_FLIGHT_MESSAGE = 'Gerade wird ein Clip gerendert oder auf einen Kanal hochgeladen, und das lässt sich nicht mehr anhalten. Warte ein paar Minuten, bis er fertig ist, und lösche das Konto dann erneut.'

/** PostgREST liefert höchstens 1.000 Zeilen pro Abfrage. */
const PAGE_SIZE = 1000
/** Gleichzeitige Lösch-Aufträge an Trigger.dev und R2. */
const CONCURRENCY = 4

interface DatabaseError { code?: string; message?: string }

/** Tabelle fehlt, weil ihre Migration nie lief — dann gibt es darin auch nichts zu löschen. */
function isMissingTable(error: DatabaseError): boolean {
  return ['PGRST205', '42P01'].includes(error.code ?? '') || /could not find the table|schema cache/i.test(error.message ?? '')
}

async function stripeCustomer(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db.from('profiles').select('stripe_customer_id').eq('id', userId).maybeSingle()
  if (error) throw new Error(`Profil nicht lesbar: ${error.message}`)
  return (data?.stripe_customer_id as string | null | undefined) ?? null
}

async function selectAll<T>(db: SupabaseClient, table: string, columns: string, userId: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table).select(columns).eq('user_id', userId)
      .order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1)
    if (error) {
      if (isMissingTable(error)) return rows
      throw new Error(`${table} nicht lesbar: ${error.message}`)
    }
    rows.push(...(data as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/**
 * Alle Dateien des Kontos. Die Schlüssel in R2 hängen an Job-, Projekt- und
 * Render-IDs, nicht am Nutzer — die Datenbank sagt, welche es sind.
 */
async function deleteFiles(db: SupabaseClient, userId: string): Promise<void> {
  const [projects, clips, publishing] = await Promise.all([
    selectAll<{ id: string; source_type: string; trigger_run_id: string | null }>(db, 'projects', 'id, source_type, trigger_run_id', userId),
    selectAll<{ render_job_id: string | null }>(db, 'clips', 'render_job_id', userId),
    selectAll<{ source_job_id: string }>(db, 'publishing_jobs', 'source_job_id', userId),
  ])
  const runs = new Set([...projects.map((project) => project.trigger_run_id), ...publishing.map((job) => job.source_job_id)])
  const renders = new Set(clips.map((clip) => clip.render_job_id))

  const tasks: (() => Promise<void>)[] = [
    ...[...runs].flatMap((id) => (id ? [() => removeOwnedPipeline(id, userId)] : [])),
    ...projects.flatMap((project) => (project.source_type === 'upload' ? [() => deleteUpload(project.id)] : [])),
    ...[...renders].flatMap((id) => (id ? [() => removeRender(id)] : [])),
  ]
  // Renders für Veröffentlichungen liegen als einzige unter dem Nutzer.
  if (isR2Configured()) tasks.push(() => deletePrefix(`publishing/${userId}/`))

  // Alles versuchen, auch wenn eins scheitert — ein zweiter Versuch hat dann weniger vor sich.
  const failures: unknown[] = []
  for (let index = 0; index < tasks.length; index += CONCURRENCY) {
    const results = await Promise.allSettled(tasks.slice(index, index + CONCURRENCY).map((task) => task()))
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason)
  }
  if (failures.length) {
    console.error('[account] Dateien nicht gelöscht', userId, failures)
    throw new Error(`${failures.length} von ${tasks.length} Löschaufträgen sind gescheitert.`)
  }
}

/**
 * Die Lauf-ID steht in einer Zeile, die der Browser schreibt. Gelöscht wird
 * deshalb nur ein Lauf, der nachweislich diesem Konto gehört — wie bei
 * `DELETE /api/pipeline/[jobId]`.
 */
async function removeOwnedPipeline(id: string, userId: string): Promise<void> {
  const job = await readPipeline(id)
  if (!job || job.userId !== userId) return
  await removePipeline(id)
}
