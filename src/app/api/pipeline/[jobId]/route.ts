import { removePipeline, stopPipeline } from '@/services/pipeline'
import { readOwnedPipeline } from '@/services/pipeline/access'
import { assertSameOrigin, getAuthenticatedUser, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'
import { cancelPendingPublishing, hasInFlightPublishing } from '@/services/publishing/jobs'

/**
 * Status eines Jobs. Die Segmente und die Wellenform stehen erst im Ergebnis,
 * wenn der Job fertig ist.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  try {
    const job = await readOwnedPipeline(jobId)
    return Response.json(job, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return publishingErrorResponse(error) }
}

const IN_FLIGHT_MESSAGE = 'Ein Clip dieses Videos wird gerade gerendert oder hochgeladen und lässt sich nicht mehr anhalten. Warte, bis er fertig ist, und lösche das Video dann erneut.'

/**
 * Bricht den Job ab, stoppt seine Veröffentlichungen und löscht Video,
 * Untertitel und Zwischenstände.
 *
 * 204 heißt: Hier läuft nichts mehr, und nichts wird mehr veröffentlicht.
 * Jede andere Antwort heißt, dass das Video bleiben muss — der Browser darf
 * es dann nicht aus dem Workspace nehmen. Ein zweiter Versuch ist immer
 * sicher; was schon weg ist, zählt als erledigt.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  try {
    const hasAuth = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const user = hasAuth ? await getAuthenticatedUser() : null
    if (user) assertSameOrigin(request)
    // Nicht (mehr) vorhanden: nichts anzuhalten oder zu löschen. Geplante
    // Veröffentlichungen hängen aber am Nutzer, nicht am Lauf — sie werden
    // unten trotzdem gestoppt.
    const job = await readOwnedPipeline(jobId).catch((error) => {
      if (error instanceof PublishingApiError && error.status === 404) return null
      throw error
    })

    if (user) {
      // Erst prüfen, dann ändern: Eine Ablehnung soll nichts verändert haben.
      if (await hasInFlightPublishing(user.id, jobId)) throw new PublishingApiError(409, IN_FLIGHT_MESSAGE)
      // Den Lauf vor der Queue stoppen — ein Lauf, der gerade fertig wird,
      // plant sonst neue Veröffentlichungen ein, nachdem die alten gestoppt sind.
      if (job) await stopPipeline(jobId)
      await cancelPendingPublishing(user.id, jobId)
      // Zwischen Prüfung und Stopp kann der Worker einen Auftrag übernommen haben.
      if (await hasInFlightPublishing(user.id, jobId)) {
        throw new PublishingApiError(409, `${IN_FLIGHT_MESSAGE} Alle übrigen geplanten Veröffentlichungen sind bereits gestoppt.`)
      }
    }

    if (job) await removePipeline(jobId)
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof PublishingApiError) return publishingErrorResponse(error)
    console.error('[pipeline] Löschen fehlgeschlagen', jobId, error)
    return publishingErrorResponse(new PublishingApiError(502, 'Das Video konnte nicht vollständig vom Server gelöscht werden. Es bleibt erhalten — bitte versuche es gleich erneut.'))
  }
}
