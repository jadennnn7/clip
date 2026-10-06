'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { VideoLibrary } from '@/components/clips/VideoLibrary'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { Button } from '@/components/ui/button'
import { ACTIVE_STATUSES } from '@/lib/link-import'
import { useWorkspaceStore } from '@/stores/workspace-store'

/**
 * Die Bibliothek: ein Eintrag pro Video.
 *
 * Die Clips eines Videos liegen auf dessen eigener Seite
 * (`/dashboard/clips/[projectId]`). Vorher standen hier alle Clips aller
 * Videos in einem Raster — nach drei Videos wusste niemand mehr, welcher Clip
 * woher kommt.
 */
export default function ClipLibraryPage() {
  const projects = useWorkspaceStore((state) => state.projects)
  const running = projects.filter((project) => ACTIVE_STATUSES.includes(project.status)).length

  return <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-[76rem] px-4 py-10 sm:px-6">
      <PageHeader
        title="Clip-Bibliothek"
        description={running > 0
          ? `${running === 1 ? 'Ein Video wird' : `${running} Videos werden`} gerade geschnitten. Öffne ein Video, um seine Clips zu sehen.`
          : 'Jedes Video mit seinen Clips. Öffne ein Video, um seine Clips zu sehen.'}
        action={<Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />}><ArrowUpRight />Video hinzufügen</Button>}
      />

      <VideoLibrary />
    </div>
  </div>
}
