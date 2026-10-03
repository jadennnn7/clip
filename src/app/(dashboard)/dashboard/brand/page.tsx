'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, Palette, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ApplyBrandKitDialog } from '@/components/brand/ApplyBrandKitDialog'
import { BrandKitCard, CaptionSpecimen, VIDEO_BLACK } from '@/components/brand/BrandKitCard'
import { BrandKitEditor } from '@/components/brand/BrandKitEditor'
import { BrandKitStage } from '@/components/brand/BrandKitStage'
import { sameCaptionStyle } from '@/components/brand/style-match'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { DEFAULT_CAPTION_STYLE } from '../../../../../remotion/captions/presets'
import type { CaptionStyle } from '@/types/database'
import type { BrandKit } from '@/types/workspace'

/** So lange nach der letzten Änderung wird gespeichert — ein Reglerzug schreibt einmal, nicht sechzigmal. */
const SAVE_DELAY_MS = 400

const newKitId = () => `brand-${crypto.randomUUID().slice(0, 8)}`

function uniqueName(base: string, kits: BrandKit[]): string {
  const taken = new Set(kits.map((kit) => kit.name))
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

/** Die Reihe der Kits: so viele Karten nebeneinander, wie Platz haben. */
const KIT_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3'

/**
 * Links Kits und Einstellungen, rechts die Vorschau über die ganze Höhe.
 * Schmal stehen sie untereinander: Kits, Vorschau, Einstellungen.
 */
const WORKBENCH_COLUMNS = 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]'
const PREVIEW_CELL = 'order-2 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1'
const EDITOR_CELL = 'order-3 lg:order-none'

const latestKit = (id: string) => useWorkspaceStore.getState().brandKits.find((kit) => kit.id === id)

/**
 * Brand-Kits.
 *
 * Von oben nach unten gelesen: erst das Kit wählen, dann links einstellen
 * und rechts sehen, was passiert. Die Vorschau bleibt beim Scrollen durch die
 * Einstellungen stehen, und unter ihr liegt die eine Hauptaktion — das Kit
 * auf Clips anwenden. Ein Kit ist immer ausgewählt; eine leere Fläche mit
 * „Wähle ein Kit“ hat nie jemandem geholfen.
 */
