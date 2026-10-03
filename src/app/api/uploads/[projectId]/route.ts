import { deleteUpload, prepareUpload, receiveLocalUpload, uploadResponse } from '@/services/uploads'
import { isCloudMode } from '@/services/storage/mode'
import { UserFacingError } from '@/services/video/source'

type Context = { params: Promise<{ projectId: string }> }

/** Wohin der Browser das Video laden soll, und ob es schon dort liegt. */
export async function POST(request: Request, { params }: Context) {
  const { projectId } = await params
  const { contentType } = (await request.json().catch(() => ({}))) as { contentType?: string }
  try {
    return Response.json(await prepareUpload(projectId, contentType?.startsWith('video/') ? contentType : 'video/mp4'))
  } catch (cause) {
    const message = cause instanceof UserFacingError ? cause.message : 'Der Upload konnte nicht vorbereitet werden.'
    return Response.json({ error: message }, { status: cause instanceof UserFacingError ? 422 : 400 })
  }
}

/** Nur lokal — in der Cloud geht der Upload direkt nach R2. */
export async function PUT(request: Request, { params }: Context) {
  if (isCloudMode()) return Response.json({ error: 'Uploads gehen im Cloud-Modus direkt nach R2.' }, { status: 405 })
  const { projectId } = await params
  try {
    await receiveLocalUpload(projectId, request)
    return new Response(null, { status: 204 })
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Upload fehlgeschlagen.' }, { status: 400 })
  }
}

export async function GET(request: Request, { params }: Context) {
  const { projectId } = await params
  return uploadResponse(request, projectId)
}

export async function HEAD(request: Request, { params }: Context) {
  const { projectId } = await params
  return uploadResponse(request, projectId)
}

export async function DELETE(_request: Request, { params }: Context) {
  const { projectId } = await params
  try {
    await deleteUpload(projectId)
  } catch (error) {
    console.error('[uploads] Löschen fehlgeschlagen', projectId, error)
    return Response.json({ error: 'Das hochgeladene Video konnte nicht vom Server gelöscht werden. Bitte versuche es erneut.' }, { status: 502 })
  }
  return new Response(null, { status: 204 })
}
