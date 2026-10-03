import { pipelineMediaResponse } from '@/services/pipeline'
import { readOwnedPipeline } from '@/services/pipeline/access'
import { publishingErrorResponse } from '@/services/publishing/auth'

/** Liefert das 720p-Proxy an Editor und Vorschau — lokal per Range-Request, in der Cloud per Weiterleitung nach R2. */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  try {
    await readOwnedPipeline(jobId)
    return await pipelineMediaResponse(request, jobId)
  } catch (error) { return publishingErrorResponse(error) }
}
