'use client'

import { useEffect } from 'react'

/** Glasflächen im Inhalt — nicht die Kopfleiste, deren Glas nur einblendet. */
const SURFACE = 'main :is(.glass, .glass-tile)'

/**
 * Licht, das dem Zeiger folgt — nur auf der Landing-Page und nur mit Maus.
 *
 * Setzt `--mx`/`--my` (Pixel relativ zur Fläche) und `data-lit` auf die
 * Glasfläche unter dem Zeiger; `globals.css` zeichnet daraus einen weichen
 * Lichtfleck und lässt die Kante dort in Logo-Blau aufleuchten. Dazu
 * `--hx`/`--hy` auf `[data-hero-light]`, dem das große Licht im Hero träge
 * hinterherzieht.
 *
 * Ein einziger Listener, auf ein Bild pro Frame gedrosselt. Auch beim
 * Scrollen ohne Mausbewegung wird neu gemessen — sonst bliebe das Licht auf
 * der Fläche kleben, die unter dem Zeiger weggezogen ist.
 */
export function PointerLight() {
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return

    const hero = document.querySelector<HTMLElement>('[data-hero-light]')
    let x = -1
    let y = -1
    let frame = 0
    let lit: HTMLElement | null = null

    const light = (surface: HTMLElement | null) => {
      if (surface === lit) return
      lit?.removeAttribute('data-lit')
      lit = surface
      lit?.setAttribute('data-lit', '')
    }

    const update = () => {
      frame = 0
      if (x < 0) return

      const hit = document.elementFromPoint(x, y)
      light(hit?.closest<HTMLElement>(SURFACE) ?? null)
      if (lit) {
        const box = lit.getBoundingClientRect()
        lit.style.setProperty('--mx', `${x - box.left}px`)
        lit.style.setProperty('--my', `${y - box.top}px`)
      }

      if (hero) {
        const box = hero.getBoundingClientRect()
        const inside = y >= box.top && y <= box.bottom
        hero.toggleAttribute('data-pointer', inside)
        if (inside) {
          hero.style.setProperty('--hx', `${x - box.left}px`)
          hero.style.setProperty('--hy', `${y - box.top}px`)
        }
      }
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      x = event.clientX
      y = event.clientY
      schedule()
    }

    // Verlässt der Zeiger das Fenster, erlischt alles.
    const onLeave = () => {
      x = -1
      light(null)
      hero?.removeAttribute('data-pointer')
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', schedule, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', schedule)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      onLeave()
    }
  }, [])

  return null
}
