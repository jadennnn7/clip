'use client'

import { useEffect, useRef } from 'react'
import { CHAPTERS, RUNTIME, timecode } from '@/components/landing/Chapters'
import { cn } from '@/lib/utils'

/**
 * Wo im Fenster „jetzt" ist: Ein Kapitel beginnt, sobald seine Oberkante
 * diese Linie überquert — etwa dort, wo man eine neue Überschrift liest.
 */
const NOW_LINE = 0.35

/** So lange bleibt die Zeitanzeige nach dem letzten Scroll-Schritt stehen. */
const LINGER_MS = 1100

const STARTS = [...CHAPTERS.map((entry) => entry.start), RUNTIME]

/**
 * Der Lesefortschritt als Video-Timeline.
 *
 * Die Seite ist das lange Video aus dem Hero, die Abschnitte sind seine
 * Kapitel (`Chapters.tsx`). Die Leiste zeigt sie als Segmente mit Lücke
 * dazwischen, wie ein Player mit Kapitelmarken; beim Scrollen läuft der
 * Abspielkopf mit und zeigt Zeit und Kapitel. Und sie verhält sich wie
 * einer: Überfahren zeigt die Zeit unter dem Zeiger, Klicken oder Ziehen
 * spult die Seite dorthin.
 *
 * Zeit ↔ Seitenposition ist stückweise linear zwischen den Kapitelanfängen.
 * An jeder Kapitelgrenze stimmt die Anzeige also genau mit der Kapitelmarke
 * über der Überschrift überein, egal wie hoch die Abschnitte gerade sind.
 *
 * Alles Laufende schreibt direkt ins DOM, ein Frame pro Scroll-Schritt —
 * ein React-Render pro Scroll-Event wäre hier teurer als die ganze Anzeige.
 * Für Vorleser ist die Leiste ausgeblendet: Die Navigation darüber führt zu
 * denselben Stellen.
 */
