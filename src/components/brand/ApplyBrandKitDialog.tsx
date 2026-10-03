'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Clapperboard, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { BrandKit } from '@/types/workspace'
import { useWorkspaceStore } from '@/stores/workspace-store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CaptionSpecimen, SPECIMEN_SHORT } from './BrandKitCard'
import { sameCaptionStyle } from './style-match'

interface ApplyBrandKitDialogProps {
  kit: BrandKit | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ApplyBrandKitDialog({ kit, open, onOpenChange }: ApplyBrandKitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-lg">
        {/* Der Schlüssel setzt die Auswahl für jedes Kit neu auf — ohne
            Effekt, der nach dem Öffnen den Zustand überschreibt. */}
        {kit ? <ApplyBody key={kit.id} kit={kit} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ApplyBody({ kit, onDone }: { kit: BrandKit; onDone: () => void }) {
  const clips = useWorkspaceStore((state) => state.clips)
  const projects = useWorkspaceStore((state) => state.projects)
  const applyBrandKit = useWorkspaceStore((state) => state.applyBrandKit)

  const [search, setSearch] = useState('')
  // Vorausgewählt ist, was noch anders aussieht. Clips, die den Stil schon
  // tragen, stehen in der Liste, würden aber nur unnötig neu gerendert.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(clips.filter((clip) => !sameCaptionStyle(clip.caption_style, kit.style)).map((clip) => clip.id)),
  )

  const projectTitle = useMemo(() => new Map(projects.map((project) => [project.id, project.title])), [projects])

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    if (!term) return clips
    return clips.filter(
      (clip) =>
        clip.title.toLocaleLowerCase().includes(term) ||
        (projectTitle.get(clip.project_id) ?? '').toLocaleLowerCase().includes(term),
    )
  }, [clips, search, projectTitle])

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setAll = (on: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      for (const clip of filtered) {
        if (on) next.add(clip.id)
        else next.delete(clip.id)
      }
      return next
    })
  }

  const handleApply = () => {
    if (selected.size === 0) return
    applyBrandKit(kit.id, [...selected])
    toast.success(`„${kit.name}“ auf ${selected.size} ${selected.size === 1 ? 'Clip' : 'Clips'} übertragen`, {
      description: 'Die Clips werden beim nächsten Export mit dem neuen Stil gerendert.',
    })
    onDone()
  }

  return (
    <>
      <DialogHeader className="flex-row items-center gap-3.5 pr-8 pb-4">
        <div className="well flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-950 px-1.5">
          <CaptionSpecimen style={kit.style} size={12} {...SPECIMEN_SHORT} />
        </div>
        <div className="min-w-0">
          <DialogTitle className="truncate">„{kit.name}“ auf Clips anwenden</DialogTitle>
          <DialogDescription className="mt-0.5">
            Die gewählten Clips übernehmen Schrift, Farben und Position.
          </DialogDescription>
        </div>
      </DialogHeader>

      {clips.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-foreground/15 px-6 py-10 text-center">
          <Clapperboard className="size-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Noch keine Clips</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            Sobald aus einem Video Clips entstanden sind, überträgst du das Kit hier auf alle auf einmal.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            nativeButton={false}
            render={<Link href="/dashboard" onClick={onDone} />}
          >
            Video importieren
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Clips oder Projekte suchen …"
              aria-label="Clips durchsuchen"
              className="pl-8 text-sm"
            />
          </div>

          <div className="mt-3 flex items-center justify-between px-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {selected.size} von {clips.length} ausgewählt
            </span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setAll(true)} className="transition-ui hover:text-foreground">
                Alle
              </button>
              <span aria-hidden>·</span>
              <button type="button" onClick={() => setAll(false)} className="transition-ui hover:text-foreground">
                Keine
              </button>
            </span>
          </div>

          <div className="glass-field mt-2 max-h-72 overflow-y-auto rounded-xl p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">Kein Clip passt zu „{search.trim()}“.</p>
            ) : (
              filtered.map((clip) => {
                const checked = selected.has(clip.id)
                const current = sameCaptionStyle(clip.caption_style, kit.style)
                return (
                  <label
                    key={clip.id}
                    className={cn(
                      'transition-ui flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 select-none',
                      checked ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.035]',
                    )}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(clip.id)} className="peer sr-only" />
                    <span
                      aria-hidden
                      className={cn(
                        'transition-ui flex size-4 shrink-0 items-center justify-center rounded-[5px] border',
                        'peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60',
                        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/25',
                      )}
                    >
                      {checked ? <Check className="size-3 stroke-[3]" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{clip.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {projectTitle.get(clip.project_id) ?? 'Ohne Projekt'}
                      </span>
                    </span>
                    {current ? (
                      <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">hat den Stil schon</span>
                    ) : null}
                  </label>
                )
              })
            )}
          </div>
        </>
      )}

      <DialogFooter className="mt-4">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Abbrechen
        </Button>
        {clips.length > 0 ? (
          <Button variant="prominent" size="sm" onClick={handleApply} disabled={selected.size === 0} className="rounded-full px-3">
            {selected.size === 0
              ? 'Clips auswählen'
              : `Auf ${selected.size} ${selected.size === 1 ? 'Clip' : 'Clips'} anwenden`}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  )
}
