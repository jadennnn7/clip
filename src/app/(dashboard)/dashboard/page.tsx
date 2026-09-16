import React from 'react'
import Link from 'next/link'
import { Film, HardDrive, Upload, CircleAlert } from 'lucide-react'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { IngestDialog } from '@/components/dashboard/IngestDialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { mockClipCounts, mockProjects } from '@/lib/mock-data'
import type { ProjectSource } from '@/types/database'

function SourceIcon({ source, className }: { source: ProjectSource; className?: string }) {
  if (source === 'youtube') return <PlatformIcon platform="youtube" className={className} />
  if (source === 'drive') return <HardDrive className={className} />
  return <Upload className={className} />
}

export default function DashboardPage() {
  // Phase 2:
  //   const supabase = await createClient()
  //   const { data: projects } = await supabase.from('projects').select('*, clips(count)')
  // RLS filtert dabei automatisch auf den eingeloggten Nutzer — kein
  // .eq('user_id', ...) nötig und keine Möglichkeit, es zu vergessen.
  const projects = mockProjects

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Projekte</h1>
            <p className="text-sm text-muted-foreground">
              {projects.length} Projekte ·{' '}
              {Object.values(mockClipCounts).reduce((sum, count) => sum + count, 0)} Clips erzeugt
            </p>
          </div>
          <IngestDialog />
        </div>

        {projects.length === 0 ? <EmptyState /> : <ProjectTable />}
      </div>
    </ScrollArea>
  )
}

function ProjectTable() {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Projekt</TableHead>
            {/* Auf Telefonen zählen Titel, Status und die Aktion. Länge und
                Clip-Anzahl weichen, statt den Titel auf ein paar Zeichen zu
                quetschen oder die Aktion hinter einen Scroll zu schieben. */}
            <TableHead className="hidden w-28 sm:table-cell">Länge</TableHead>
            <TableHead className="hidden w-20 text-right sm:table-cell">Clips</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-24 text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockProjects.map((project) => {
            const clipCount = mockClipCounts[project.id] ?? 0
            const isReady = project.status === 'ready'

            return (
              <TableRow key={project.id}>
                {/* `w-full max-w-0`: In einer Tabelle mit automatischem Layout
                    wächst die Spalte sonst bis zum längsten Titel und `truncate`
                    greift nie. Mit einer Maximalbreite von 0 darf die Zelle
                    unter ihre Inhaltsbreite schrumpfen und füllt zugleich den
                    verbleibenden Platz. */}
                <TableCell className="w-full max-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <SourceIcon source={project.source_type} className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{project.title}</p>
                      {project.error_message ? (
                        <p className="flex items-center gap-1 truncate text-xs text-destructive">
                          <CircleAlert className="size-3 shrink-0" />
                          {project.error_message}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {new Date(project.created_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:table-cell">
                  {formatDuration(project.duration_seconds)}
                </TableCell>

                <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
                  {clipCount > 0 ? clipCount : <span className="text-muted-foreground">—</span>}
                </TableCell>

                <TableCell>
                  <StatusBadge status={project.status} />
                </TableCell>

                <TableCell className="text-right">
                  {isReady ? (
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/dashboard/projects/${project.id}`} />}
                    >
                      Öffnen
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled>
                      Öffnen
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20">
      <Film className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">Noch keine Projekte</p>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Lade ein Langform-Video hoch — OmegaClip findet die stärksten Momente und schneidet
        sie auf 9:16.
      </p>
      <IngestDialog />
    </div>
  )
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
