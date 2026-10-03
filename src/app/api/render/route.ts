import { createHash } from 'node:crypto'
import { pipelineMediaForRender } from '@/services/pipeline'
import { consumeExport, CreditError, needsWatermark } from '@/services/billing/credits'
import { assertSameOrigin, getAuthenticatedUser, publishingErrorResponse } from '@/services/publishing/auth'
import { startRender } from '@/services/render'
import { uploadForRender } from '@/services/uploads'
import { UserFacingError } from '@/services/video/source'
import type { CaptionStyle, ClipSegment, CropKeyframe, Overlay, TranscriptWord, VideoSettings } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'

/**
 * Startet den MP4-Render eines Clips.
 *
 * Der Browser schickt die Props, mit denen sein Player die Vorschau zeichnet,
 * plus den Pfad des Videos in dieser App. Die Adresse, unter der der Renderer
 * das Video abholt, bestimmt der Server — Chrome im Renderer lädt also nie
 * eine beliebige, vom Client vorgegebene URL.
 *
 * Im Gratis-Test zählt jeder Render als Export. Ein unveränderter Clip, der
 * nach einem Fehlschlag erneut gerendert wird, zählt nicht noch einmal.
 */
export async function POST(request: Request) {
  const hasAuth = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  let userId: string | undefined
  if (hasAuth) {
    try { assertSameOrigin(request); userId = (await getAuthenticatedUser()).id }
    catch (cause) { return publishingErrorResponse(cause) }
  }

  const body = (await request.json().catch(() => null)) as Partial<{
    videoPath: string
    startSeconds: number
    endSeconds: number
    words: TranscriptWord[]
    captionStyle: CaptionStyle
    cropKeyframes: CropKeyframe[]
    sourceWidth: number
    sourceHeight: number
    segments: ClipSegment[] | null
    overlays: Overlay[]
    video: VideoSettings | null
    outputFormat: OutputFormat
    title: string
  }> | null
  if (!body) return error(400, 'Ungültige Anfrage.')

  const { startSeconds, endSeconds, sourceWidth, sourceHeight } = body
  const numbers = [startSeconds, endSeconds, sourceWidth, sourceHeight]
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return error(400, 'Clip-Grenzen oder Videomaße fehlen.')
  if (endSeconds! - startSeconds! <= 0 || endSeconds! - startSeconds! > 300) return error(400, 'Ein Clip darf höchstens fünf Minuten lang sein.')
  if (!Array.isArray(body.words) || body.words.length > 10000 || !Array.isArray(body.cropKeyframes) || !body.captionStyle) {
    return error(400, 'Untertitel oder Zuschnitt fehlen.')
  }
  // Schnitte, Overlays und Look sind optional — ältere Clients schicken sie
  // nicht. Die Composition bereinigt jedes Feld selbst; hier geht es nur
  // darum, keine beliebig großen Nutzlasten an den Renderer weiterzureichen.
  const segments = body.segments == null ? null : body.segments
  if (segments !== null && (!Array.isArray(segments) || segments.length > 1000 || !segments.every(isSegment))) {
    return error(400, 'Die Schnitte des Clips sind ungültig.')
  }
  const overlays = body.overlays ?? []
  if (!Array.isArray(overlays) || overlays.length > 300 || JSON.stringify(overlays).length > 400_000) {
    return error(400, 'Zu viele oder zu große Overlays.')
  }
  const video = body.video && typeof body.video === 'object' ? body.video : null
  const outputFormat: OutputFormat = body.outputFormat === '1:1' || body.outputFormat === '16:9' ? body.outputFormat : '9:16'

  const origin = new URL(request.url).origin
  const videoPath = typeof body.videoPath === 'string' ? body.videoPath : ''
  const pipeline = /^\/api\/pipeline\/([^/]+)\/media$/.exec(videoPath)
  const upload = /^\/api\/uploads\/([^/]+)$/.exec(videoPath)
  const videoSrc = pipeline
    ? await pipelineMediaForRender(pipeline[1], origin)
    : upload
      ? await uploadForRender(upload[1], origin)
      : videoPath === '/mock/source.mp4' ? `${origin}${videoPath}` : null
  if (!videoSrc) return error(400, 'Zu diesem Clip gibt es kein Video, das sich rendern lässt.')

  const inputProps = {
    videoSrc,
    startSeconds: startSeconds!,
    endSeconds: endSeconds!,
    words: body.words,
    captionStyle: body.captionStyle,
    cropKeyframes: body.cropKeyframes,
    sourceWidth: sourceWidth!,
    sourceHeight: sourceHeight!,
    segments,
    overlays,
    video,
    watermark: false,
  }

  try {
    if (userId) {
      // Vom Tarif bestimmt, nicht vom Browser — der schickt dazu nichts mit.
      inputProps.watermark = await needsWatermark(userId)
      const fingerprint = createHash('sha256').update(JSON.stringify({ videoPath, outputFormat, ...inputProps, videoSrc: null })).digest('hex')
      await consumeExport(userId, `render:${fingerprint}`)
    }
    const job = await startRender({
      inputProps,
      outputFormat,
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : 'clip',
    })
    return Response.json(job, { status: 202 })
  } catch (cause) {
    if (cause instanceof CreditError) return error(cause.status, cause.message)
    if (cause instanceof UserFacingError) return error(422, cause.message)
    console.error('[render] Start fehlgeschlagen', cause)
    return error(500, 'Der Render konnte nicht gestartet werden.')
  }
}

function isSegment(value: unknown): value is ClipSegment {
  if (!value || typeof value !== 'object') return false
  const { start, end } = value as Partial<ClipSegment>
  return typeof start === 'number' && typeof end === 'number' && Number.isFinite(start) && Number.isFinite(end) && end > start
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status })
}
