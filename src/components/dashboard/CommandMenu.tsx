'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { CornerDownLeft, Film, Plus, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { NAV_ITEMS } from '@/components/dashboard/nav-items'
import { useStartNewProject } from '@/components/dashboard/new-project'
import { useWorkspaceStore } from '@/stores/workspace-store'

interface CommandItem {
  id: string
  group: 'Aktionen' | 'Navigation' | 'Projekte'
  label: string
  hint?: string
  icon: LucideIcon
  run: () => void
}

interface CommandMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Befehlspalette hinter ⌘K.
 *
 * Springt zu Seiten und fertigen Projekten und legt von überall ein neues
 * Projekt an. Projekte in Arbeit fehlen bewusst: Sie sind auch im Raster
 * nicht anklickbar, weil es dort noch nichts zu öffnen gibt.
 */
export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter()
  const startNewProject = useStartNewProject()
  const projects = useWorkspaceStore((state) => state.projects)
  const clips = useWorkspaceStore((state) => state.clips)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  const listRef = useRef<HTMLDivElement>(null)

  // Jedes Öffnen beginnt leer — egal ob per Knopf, ⌘K oder Escape
  // geschlossen wurde. Zustand während des Renderns angleichen statt per
  // Effekt, sonst blitzt die alte Suche einen Frame lang auf.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const items = useMemo<CommandItem[]>(() => {
    const clipCounts = clips.reduce<Record<string, number>>((counts, clip) => {
      counts[clip.project_id] = (counts[clip.project_id] ?? 0) + 1
      return counts
    }, {})

    const all: CommandItem[] = [
      { id: 'new', group: 'Aktionen', label: 'Neues Projekt', icon: Plus, run: startNewProject },
      ...NAV_ITEMS.map((item): CommandItem => ({
        id: `nav-${item.href}`,
        group: 'Navigation',
        label: item.label,
        hint: item.group,
        icon: item.icon,
        run: () => router.push(item.href),
      })),
      ...projects
        .filter((project) => project.status === 'ready')
        .map((project): CommandItem => ({
          id: `project-${project.id}`,
          group: 'Projekte',
          label: project.title,
          hint: clipCounts[project.id] ? `${clipCounts[project.id]} Clips` : undefined,
          icon: Film,
          run: () => router.push(`/dashboard/clips/${project.id}`),
        })),
    ]

    const needle = query.trim().toLocaleLowerCase('de')
    if (!needle) return all
    return all.filter((item) => item.label.toLocaleLowerCase('de').includes(needle))
  }, [clips, projects, query, router, startNewProject])

  const safeIndex = Math.min(activeIndex, Math.max(0, items.length - 1))

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [safeIndex])

  const run = (item: CommandItem | undefined) => {
    if (!item) return
    onOpenChange(false)
    item.run()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((safeIndex + 1) % Math.max(1, items.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((safeIndex - 1 + items.length) % Math.max(1, items.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(items[safeIndex])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden p-0 shadow-2xl sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Befehlspalette</DialogTitle>
        <div className="flex h-12 items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            aria-activedescendant={items[safeIndex] ? `command-${items[safeIndex].id}` : undefined}
            placeholder="Seite, Projekt oder Aktion suchen …"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <div ref={listRef} id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Nichts gefunden für „{query}“.
            </p>
          ) : (
            items.map((item, index) => {
              const heading = index === 0 || items[index - 1].group !== item.group ? item.group : null
              const active = index === safeIndex
              return (
                <React.Fragment key={item.id}>
                  {heading ? (
                    <p className="px-2.5 pt-2.5 pb-1.5 text-[11px] font-medium text-muted-foreground">
                      {heading}
                    </p>
                  ) : null}
                  <div
                    id={`command-${item.id}`}
                    role="option"
                    aria-selected={active}
                    data-index={index}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => run(item)}
                    className={cn(
                      'flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm',
                      active ? 'bg-accent text-accent-foreground' : 'text-foreground/80',
                    )}
                  >
                    <item.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>
                    ) : null}
                    {active ? <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                  </div>
                </React.Fragment>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> auswählen
          </span>
          <span>
            <Kbd>↵</Kbd> öffnen
          </span>
          <span className="ml-auto">
            <Kbd>⌘</Kbd> <Kbd>K</Kbd> ein/aus
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-4 items-center justify-center rounded border bg-background px-1 font-sans text-[10px]">
      {children}
    </kbd>
  )
}
