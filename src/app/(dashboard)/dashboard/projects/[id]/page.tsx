import React from 'react'
import { notFound } from 'next/navigation'
import { EditorShell } from '@/components/editor/EditorShell'
import {
  MOCK_PROJECT_ID,
  MOCK_VIDEO_SRC,
  mockClips,
  mockProjects,
  mockWaveform,
} from '@/lib/mock-data'

/**
 * Editor-Route.
 *
 * `params` ist ab Next.js 16 ein Promise — synchroner Zugriff wurde entfernt.
 * `PageProps<'/route'>` wird von `next typegen` global bereitgestellt.
 */
export default async function ProjectEditorPage({
  params,
}: PageProps<'/dashboard/projects/[id]'>) {
  const { id } = await params

  const project = mockProjects.find((candidate) => candidate.id === id)
  if (!project) notFound()

  // Phase 2:
  //   const supabase = await createClient()
  //   const { data: clips } = await supabase.from('clips').select('*').eq('project_id', id)
  //   const waveform = await fetch(await getDownloadUrl(project.waveform_key)).then(r => r.json())
  //   const videoSrc = await getDownloadUrl(project.proxy_key)   // 720p-Proxy, nie das Original
  const clips = project.id === MOCK_PROJECT_ID ? mockClips : []

  return (
    <EditorShell
      project={project}
      clips={clips}
      waveform={mockWaveform}
      videoSrc={MOCK_VIDEO_SRC}
    />
  )
}
