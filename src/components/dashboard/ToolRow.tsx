'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { CalendarClock, Captions, Clapperboard, Crop, Library, Palette, Type } from 'lucide-react'
import { OPEN_STATUSES, usePublishingQueue } from '@/stores/publishing-queue-store'
import { useWorkspaceStore } from '@/stores/workspace-store'

interface Tool {
  label: string
  hint: string
  icon: LucideIcon
  href: string
}

/**
 * Werkzeuge als zwei Gruppen statt sieben loser Symbole.
 *
 * Vorher standen alle sieben gleichrangig nebeneinander, obwohl sie zweierlei
 * tun: Vier öffnen den Editor auf dem zuletzt bearbeiteten Clip, drei führen
 * zu eigenen Seiten. Die Gruppierung sagt das, und die Kopfzeile der ersten
 * Gruppe nennt den Clip — sonst weiß niemand, wo „Untertitel" landet.
 *
 * Die Breite richtet sich nach dem Container, nicht nach dem Fenster: Mit
 * ausgeklappter Sidebar ist die Fläche bei 1280 px schmaler als ohne bei 1024.
 */
export function ToolRow() {
  const clips = useWorkspaceStore((state) => state.clips)
  const brandKits = useWorkspaceStore((state) => state.brandKits)
  const planned = usePublishingQueue((state) => state.jobs?.filter((job) => OPEN_STATUSES.includes(job.status)).length ?? 0)
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const latest = [...clips].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  const editor = latest ? `/dashboard/projects/${latest.project_id}?clip=${latest.id}` : '/dashboard/clips'

  // Zähler erst nach dem Laden des lokalen Workspace, wie in der Sidebar.
  const count = (value: number, unit: string) => (hydrated ? `${value} ${unit}` : ' ')

  const groups: { label: string; context?: string; tools: Tool[] }[] = [
    {
      label: 'Bearbeiten',
      context: latest ? `Letzter Clip · ${latest.title}` : 'Noch kein Clip',
      tools: [
        { label: 'Clip-Editor', hint: 'Schnitt & Timeline', icon: Clapperboard, href: editor },
        { label: 'Untertitel', hint: 'Stil & Animation', icon: Captions, href: latest ? `${editor}&tab=style` : editor },
        { label: 'Reframe', hint: '9:16 · 1:1 · 16:9', icon: Crop, href: latest ? `${editor}&tab=reframe` : editor },
        { label: 'Transkript', hint: 'Per Text schneiden', icon: Type, href: latest ? `${editor}&tab=transcript` : editor },
      ],
    },
    {
      label: 'Organisieren',
      tools: [
        { label: 'Bibliothek', hint: count(clips.length, 'Clips'), icon: Library, href: '/dashboard/clips' },
        { label: 'Brand-Kits', hint: count(brandKits.length, 'Vorlagen'), icon: Palette, href: '/dashboard/brand' },
        { label: 'Planen', hint: count(planned, 'geplant'), icon: CalendarClock, href: '/dashboard/calendar' },
      ],
    },
  ]

  return (
    <nav aria-label="Werkzeuge" className="@container/tools">
      <div className="flex flex-col gap-3 @3xl/tools:flex-row">
        {groups.map((group) => (
          <div
            key={group.label}
            // Wachstum nach Anzahl: So sind alle sieben Zellen gleich breit,
            // obwohl sie in zwei Gruppen stehen.
            style={{ flexGrow: group.tools.length, flexBasis: 0 }}
            className="min-w-0 rounded-2xl border bg-card p-1.5 shadow-xs"
          >
            <div className="flex items-baseline gap-3 px-2.5 pt-1.5 pb-1">
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{group.label}</span>
              {group.context ? (
                <span className="min-w-0 truncate text-[11px] text-muted-foreground/60">{group.context}</span>
              ) : null}
            </div>
            <ul className="grid" style={{ gridTemplateColumns: `repeat(${group.tools.length}, minmax(0, 1fr))` }}>
              {group.tools.map((tool) => (
                <li key={tool.label} className="min-w-0">
                  <Link
                    href={tool.href}
                    className="transition-ui group flex flex-col items-center gap-2.5 rounded-xl px-1.5 pt-3 pb-2.5 text-center outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/[0.04]"
                  >
                    <span className="transition-ui flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-black/[0.04] ring-inset group-hover:-translate-y-0.5 group-hover:bg-foreground group-hover:text-background group-hover:shadow-md dark:bg-white/[0.06] dark:ring-white/[0.06]">
                      <tool.icon className="size-[1.1rem]" />
                    </span>
                    <span className="flex w-full min-w-0 flex-col gap-0.5">
                      <span className="truncate text-xs font-medium">{tool.label}</span>
                      <span className="hidden truncate text-[11px] text-muted-foreground @lg/tools:block">
                        {tool.hint}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}