export default function BrandPage() {
  const brandKits = useWorkspaceStore((state) => state.brandKits)
  const clips = useWorkspaceStore((state) => state.clips)
  const hydrated = useWorkspaceStore((state) => state.hydrated)
  const saveBrandKit = useWorkspaceStore((state) => state.saveBrandKit)
  const deleteBrandKit = useWorkspaceStore((state) => state.deleteBrandKit)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<BrandKit | null>(null)
  const [saving, setSaving] = useState(false)
  const [focusNameId, setFocusNameId] = useState<string | null>(null)
  const [applyKit, setApplyKit] = useState<BrandKit | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)

  const pending = useRef<{ kit: BrandKit; timer: ReturnType<typeof setTimeout> } | null>(null)

  const activeId = selectedId && brandKits.some((kit) => kit.id === selectedId) ? selectedId : (brandKits[0]?.id ?? null)
  const storedKit = brandKits.find((kit) => kit.id === activeId) ?? null
  const kit = draft && draft.id === activeId ? draft : storedKit

  const persist = useCallback(
    (next: BrandKit) => {
      const stored = latestKit(next.id)
      // Inzwischen gelöscht — nicht durch die Hintertür wieder anlegen.
      if (!stored) return
      saveBrandKit({ ...next, name: next.name.trim() || stored.name })
    },
    [saveBrandKit],
  )

  const flush = useCallback(() => {
    const job = pending.current
    if (!job) return
    clearTimeout(job.timer)
    pending.current = null
    persist(job.kit)
    setSaving(false)
  }, [persist])

  // Beim Verlassen der Seite oder Schließen des Tabs nichts liegen lassen.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  const handleChange = (next: BrandKit) => {
    setDraft(next)
    setSaving(true)
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = {
      kit: next,
      timer: setTimeout(() => {
        pending.current = null
        persist(next)
        setSaving(false)
      }, SAVE_DELAY_MS),
    }
  }

  const handleNameCommit = () => {
    if (!kit || !storedKit) return
    const trimmed = kit.name.trim()
    if (trimmed !== kit.name || !trimmed) handleChange({ ...kit, name: trimmed || storedKit.name })
  }

  const select = (id: string, focusName = false) => {
    flush()
    setDraft(null)
    setSelectedId(id)
    setFocusNameId(focusName ? id : null)
  }

  const handleCreate = () => {
    flush()
    const created: BrandKit = {
      id: newKitId(),
      name: uniqueName('Neues Kit', useWorkspaceStore.getState().brandKits),
      style: { ...DEFAULT_CAPTION_STYLE },
    }
    saveBrandKit(created)
    select(created.id, true)
  }

  const handleDuplicate = (source: BrandKit) => {
    flush()
    const original = latestKit(source.id) ?? source
    const copy: BrandKit = {
      id: newKitId(),
      name: uniqueName(`${original.name} Kopie`, useWorkspaceStore.getState().brandKits),
      style: { ...original.style },
    }
    saveBrandKit(copy)
    select(copy.id, true)
  }

  const handleDelete = (target: BrandKit) => {
    flush()
    const removed = latestKit(target.id) ?? target
    const kits = useWorkspaceStore.getState().brandKits
    const index = kits.findIndex((candidate) => candidate.id === removed.id)
    const remaining = kits.filter((candidate) => candidate.id !== removed.id)
    deleteBrandKit(removed.id)
    if (removed.id === activeId) {
      setDraft(null)
      setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
    }
    toast(`„${removed.name}“ gelöscht`, {
      action: {
        label: 'Rückgängig',
        onClick: () => {
          saveBrandKit(removed)
          setDraft(null)
          setSelectedId(removed.id)
        },
      },
    })
  }

  const openApply = (target: BrandKit) => {
    flush()
    setApplyKit(latestKit(target.id) ?? target)
    setApplyOpen(true)
  }

  const clipCount = (style: CaptionStyle) =>
    clips.filter((clip) => sameCaptionStyle(clip.caption_style, style)).length

  const usage = kit ? clipCount(kit.style) : 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[76rem] px-4 py-10 sm:px-6">
        <PageHeader
          title="Brand-Kits"
          description="Ein Kit legt fest, wie deine Untertitel aussehen: Schrift, Farben, Position. Einmal eingestellt, überträgst du es mit einem Klick auf alle Clips."
          action={
            hydrated && kit ? (
              <Button variant="outline" onClick={handleCreate}>
                <Plus />
                Neues Kit
              </Button>
            ) : null
          }
        />

        {!hydrated ? (
          <div role="status" aria-label="Brand-Kits werden geladen" className={WORKBENCH_COLUMNS}>
            <div className={KIT_GRID}>
              {[0, 1].map((index) => (
                <div key={index} className="h-[4.625rem] animate-pulse rounded-xl bg-foreground/[0.05]" />
              ))}
            </div>
            <div className={cn('glass-tile h-[36rem] animate-pulse rounded-2xl', PREVIEW_CELL)} />
            <div className={cn('glass-tile h-[44rem] animate-pulse rounded-2xl', EDITOR_CELL)} />
          </div>
        ) : !kit ? (
          <div className="glass-tile relative flex flex-col items-center rounded-2xl px-6 py-16 text-center">
            <div
              className="well flex aspect-[16/10] w-56 items-center justify-center rounded-xl px-4"
              style={{ background: VIDEO_BLACK }}
            >
              <CaptionSpecimen style={DEFAULT_CAPTION_STYLE} size={22} />
            </div>
            <h2 className="mt-6 text-xl font-semibold tracking-tight">Dein erstes Brand-Kit</h2>
            <p className="mt-2 max-w-sm text-sm text-pretty text-muted-foreground">
              Leg einmal fest, wie deine Untertitel aussehen. Danach trägt jeder Clip deine Handschrift.
            </p>
            <Button variant="prominent" size="lg" onClick={handleCreate} className="mt-6 gap-1.5 px-4">
              <Plus className="size-4" />
              Kit erstellen
            </Button>
          </div>
        ) : (
          <div className={WORKBENCH_COLUMNS}>
            <section aria-labelledby="kits-heading" className="min-w-0">
              <h2 id="kits-heading" className="mb-3 flex items-baseline gap-2 text-base font-semibold tracking-tight">
                Deine Kits
                <span className="text-sm font-normal text-muted-foreground tabular-nums">{brandKits.length}</span>
              </h2>
              <ul className={KIT_GRID}>
                {brandKits.map((stored) => {
                  // Das gewählte Kit zeigt schon den ungespeicherten Stand.
                  const shown = stored.id === kit.id ? kit : stored
                  return (
                    <li key={stored.id} className="min-w-0">
                      <BrandKitCard
                        kit={shown}
                        isSelected={stored.id === kit.id}
                        clipCount={clipCount(shown.style)}
                        onSelect={() => select(stored.id)}
                        onApply={() => openApply(stored)}
                        onDuplicate={() => handleDuplicate(stored)}
                        onDelete={() => handleDelete(stored)}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>

            <BrandKitEditor
              key={kit.id}
              kit={kit}
              focusName={focusNameId === kit.id}
              onChange={handleChange}
              onNameCommit={handleNameCommit}
              onDuplicate={() => handleDuplicate(kit)}
              onDelete={() => handleDelete(kit)}
              className={EDITOR_CELL}
            />

            {/* Vorschau und Hauptaktion in einer Karte, die beim Scrollen
                stehen bleibt: Man sieht das Ergebnis und hat den Knopf, der
                es auf die Clips bringt, immer im Blick. */}
            <aside
              aria-label="Vorschau"
              className={cn('glass-tile min-w-0 rounded-2xl lg:sticky lg:top-[calc(var(--app-top)+1rem)]', PREVIEW_CELL)}
            >
              <BrandKitStage style={kit.style} />
              <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
                <div className="min-w-0 text-xs leading-snug text-muted-foreground" aria-live="polite">
                  <p className="flex items-center gap-1.5 font-medium whitespace-nowrap text-foreground/85">
                    {saving ? (
                      <>
                        <LoaderCircle className="size-3 animate-spin" />
                        Wird gespeichert
                      </>
                    ) : (
                      <>
                        <Check className="size-3 text-primary" />
                        Gespeichert
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 truncate">
                    {usage > 0 ? `In ${usage} ${usage === 1 ? 'Clip' : 'Clips'} verwendet` : 'Noch in keinem Clip'}
                  </p>
                </div>
                <Button variant="prominent" size="lg" onClick={() => openApply(kit)} className="shrink-0 px-3.5">
                  <Palette />
                  Auf Clips anwenden
                </Button>
              </div>
            </aside>
          </div>
        )}

        <ApplyBrandKitDialog kit={applyKit} open={applyOpen} onOpenChange={setApplyOpen} />
      </div>
    </div>
  )
}
