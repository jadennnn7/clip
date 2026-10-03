'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'

// Unter `sm` ohne Pfeile: Auf dem Telefon wischt man die Reihe, und die
// Pfeile würden dort die Überschrift in zwei Zeilen drücken.
const ARROW_CLASS =
  'glass glass-interactive liquid-press flex size-8 max-sm:hidden items-center justify-center rounded-full text-muted-foreground outline-none ' +
  'hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40'

interface ScrollRowProps {
  title: string
  icon?: LucideIcon
  description?: string
  /** Verweis neben den Pfeilen, etwa „Alle ansehen". */
  action?: React.ReactNode
  children: React.ReactNode
}

/**
 * Abschnitt mit waagerecht blätterbarer Kartenreihe.
 *
 * Die Karten selbst kommen als `children` vom Server — diese Komponente hält
 * nur die Pfeile und den Scroll-Zustand. So bleibt die Client-Grenze bei den
 * zwei Knöpfen, statt die ganze Reihe samt Daten in den Browser zu ziehen.
 *
 * Die Pfeile sind am Rand deaktiviert statt ausgeblendet: Verschwindende
 * Knöpfe verschieben die Kopfzeile, und ein grauer Pfeil sagt „hier ist
 * Schluss" deutlicher als ein fehlender. Passt die ganze Reihe aber ohnehin
 * hinein, gibt es keinen Rand, an dem Schluss sein könnte — dann fehlen die
 * Pfeile ganz, statt als zwei tote Knöpfe in der Kopfzeile zu stehen.
 */
export function ScrollRow({ title, icon: Icon, description, action, children }: ScrollRowProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const update = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    setCanPrev(track.scrollLeft > 1)
    // Ein Pixel Toleranz: Bei gebrochenen Zoomstufen erreicht `scrollLeft`
    // das rechnerische Ende oft nicht exakt.
    setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    update()
    track.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(track)

    return () => {
      track.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [update])

  const page = (direction: 1 | -1) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section>
      <div className="flex min-h-8 items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight whitespace-nowrap">
            {Icon ? <Icon className="size-4 text-primary" /> : null}
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          {canPrev || canNext ? (
            <>
              <button
                type="button"
                aria-label="Zurückblättern"
                disabled={!canPrev}
                onClick={() => page(-1)}
                className={ARROW_CLASS}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Weiterblättern"
                disabled={!canNext}
                onClick={() => page(1)}
                className={ARROW_CLASS}
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Negativer Rand plus Innenabstand: Die Reihe läuft bis an den
          Bildschirmrand aus, die erste Karte fluchtet trotzdem mit der
          Überschrift. Oben und unten Luft, weil ein waagerechter Scroller
          auch senkrecht abschneidet — ohne sie würden Anheben und Schatten
          der Glaskacheln gekappt. */}
      <div
        ref={trackRef}
        className="-mx-4 mt-3 -mb-6 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pt-2 pb-8 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  )
}
