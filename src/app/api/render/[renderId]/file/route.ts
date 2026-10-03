import { renderFileResponse } from '@/services/render'

/** Die fertige MP4-Datei als Download. */
export async function GET(request: Request, { params }: { params: Promise<{ renderId: string }> }) {
  const { renderId } = await params
  return renderFileResponse(request, renderId)
}
