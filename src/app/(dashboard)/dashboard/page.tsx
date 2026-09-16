import React from 'react'
import Link from 'next/link'
import { Film, HardDrive, Upload, CircleAlert, Clapperboard, Scissors, Timer, Send } from 'lucide-react'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { IngestDialog } from '@/components/dashboard/IngestDialog'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { StatTile, type StatSeverity } from '@/components/dashboard/StatTile'
import { PlatformIcon } from '@/components/social/PlatformIcon'
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
import { mockClipCounts, mockClips, mockProjects, mockQueue, mockUsage } from '@/lib/mock-data'
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
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Projekte"
          description="Lade ein Langform-Video hoch — OmegaClip findet die stärksten Momente, schneidet sie auf 9:16 und plant sie ein."
          action={<IngestDialog />}
        />

        <StatRow />

        {projects.length === 0 ? <EmptyState /> : <ProjectTable />}
      </div>
    </ScrollArea>
  )
}

/**
 * Kennzahlen-Reihe.
 *
 * Beantwortet die vier Fragen, mit denen Nutzer das Dashboard öffnen: Wie viel
 * läuft gerade? Was ist dabei herausgekommen? Wie viel Guthaben habe ich noch?
 * Was geht als Nächstes raus?
 *
 * Die Werte werden aus denselben Datenquellen abgeleitet, die auch die Tabelle
 * und der Kalender nutzen — fest eingetragene Zahlen laufen sonst auseinander,
 * sobald sich irgendwo etwas ändert.
 */
function StatRow() {
  const inProgress = mockProjects.filter(
    (project) => !['ready', 'error', 'draft'].includes(project.status),
  ).length
  const failed = mockProjects.filter((project) => project.status === 'error').length

  const clipCount = mockClips.length
  const averageScore = Math.round(
    mockClips.reduce((sum, clip) => sum + clip.virality_score, 0) / (clipCount || 1),
  )

  const remaining = mockUsage.renderMinutesLimit - mockUsage.renderMinutesUsed
  const usedRatio = mockUsage.renderMinutesUsed / mockUsage.renderMinutesLimit

  // Der Schweregrad hängt am Verbrauch, nicht an einer festen Zahl — und die
  // Kontextzeile sagt dasselbe noch einmal in Worten, damit die Warnung nicht
  // allein an der Farbe hängt.
  const usageSeverity: StatSeverity =
    usedRatio >= 0.9 ? 'critical' : usedRatio >= 0.7 ? 'warning' : 'neutral'
  const usageContext =
    usageSeverity === 'critical'
      ? 'Fast aufgebraucht'
      : usageSeverity === 'warning'
        ? 'Guthaben wird knapp'
        : `von ${mockUsage.renderMinutesLimit} Minuten`

  const scheduled = mockQueue.filter((entry) =>
    ['pending', 'needs_review'].includes(entry.status),
  ).length
  const needsReview = mockQueue.filter((entry) => entry.status === 'needs_review').length

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon={Clapperboard}
        label="Projekte"
        value={mockProjects.length}
        context={
          inProgress > 0
            ? `${inProgress} in Arbeit${failed > 0 ? `, ${failed} mit Fehler` : ''}`
            : 'Alle verarbeitet'
        }
        delayMs={0}
      />
      <StatTile
        icon={Scissors}
        label="Clips erzeugt"
        value={clipCount}
        context={clipCount > 0 ? `Durchschnittlicher Score ${averageScore}` : 'Noch keine'}
        delayMs={60}
      />
      <StatTile
        icon={Timer}
        label="Render-Minuten"
        value={Math.round(remaining)}
        unit="übrig"
        meter={usedRatio}
        severity={usageSeverity}
        context={usageContext}
        delayMs={120}
      />
      <StatTile
        icon={Send}
        label="Eingeplant"
        value={scheduled}
        context={needsReview > 0 ? `${needsReview} wartet auf Freigabe` : 'Alle freigegeben'}
        delayMs={180}
      />
    </div>
  )
}

function ProjectTable() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="h-10 text-xs font-medium">Projekt</TableHead>
            {/* Auf Telefonen zählen Titel, Status und die Aktion. Länge und
                Clip-Anzahl weichen, statt den Titel auf ein paar Zeichen zu
                quetschen oder die Aktion hinter einen Scroll zu schieben. */}
            <TableHead className="hidden h-10 w-28 text-xs font-medium sm:table-cell">
              Länge
            </TableHead>
            <TableHead className="hidden h-10 w-20 text-right text-xs font-medium sm:table-cell">
              Clips
            </TableHead>
            <TableHead className="h-10 w-40 text-xs font-medium">Status</TableHead>
            <TableHead className="h-10 w-24 text-right text-xs font-medium">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockProjects.map((project) => {
            const clipCount = mockClipCounts[project.id] ?? 0
            const isReady = project.status === 'ready'

            return (
              <TableRow key={project.id} className="transition-ui group h-[68px]">
                {/* `w-full max-w-0`: In einer Tabelle mit automatischem Layout
                    wächst die Spalte sonst bis zum längsten Titel und `truncate`
                    greift nie. Mit einer Maximalbreite von 0 darf die Zelle
                    unter ihre Inhaltsbreite schrumpfen und füllt zugleich den
                    verbleibenden Platz. */}
                <TableCell className="w-full max-w-0">
                  <div className="flex items-center gap-3">
                    {/* 16:9 statt Quadrat — die Kachel steht für ein Video und
                        sollte auch so proportioniert sein. */}
                    <div className="transition-ui flex aspect-video w-14 shrink-0 items-center justify-center rounded-md border bg-muted/60 group-hover:bg-muted">
                      <SourceIcon
                        source={project.source_type}
                        className="size-4 text-muted-foreground"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{project.title}</p>
                      {project.error_message ? (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-destructive">
                          <CircleAlert className="size-3 shrink-0" />
                          {project.error_message}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
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

                {/* Spalten aus Zahlen fluchten vertikal — hier gehören
                    tabellarische Ziffern hin. */}
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
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      className="transition-ui group-hover:border-foreground/20 group-hover:bg-accent"
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Film className="size-5 text-muted-foreground" />
      </div>
      <p className="text-base font-medium">Noch keine Projekte</p>
      <p className="max-w-sm text-center text-sm text-pretty text-muted-foreground">
        Lade ein Langform-Video hoch — OmegaClip findet die stärksten Momente und schneidet
        sie auf 9:16.
      </p>
      <div className="mt-2">
        <IngestDialog />
      </div>
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
