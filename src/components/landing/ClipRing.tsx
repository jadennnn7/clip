'use client'

import RoundCarousel from './RoundCarousel'
import { ClipCover } from '@/components/clips/ClipCover'
import { mockClips } from '@/lib/mock-data'

const CARD_WIDTH = 232
const CARD_HEIGHT = 412

/**
 * Der Hero-Beweis: nicht der Editor, sondern das, was hinten rauskommt.
 *
 * Es rotieren genau so viele Karten, wie es bewertete Clips gibt — kein
 * Auffüllen mit Dubletten, damit der Ring keine Menge vortäuscht.
 */
export function ClipRing() {
  return (
    // Die vorderste Karte wird durch die Perspektive rund 8 % größer gerendert
    // und der Tilt kippt sie zusätzlich aus dem Raster — beides braucht Luft,
    // sonst schneidet `overflow: hidden` sie oben ab.
    <div className="h-[470px] w-full sm:h-[560px]">
      <RoundCarousel
        faces={mockClips.map((clip) => <ClipCover key={clip.id} clip={clip} />)}
        imageWidth={CARD_WIDTH}
        imageHeight={CARD_HEIGHT}
        spacing={2}
        speed={4}
        tilt={-6}
        cornerRadius={18}
        perspective={2200}
      />
    </div>
  )
}
