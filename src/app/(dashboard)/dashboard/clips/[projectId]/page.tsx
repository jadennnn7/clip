import { ProjectClips } from '@/components/clips/ProjectClips'

/** Die Clips eines Videos. */
export default async function ProjectClipsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return <ProjectClips key={projectId} projectId={projectId} />
}
