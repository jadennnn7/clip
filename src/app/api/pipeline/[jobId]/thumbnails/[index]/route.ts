import { pipelineThumbnailResponse } from '@/services/pipeline'
import { readOwnedPipeline } from '@/services/pipeline/access'
import { publishingErrorResponse } from '@/services/publishing/auth'

/** Standbild eines Clips im 9:16-Ausschnitt, für Bibliothek und Übersicht. */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string; index: string }> }) {
  const { jobId, index } = await params
  if (!/^\d{1,2}$/.test(index)) return new Response('Nicht gefunden', { status: 404 })
  try {
    await readOwnedPipeline(jobId)
    return await pipelineThumbnailResponse(request, jobId, Number(index))
  } catch (error) { return publishingErrorResponse(error) }
}
