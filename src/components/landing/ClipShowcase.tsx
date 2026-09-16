'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Player } from '@remotion/player'
import { Play } from 'lucide-react'
import { ClipComposition } from '../../../remotion/ClipComposition'
import {
  COMPOSITION_HEIGHT,
  COMPOSITION_WIDTH,
  FPS,
  type ClipCompositionProps,
} from '@/types/editor'
import type { Clip } from '@/types/database'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

interface ClipShowcaseProps {
  clip: Clip
  videoSrc: string
  sourceWidth?: number
  sourceHeight?: number
}

/**
 * Der Beweis-Abschnitt: ein tatsächlich laufender 9:16-Clip.
 *
 * Gerendert wird hier dieselbe `ClipComposition`, die auch der Editor benutzt
 * und die später auf Lambda läuft. Die Seite behauptet also nicht, dass es
 * animierte Untertitel gibt — sie führt sie vor. Wettbewerber zeigen an dieser
 * Stelle vorgerenderte GIFs.
 *
 * Zwei Dinge sind dabei nicht verhandelbar:
 *
 * 1. **Erst laden, wenn sichtbar.** Das Quellvideo ist knapp 5 MB. Würde der
 *    Player sofort montiert, zahlte jeder Besucher diese Ladezeit, bevor er
 *    überhaupt bis hierher gescrollt hat.
 * 2. **Kein Layoutsprung.** Der Platzhalter hat exakt dasselbe Seitenverhältnis
 *    wie der Player, der ihn ersetzt.
 */
export function ClipShowcase({
  clip,
  videoSrc,
  sourceWidth = 1920,
  sourceHeight = 1080,
}: ClipShowcaseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [startedManually, setStartedManually] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    // `rootMargin` startet den Ladevorgang, kurz bevor der Abschnitt
    // tatsächlich im Bild ist — so läuft der Clip bereits, wenn der Blick
    // ankommt, statt erst dann zu beginnen.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const inputProps: ClipCompositionProps = {
    videoSrc,
    startSeconds: clip.start_seconds,
    endSeconds: clip.end_seconds,
    words: clip.words,
    captionStyle: clip.caption_style,
    cropKeyframes: clip.crop_keyframes,
    sourceWidth,
    sourceHeight,
  }

  const durationInFrames = Math.max(
    1,
    Math.round((clip.end_seconds - clip.start_seconds) * FPS),
  )

  const shouldPlay = !reducedMotion || startedManually
  const showPlayButton = reducedMotion && !startedManually

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl bg-neutral-950 shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
      style={{ aspectRatio: '9 / 16' }}
    >
      {isVisible ? (
        <Player
          component={ClipComposition}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          compositionWidth={COMPOSITION_WIDTH}
          compositionHeight={COMPOSITION_HEIGHT}
          fps={FPS}
          loop
          autoPlay={shouldPlay}
          // Stumm ist Pflicht: Browser unterbinden selbsttätiges Abspielen mit
          // Ton, und eine Seite, die ungefragt losredet, ist ohnehin zumutungs-
          // frei besser.
          initiallyMuted
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          style={{ width: '100%', height: '100%' }}
          acknowledgeRemotionLicense
        />
      ) : (
        // Platzhalter im selben Seitenverhältnis — der Container gibt es
        // ohnehin vor, hier steht nur die Ruhefläche.
        <div className="size-full bg-neutral-950" />
      )}

      {showPlayButton ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/60">
          <Button size="sm" className="gap-1.5" onClick={() => setStartedManually(true)}>
            <Play className="size-3.5" />
            Abspielen
          </Button>
        </div>
      ) : null}
    </div>
  )
}
