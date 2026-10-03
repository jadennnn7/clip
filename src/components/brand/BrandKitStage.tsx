'use client'

import React, { useMemo, useState } from 'react'
import { AbsoluteFill, Html5Video } from 'remotion'
import { Player } from '@remotion/player'
import { EyeOff, ScanLine } from 'lucide-react'
import type { CaptionStyle, SocialPlatform } from '@/types/database'
import {
  PLATFORM_SHORT_LABEL,
  PLATFORM_ZONES,
  PlatformChrome,
  STRICTEST_ZONE,
  type SafeZone,
} from '@/components/brand/PlatformChrome'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { cn } from '@/lib/utils'
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH, FPS } from '@/types/editor'
import { CaptionLayer } from '../../../remotion/captions/CaptionLayer'
import { BRAND_PREVIEW_DURATION, BRAND_PREVIEW_WORDS } from '@/components/brand/preview-transcript'

/** Separate Vorschaukopie mit bereinigter Untertitelzone; das Original bleibt erhalten. */
const EXAMPLE_VIDEO = '/brand/podcast-preview.mp4'

function BrandPreviewScene({ style }: { style: CaptionStyle }) {
  return (
    <AbsoluteFill>
      <Html5Video
        src={EXAMPLE_VIDEO}
        pauseWhenBuffering
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {style.enabled !== false ? <CaptionLayer words={BRAND_PREVIEW_WORDS} style={style} /> : null}
    </AbsoluteFill>
  )
}

/** In der Reihenfolge, in der Creator sie meist bespielen. */
const PLATFORMS: SocialPlatform[] = ['tiktok', 'instagram', 'youtube']

const ZONE_STYLE: React.CSSProperties = {
  background:
    'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.18) 0 1px, transparent 1px 8px), rgb(0 0 0 / 0.38)',
}

function SafeZones({ zone }: { zone: SafeZone }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute inset-x-0 top-0" style={{ ...ZONE_STYLE, height: `${zone.top}%` }} />
      <div className="absolute inset-x-0 bottom-0" style={{ ...ZONE_STYLE, top: `${zone.bottom}%` }} />
      <div
        className="absolute right-0"
        style={{ ...ZONE_STYLE, top: `${zone.railTop}%`, height: `${zone.bottom - zone.railTop}%`, width: `${zone.railWidth}%` }}
      />
      <span
        className="absolute left-3 text-[9px] font-semibold tracking-[0.14em] text-white/85 uppercase"
        style={{ top: `calc(${zone.bottom}% + 8px)` }}
      >
        Name · Beschreibung · Ton
      </span>
    </div>
  )
}

/** Umschaltleisten der Vorschau — dieselbe Form wie die Zahlweise unter „Abo & Verbrauch“. */
const SEGMENTS = 'rounded-lg bg-muted/60 p-0.5'
const SEGMENT =
  'transition-ui inline-flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
const SEGMENT_ACTIVE = 'bg-background text-foreground shadow-xs'
const SEGMENT_IDLE = 'text-muted-foreground hover:text-foreground'

/** Video und editierbare Originaluntertitel teilen dieselbe Player-Zeitachse. */
export function BrandKitStage({ style, className }: { style: CaptionStyle; className?: string }) {
  const inputProps = useMemo(() => ({ style }), [style])
  const [platform, setPlatform] = useState<SocialPlatform | null>('tiktok')
  const [showZones, setShowZones] = useState(false)
  const zone = platform ? PLATFORM_ZONES[platform] : STRICTEST_ZONE

  return (
    <div className={cn('flex flex-col gap-3 p-4', className)}>
      {/* In welcher App die Vorschau steht. */}
      <div role="radiogroup" aria-label="Vorschau in App" className={cn(SEGMENTS, 'grid grid-cols-4')}>
        {[null, ...PLATFORMS].map((id) => {
          const active = platform === id
          return (
            <button
              key={id ?? 'clip'}
              type="button"
              role="radio"
              aria-checked={active}
              title={id ? `So sieht der Clip in ${PLATFORM_SHORT_LABEL[id]} aus` : 'Nur der Clip, ohne App-Oberfläche'}
              onClick={() => setPlatform(id)}
              className={cn(SEGMENT, active ? SEGMENT_ACTIVE : SEGMENT_IDLE)}
            >
              {id ? <PlatformLogo platform={id} className="size-3.5 shrink-0" /> : null}
              {id ? PLATFORM_SHORT_LABEL[id] : 'Clip'}
            </button>
          )
        })}
      </div>

      {/* Die Vorschau — ein echtes Beispielvideo, ohne Geräterahmen. */}
      <figure
        className="relative mx-auto overflow-hidden rounded-2xl"
        style={{ width: 'clamp(190px, min(100%, calc((100dvh - var(--app-top, 4rem) - 26rem) * 0.5625)), 300px)' }}
      >
        <div className="@container relative aspect-[9/16] overflow-hidden bg-black">
          <Player
            component={BrandPreviewScene}
            inputProps={inputProps}
            durationInFrames={Math.round(BRAND_PREVIEW_DURATION * FPS)}
            compositionWidth={COMPOSITION_WIDTH}
            compositionHeight={COMPOSITION_HEIGHT}
            fps={FPS}
            style={{ width: '100%', height: '100%' }}
            autoPlay
            initiallyMuted
            loop
            controls={false}
            clickToPlay={false}
            spaceKeyToPlayOrPause={false}
            doubleClickToFullscreen={false}
            acknowledgeRemotionLicense
          />

          {platform ? <PlatformChrome platform={platform} /> : null}
          {showZones ? <SafeZones zone={zone} /> : null}
          {style.enabled === false ? (
            <div className="absolute inset-x-6 top-1/2 z-20 -translate-y-1/2">
              <p className="glass-chip flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center text-xs font-medium">
                <EyeOff className="size-3.5 shrink-0" />
                Untertitel sind in diesem Kit ausgeblendet
              </p>
            </div>
          ) : null}

        </div>
        <figcaption className="sr-only">Live-Vorschau deines Brand-Kits mit den Untertiteln des Videos</figcaption>
      </figure>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowZones((value) => !value)}
          aria-pressed={showZones}
          title="Zeigt, wo TikTok, Reels und Shorts eigene Bedienelemente über das Bild legen"
          className={cn(
            'transition-ui inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring/60',
            showZones
              ? 'border-primary/60 bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
          )}
        >
          <ScanLine className={cn('size-3.5', showZones && 'text-primary')} />
          Sichere Zone
        </button>
      </div>
    </div>
  )
}
