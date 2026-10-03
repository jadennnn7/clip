import { ProjectEditor } from '@/components/editor/ProjectEditor'

export default async function ProjectEditorPage({ params, searchParams }: PageProps<'/dashboard/projects/[id]'>) {
  const { id } = await params
  const query = await searchParams
  return <ProjectEditor key={id} projectId={id} initialClipId={typeof query.clip === 'string' ? query.clip : undefined} initialTab={typeof query.tab === 'string' ? query.tab : undefined} />
}
