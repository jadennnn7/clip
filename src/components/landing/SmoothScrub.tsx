'use client'

import { useEffect, useRef } from 'react'

/**
 * Wie träge die Bühne dem Scrollen folgt: Zeitkonstante in Sekunden. Nach
 * dreimal so langer Zeit hat sie ihr Ziel zu 95 % erreicht.
 */
const LAG = 0.3

/**
 * Lässt eine Scroll-Fassung dem Scrollen weich nachziehen, statt an ihm zu
 * kleben — die von `LongformToShorts` (`.lts-scrub`) und den „So geht’s"-Film
 * (`.steps-track`, siehe `root`).
 *
 * Mit der reinen `view-timeline` sprang die Verwandlung mit jeder Raste des
 * Mausrads und war nach einem kräftigen Wisch auf dem Trackpad vorbei, bevor
 * man sie gesehen hatte. Hier rechnet dieselbe Strecke (`contain`-Bereich,
 * Ende bei `end`) das Ziel aus, und der Stand nähert sich ihm pro Bild
 * exponentiell — wie `scrub` bei GSAP. Die Keyframes bleiben dieselben;
 * `[data-smooth]` am Rahmen stellt sie per CSS von der Scroll-Timeline auf
 * angehaltene Animationen von einer Sekunde um, deren Zeit von hier gesetzt
 * wird. Ändert sich die Fenstergröße, werden die Animationen neu gesammelt —
 * eine Bühne, die schmal ausgeblendet war, hat vorher keine.
 *
 * Ohne JavaScript, ohne Scroll-Timelines oder mit „Bewegung reduzieren"
 * bleibt alles, wie es ohne diese Komponente war.
 */
export function SmoothScrub({
  selector,
  end,
  root: rootSelector = '.lts-scrub',
  lag = LAG,
}: {
  selector: string
  end: number
  /** Trägheit in Sekunden; ohne Angabe die von `LongformToShorts`. */
  lag?: number
  /** Der Scroll-Rahmen, in dem die Bühne klebt; er bekommt `data-smooth`. */
  root?: string
}) {
  const anchor = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>(rootSelector)
    const motion = matchMedia('(prefers-reduced-motion: no-preference)')
    if (!root || !CSS.supports('animation-timeline: view()') || !motion.matches) return

    root.setAttribute('data-smooth', '')
    // `getAnimations` rechnet die Stile vorher neu — die Liste enthält also
    // schon die angehaltenen Animationen, nicht die der Scroll-Timeline.
    const collect = () =>
      Array.from(root.querySelectorAll(selector)).flatMap((element) => element.getAnimations())
    let animations = collect()

    const goal = () => {
      const box = root.getBoundingClientRect()
      const span = box.height - document.documentElement.clientHeight
      return span > 0 ? Math.min(1, Math.max(0, -box.top / span / end)) : 0
    }
    // Die Animationen dauern in `[data-smooth]` eine Sekunde.
    const show = (progress: number) => {
      for (const animation of animations) animation.currentTime = progress * 1000
    }

    let current = goal()
    let last = 0
    let frame = 0
    show(current)

    const tick = (now: number) => {
      const target = goal()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      current += (target - current) * (1 - Math.exp(-dt / lag))
      if (Math.abs(target - current) < 0.0005) current = target
      show(current)
      frame = current === target ? 0 : requestAnimationFrame(tick)
    }

    const wake = () => {
      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }

    const onResize = () => {
      animations = collect()
      show(current)
      wake()
    }

    const stop = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', wake)
      window.removeEventListener('resize', onResize)
      motion.removeEventListener('change', stop)
      root.removeAttribute('data-smooth')
    }

    window.addEventListener('scroll', wake, { passive: true })
    window.addEventListener('resize', onResize)
    motion.addEventListener('change', stop)
    return stop
  }, [selector, end, rootSelector, lag])

  return <span ref={anchor} hidden />
}
