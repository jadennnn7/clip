'use client'

import React, { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import type { Clip } from '@/types/database'
import { cn } from '@/lib/utils'
import { clipOutputDuration, outputCaptionWords } from '@/lib/clip-export'
import { HOOK_LOOKS, createHookOverlay, draftHookTitle, hookLookOf, hookOverlayOf, type HookLook } from '@/lib/hook-title'
import { useEditorStore } from '@/stores/editor-store'
import { Textarea } from '@/components/ui/textarea'
import { fontStack, resolveWeight } from '../../../remotion/fonts'
import { withAlpha } from '../../../remotion/overlays/defaults'
import { Segmented, ToggleField } from './controls'
import { useFontPreviews } from './fonts-preview'

type Span = 'full' | '3' | '5' | 'custom'

const FRAME = 1 / 30

/**
 * Der Hook-Titel oben im Clip — ein, aus, Text, Look und Dauer an einer
 * Stelle. Alles Weitere (Lage, Schrift, Animation) regelt der Inspector,
 * denn im Bild ist der Titel ein gewöhnliches Text-Overlay.
 */
export function HookTitlePanel({ clip }: { clip: Clip }) {
  useFontPreviews(['montserrat', 'inter'])
  const addOverlay = useEditorStore((state) => state.addOverlay)
  const updateOverlay = useEditorStore((state) => state.updateOverlay)
  const select = useEditorStore((state) => state.select)
  const removedWords = useEditorStore((state) => state.removedWords[clip.id])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hook = hookOverlayOf(clip)
  const duration = clipOutputDuration(clip)
  const visible = Boolean(hook && !hook.hidden)
  const look = hook ? hookLookOf(hook) : null
  const span: Span = !hook ? '5'
    : hook.start > FRAME ? 'custom'
      : hook.end >= duration - FRAME ? 'full'
        : Math.abs(hook.end - 3) < FRAME ? '3'
          : Math.abs(hook.end - 5) < FRAME ? '5'
            : 'custom'

  const setText = (text: string) => {
    if (hook) updateOverlay(clip.id, hook.id, { text, hidden: false })
    else addOverlay(clip.id, createHookOverlay(text, duration))
  }

  const setVisible = (on: boolean) => {
    if (hook) updateOverlay(clip.id, hook.id, { hidden: !on })
    else if (on) addOverlay(clip.id, createHookOverlay(draftHookTitle(clip) || clip.title, duration))
  }

  const suggest = async () => {
    setLoading(true)
    setError(null)
    try {
      const transcript = outputCaptionWords(clip, removedWords).map((word) => word.word).join(' ')
      const response = await fetch('/api/hook-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, title: hook?.text || clip.title }),
      })
      const data = (await response.json().catch(() => null)) as { titles?: string[]; error?: string } | null
      if (!response.ok || !data?.titles?.length) throw new Error(data?.error ?? 'Die Vorschläge konnten gerade nicht erstellt werden.')
      setSuggestions(data.titles)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Vorschläge konnten gerade nicht erstellt werden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Hook-Titel</h3>
        <ToggleField label="Titel oben im Clip" hint="Sagt in der ersten Sekunde, worum es geht." checked={visible} onChange={setVisible} />
      </div>

      {hook ? (
        <div className={cn('flex flex-col gap-3', hook.hidden && 'pointer-events-none opacity-45')}>
          <Textarea
            aria-label="Text des Hook-Titels"
            value={hook.text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            maxLength={120}
            className="min-h-14 resize-none text-sm"
            placeholder="Worum geht es in diesem Clip?"
          />

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={suggest}
              disabled={loading}
              className="transition-ui flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:border-white/30 hover:text-foreground disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {loading ? 'Formuliere Vorschläge …' : suggestions.length ? 'Neue Vorschläge' : 'KI-Vorschläge'}
            </button>
            {error ? <p className="text-[11px] leading-snug text-muted-foreground">{error}</p> : null}
            {suggestions.length ? (
              <ul className="flex flex-col gap-1">
                {suggestions.map((suggestion) => {
                  const current = suggestion === hook.text
                  return (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => setText(suggestion)}
                        aria-pressed={current}
                        className={cn(
                          'transition-ui w-full rounded-md px-2.5 py-1.5 text-left text-xs leading-snug',
                          current ? 'bg-white/[0.08] text-foreground ring-1 ring-white/25' : 'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground',
                        )}
                      >
                        {suggestion}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(HOOK_LOOKS) as HookLook[]).map((id) => (
              <LookTile key={id} look={id} active={look === id} onClick={() => updateOverlay(clip.id, hook.id, { ...HOOK_LOOKS[id].fields })} />
            ))}
          </div>

          <Segmented<Span>
            label="Dauer des Hook-Titels"
            value={span}
            options={[{ value: 'full', label: 'Ganzer Clip' }, { value: '3', label: '3 s' }, { value: '5', label: '5 s' }]}
            onChange={(value) => {
              if (value === 'custom') return
              const end = value === 'full' ? duration : Math.min(duration, Number(value))
              updateOverlay(clip.id, hook.id, { start: 0, end: Math.round(end * 30) / 30 })
            }}
          />

          <button
            type="button"
            onClick={() => select({ type: 'overlay', id: hook.id })}
            className="transition-ui rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground hover:border-white/30 hover:text-foreground"
          >
            Position, Schrift und Animation im Inspector →
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** Ein Look in klein, aus denselben Werten wie im Video. */
function LookTile({ look, active, onClick }: { look: HookLook; active: boolean; onClick: () => void }) {
  const { label, fields } = HOOK_LOOKS[look]
  const scale = 0.24
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="group flex flex-col gap-1.5 focus-visible:outline-none">
      <span
        className={cn(
          'transition-ui flex h-14 items-center justify-center overflow-hidden rounded-lg border bg-[radial-gradient(ellipse_at_30%_20%,rgb(255_255_255/0.12),transparent_60%),linear-gradient(160deg,oklch(0.3_0_0),oklch(0.18_0_0))] px-1.5',
          active ? 'border-white/70 shadow-[0_0_0_1px_rgb(255_255_255/0.4)]' : 'border-border group-hover:border-white/30',
          'group-focus-visible:ring-2 group-focus-visible:ring-ring/60',
        )}
      >
        <span
          className="leading-tight whitespace-nowrap"
          style={{
            fontFamily: fontStack(fields.font),
            fontWeight: resolveWeight(fields.font, fields.fontWeight),
            fontSize: Math.max(10, fields.fontSize * scale),
            color: fields.color,
            textTransform: fields.uppercase ? 'uppercase' : 'none',
            WebkitTextStroke: fields.strokeWidth > 0 ? `${Math.max(0.8, fields.strokeWidth * scale * 0.5)}px ${fields.strokeColor}` : undefined,
            paintOrder: 'stroke fill',
            background: fields.background ? withAlpha(fields.background, fields.backgroundOpacity) : undefined,
            padding: fields.background ? `${Math.max(1, fields.padding * scale * 0.4)}px ${Math.max(3, fields.padding * scale * 0.7)}px` : undefined,
            borderRadius: fields.background ? Math.max(2, fields.radius * scale) : undefined,
          }}
        >
          Hook
        </span>
      </span>
      <span className={cn('text-[11px]', active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>{label}</span>
    </button>
  )
}