export function ChapterScrubber({ visible }: { visible: boolean }) {
  const barRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Array<HTMLSpanElement | null>>([])
  const fillRefs = useRef<Array<HTMLSpanElement | null>>([])
  const headRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const tipTimeRef = useRef<HTMLSpanElement>(null)
  const tipLabelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const bar = barRef.current
    const head = headRef.current
    const tip = tipRef.current
    if (!bar || !head || !tip) return

    /** Seitenposition (y der Jetzt-Linie) jedes Kapitelanfangs, dazu das Ende. */
    let anchors: number[] = []
    /** Linke Kante und Breite jedes Segments, relativ zur Leiste. */
    let segments: Array<{ left: number; width: number }> = []
    let barWidth = 0

    let hoverX: number | null = null
    let dragging = false
    let lingerUntil = 0
    let frame = 0
    let lingerTimer = 0

    const measure = () => {
      const now = window.innerHeight * NOW_LINE
      const end =
        document.documentElement.scrollHeight - window.innerHeight + now
      let previous = now
      anchors = CHAPTERS.map((entry, index) => {
        if (index === 0) return now
        const element = document.querySelector(`[data-chapter="${entry.id}"]`)
        const top = element
          ? element.getBoundingClientRect().top + window.scrollY
          : previous
        // Streng steigend und vor dem Ende — sonst teilt die Umrechnung durch
        // null, wenn ein Kapitel auf kurzen Seiten nicht mehr erreichbar ist.
        const remaining = CHAPTERS.length - index
        previous = Math.min(Math.max(top, previous + 1), end - remaining)
        return previous
      })
      anchors.push(end)

      barWidth = bar.clientWidth
      segments = segmentRefs.current.map((segment) => ({
        left: segment?.offsetLeft ?? 0,
        width: segment?.offsetWidth ?? 0,
      }))
    }

    /** Zeit in Sekunden zur Seitenposition `y`. */
    const timeAt = (y: number) => {
      for (let index = 0; index < anchors.length - 1; index++) {
        const from = anchors[index]
        const to = anchors[index + 1]
        if (y < to || index === anchors.length - 2) {
          const share = Math.min(1, Math.max(0, (y - from) / (to - from)))
          return STARTS[index] + share * (STARTS[index + 1] - STARTS[index])
        }
      }
      return 0
    }

    /** Seitenposition zur Zeit — die Umkehrung von `timeAt`. */
    const positionAt = (time: number) => {
      for (let index = 0; index < STARTS.length - 1; index++) {
        if (time < STARTS[index + 1] || index === STARTS.length - 2) {
          const share = Math.min(
            1,
            Math.max(
              0,
              (time - STARTS[index]) / (STARTS[index + 1] - STARTS[index]),
            ),
          )
          return anchors[index] + share * (anchors[index + 1] - anchors[index])
        }
      }
      return 0
    }

    const chapterAt = (time: number) => {
      let index = 0
      while (index < CHAPTERS.length - 1 && time >= STARTS[index + 1]) index++
      return index
    }

    /** x-Position auf der Leiste zur Zeit — über die echten Segmente, mit Lücken. */
    const xAt = (time: number) => {
      const index = chapterAt(time)
      const segment = segments[index]
      if (!segment) return 0
      const share =
        (time - STARTS[index]) / (STARTS[index + 1] - STARTS[index])
      return segment.left + Math.min(1, Math.max(0, share)) * segment.width
    }

    /** Zeit zur x-Position — in einer Lücke zählt das Kapitel rechts davon. */
    const timeAtX = (x: number) => {
      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index]
        if (x < segment.left + segment.width) {
          const share = Math.max(0, (x - segment.left) / segment.width)
          return STARTS[index] + share * (STARTS[index + 1] - STARTS[index])
        }
      }
      return RUNTIME
    }

    let shownTime = ''
    let shownChapter = -1

    const render = () => {
      frame = 0
      const time = timeAt(window.scrollY + window.innerHeight * NOW_LINE)
      const current = chapterAt(time)

      fillRefs.current.forEach((fill, index) => {
        if (!fill) return
        const share =
          (time - STARTS[index]) / (STARTS[index + 1] - STARTS[index])
        fill.style.scale = `${Math.min(1, Math.max(0, share))} 1`
      })

      const headX = xAt(time)
      head.style.translate = `${headX}px 0`

      // Überfahren zeigt die Zeit unter dem Zeiger, sonst die des Kopfs.
      const tipTime = hoverX !== null && !dragging ? timeAtX(hoverX) : time
      const tipX = hoverX !== null && !dragging ? hoverX : headX
      const tipChapter = chapterAt(tipTime)
      const label = timecode(tipTime)
      if (label !== shownTime && tipTimeRef.current) {
        tipTimeRef.current.textContent = label
        shownTime = label
      }
      if (tipChapter !== shownChapter && tipLabelRef.current) {
        tipLabelRef.current.textContent = CHAPTERS[tipChapter].label
        shownChapter = tipChapter
      }
      const half = tip.offsetWidth / 2
      const clamped = Math.min(barWidth - half - 8, Math.max(half + 8, tipX))
      tip.style.translate = `${clamped - half}px 0`

      const active =
        dragging || hoverX !== null || performance.now() < lingerUntil
      bar.dataset.active = active ? 'true' : 'false'
      bar.dataset.scrubbing = dragging ? 'true' : 'false'
      bar.dataset.chapter = String(current)
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }

    const onScroll = () => {
      lingerUntil = performance.now() + LINGER_MS
      window.clearTimeout(lingerTimer)
      // Nach dem letzten Schritt einmal nachzeichnen, damit die Anzeige ausblendet.
      lingerTimer = window.setTimeout(schedule, LINGER_MS + 20)
      schedule()
    }

    const scrubTo = (clientX: number) => {
      const x = clientX - bar.getBoundingClientRect().left
      const y = positionAt(timeAtX(x))
      window.scrollTo({
        top: y - window.innerHeight * NOW_LINE,
        behavior: 'instant',
      })
    }

    /** Die Zeigerposition merken — auch ohne vorheriges `pointermove`. */
    const track = (event: PointerEvent) => {
      hoverX =
        event.pointerType === 'mouse'
          ? event.clientX - bar.getBoundingClientRect().left
          : null
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      track(event)
      dragging = true
      bar.setPointerCapture(event.pointerId)
      scrubTo(event.clientX)
      schedule()
    }
    const onPointerMove = (event: PointerEvent) => {
      track(event)
      if (dragging) scrubTo(event.clientX)
      schedule()
    }
    const onPointerEnd = (event: PointerEvent) => {
      if (dragging && bar.hasPointerCapture(event.pointerId)) {
        bar.releasePointerCapture(event.pointerId)
      }
      track(event)
      dragging = false
      lingerUntil = performance.now() + LINGER_MS
      window.clearTimeout(lingerTimer)
      lingerTimer = window.setTimeout(schedule, LINGER_MS + 20)
      schedule()
    }
    const onPointerLeave = () => {
      hoverX = null
      schedule()
    }

    const onResize = () => {
      measure()
      schedule()
    }

    measure()
    render()

    // Bilder, Schriften und aufklappende FAQ verschieben die Kapitel.
    const observer = new ResizeObserver(onResize)
    observer.observe(document.body)
    observer.observe(bar)

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    bar.addEventListener('pointerdown', onPointerDown)
    bar.addEventListener('pointermove', onPointerMove)
    bar.addEventListener('pointerup', onPointerEnd)
    bar.addEventListener('pointercancel', onPointerEnd)
    bar.addEventListener('pointerleave', onPointerLeave)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(lingerTimer)
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      bar.removeEventListener('pointerdown', onPointerDown)
      bar.removeEventListener('pointermove', onPointerMove)
      bar.removeEventListener('pointerup', onPointerEnd)
      bar.removeEventListener('pointercancel', onPointerEnd)
      bar.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return (
    // Über dem Hero ausgeblendet, wie das Glas der Navbar: Dort steht die
    // Seite noch bei 00:00, und der Shader braucht keine Linie.
    <div
      aria-hidden
      className={cn(
        'absolute inset-x-0 top-0 transition-opacity duration-300 ease-(--ease-out-quint)',
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {/* Die Linie liegt an der Oberkante des Fensters, die Trefferfläche
          reicht darunter — eine 3-px-Linie trifft niemand. */}
      <div
        ref={barRef}
        data-active="false"
        data-scrubbing="false"
        className="scrubber group/scrub relative flex h-3 cursor-pointer touch-none items-start gap-[3px] select-none"
      >
        {CHAPTERS.map((entry, index) => (
          <span
            key={entry.id}
            ref={(node) => {
              segmentRefs.current[index] = node
            }}
            className="relative h-[3px] overflow-hidden bg-white/[0.14] transition-[height] duration-200 ease-(--ease-out-quint) group-hover/scrub:h-[5px] group-data-[active=true]/scrub:h-[5px]"
            style={{ flexGrow: STARTS[index + 1] - STARTS[index], flexBasis: 0 }}
          >
            <span
              ref={(node) => {
                fillRefs.current[index] = node
              }}
              className="absolute inset-0 origin-left bg-brand"
              style={{ scale: '0 1' }}
            />
          </span>
        ))}

        {/* Der Abspielkopf: eine helle Marke, die von der Kante hängt —
            nur sichtbar, solange sich etwas bewegt. */}
        <span
          ref={headRef}
          className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity duration-200 group-hover/scrub:opacity-100 group-data-[active=true]/scrub:opacity-100"
        >
          <span className="absolute top-0 h-2.5 w-[3px] -translate-x-1/2 rounded-b-full bg-brand-light shadow-[0_0_8px_var(--color-brand)]" />
        </span>

        {/* Zeit und Kapitel unter dem Kopf — wie die Vorschau beim Spulen.
            Nur beim Überfahren und Ziehen, sonst läge sie beim Scrollen
            über der Navigation. */}
        <span
          ref={tipRef}
          className="glass-chip pointer-events-none absolute top-full left-0 mt-1 inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[0.6875rem] whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/scrub:opacity-100 group-data-[scrubbing=true]/scrub:opacity-100"
        >
          <span ref={tipTimeRef} className="text-brand tabular-nums">
            00:00
          </span>
          <span className="text-white/35">/ {timecode(RUNTIME)}</span>
          <span ref={tipLabelRef} className="text-white/80">
            {CHAPTERS[0].label}
          </span>
        </span>
      </div>
    </div>
  )
}
