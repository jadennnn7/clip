import { readRender, removeRender } from '@/services/render'

export async function GET(_request: Request, { params }: { params: Promise<{ renderId: string }> }) {
  const { renderId } = await params
  const job = await readRender(renderId)
  if (!job) return Response.json({ error: 'Render nicht gefunden.' }, { status: 404 })
  return Response.json(job, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ renderId: string }> }) {
  const { renderId } = await params
  try {
    await removeRender(renderId)
  } catch (error) {
    console.error('[render] Löschen fehlgeschlagen', renderId, error)
    return Response.json({ error: 'Der fertige Clip konnte nicht vom Server gelöscht werden. Bitte versuche es erneut.' }, { status: 502 })
  }
  return new Response(null, { status: 204 })
}
