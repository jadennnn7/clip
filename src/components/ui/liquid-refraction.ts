'use client'

import { useCallback } from 'react'

/**
 * Lichtbrechung an der Kante einer Glasfläche.
 *
 * Unschärfe allein macht Milchglas. Flüssig wirkt Glas erst, wenn es den
 * Hintergrund an der Kante bricht: Was unter der Wölbung durchläuft, wird
 * zur Mitte hin gezogen und verbiegt sich, sobald man scrollt.
 *
 * Technik: Für jede Fläche wird eine Verschiebungskarte in ihrer exakten
 * Größe und mit ihrem Eckradius gezeichnet — Rot verschiebt waagerecht, Grün
 * senkrecht, 128 heißt „bleibt". Ein SVG-Filter wendet sie als Teil von
 * `backdrop-filter` an. Eine gestreckte Einheitskarte ginge auch, verzöge
 * aber die Kante bei Pillen mit 250 × 44 Pixeln zur Unkenntlichkeit.
 *
 * SVG-Filter in `backdrop-filter` kann bislang nur Chromium. Überall sonst
 * bleibt es beim bisherigen, stärker mattierten Glas — die Variablen werden
 * dann gar nicht erst gesetzt.
 */

interface RefractionOptions {
  /** Maximale Verschiebung an der Kante, in Pixeln. */
  depth?: number
  /** Breite der gewölbten Kante, in Pixeln. */
  bezel?: number
  /** Unschärfe dahinter. Brechendes Glas ist klarer, sonst sieht man die Brechung nicht. */
  blur?: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

let supported: boolean | null = null
let host: SVGSVGElement | null = null
let counter = 0

function supportsRefraction() {
  if (supported !== null) return supported
  const brands =
    (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData
      ?.brands ?? []
  supported =
    brands.some(({ brand }) => brand === 'Chromium') &&
    CSS.supports('backdrop-filter', 'url(#a)') &&
    !window.matchMedia('(prefers-reduced-transparency: reduce)').matches
  return supported
}

function filterHost() {
  if (host?.isConnected) return host
  host = document.createElementNS(SVG_NS, 'svg')
  host.setAttribute('aria-hidden', 'true')
  host.setAttribute('width', '0')
  host.setAttribute('height', '0')
  host.style.position = 'absolute'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)
  return host
}

/**
 * Zeichnet die Verschiebungskarte für ein abgerundetes Rechteck.
 *
 * Innerhalb der Kantenbreite zeigt jeder Pixel auf einen Punkt weiter innen,
 * quadratisch zur Kante hin stärker — wie eine Linse, deren Wölbung erst am
 * Rand steil wird. Die Mitte bleibt unverzerrt, dort steht der Text.
 */
function displacementMap(width: number, height: number, radius: number, bezel: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  const image = context.createImageData(width, height)
  const data = image.data
  const halfW = width / 2
  const halfH = height / 2
  const r = Math.min(radius, halfW, halfH)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = x + 0.5 - halfW
      const cy = y + 0.5 - halfH
      const qx = Math.abs(cx) - (halfW - r)
      const qy = Math.abs(cy) - (halfH - r)

      // Abstand zur Kante (innen positiv) und die Richtung nach außen.
      let inset: number
      let nx = 0
      let ny = 0
      if (qx > 0 && qy > 0) {
        const length = Math.hypot(qx, qy)
        inset = r - length
        nx = (qx / length) * Math.sign(cx)
        ny = (qy / length) * Math.sign(cy)
      } else if (qx > qy) {
        inset = r - qx
        nx = Math.sign(cx)
      } else {
        inset = r - qy
        ny = Math.sign(cy)
      }

      let strength = 0
      if (inset < bezel) {
        const t = 1 - Math.max(0, inset) / bezel
        strength = t * t
      }

      const index = (y * width + x) * 4
      data[index] = 128 - nx * strength * 127
      data[index + 1] = 128 - ny * strength * 127
      data[index + 2] = 128
      data[index + 3] = 255
    }
  }

  context.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

/**
 * Ref-Callback, der einer `.glass`-Fläche Lichtbrechung gibt.
 *
 * Die Karte wird neu gezeichnet, wenn sich die Größe der Fläche ändert —
 * höchstens einmal pro Frame. Beim Entfernen verschwindet auch ihr Filter.
 */
export function useRefraction<T extends HTMLElement>({
  depth = 22,
  bezel = 14,
  blur = 8,
}: RefractionOptions = {}) {
  return useCallback(
    (element: T | null) => {
      if (!element || !supportsRefraction()) return

      const id = `liquid-refraction-${++counter}`
      const filter = document.createElementNS(SVG_NS, 'filter')
      filter.id = id
      filter.setAttribute('x', '0')
      filter.setAttribute('y', '0')
      filter.setAttribute('width', '1')
      filter.setAttribute('height', '1')
      // Ohne sRGB würde der Browser die Kartenwerte linearisieren, und 128
      // hieße nicht mehr „keine Verschiebung".
      filter.setAttribute('color-interpolation-filters', 'sRGB')

      const map = document.createElementNS(SVG_NS, 'feImage')
      map.setAttribute('x', '0')
      map.setAttribute('y', '0')
      map.setAttribute('preserveAspectRatio', 'none')
      map.setAttribute('result', 'map')

      const displace = document.createElementNS(SVG_NS, 'feDisplacementMap')
      displace.setAttribute('in', 'SourceGraphic')
      displace.setAttribute('in2', 'map')
      displace.setAttribute('scale', String(depth))
      displace.setAttribute('xChannelSelector', 'R')
      displace.setAttribute('yChannelSelector', 'G')

      filter.append(map, displace)
      filterHost().appendChild(filter)

      let frame = 0
      let drawn = ''
      const draw = () => {
        frame = 0
        const width = element.offsetWidth
        const height = element.offsetHeight
        if (!width || !height) return
        const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
        const key = `${width}x${height}r${radius}`
        if (key === drawn) return
        const url = displacementMap(width, height, radius, bezel)
        if (!url) return
        drawn = key
        map.setAttribute('width', String(width))
        map.setAttribute('height', String(height))
        map.setAttribute('href', url)
        // Erst jetzt einschalten: Ein Filter ohne Karte würde den Hintergrund
        // für einen Frame verschlucken.
        element.style.setProperty('--glass-refraction', `url(#${id})`)
        element.style.setProperty('--glass-blur', `${blur}px`)
      }

      const observer = new ResizeObserver(() => {
        if (!frame) frame = requestAnimationFrame(draw)
      })
      observer.observe(element)

      return () => {
        observer.disconnect()
        cancelAnimationFrame(frame)
        filter.remove()
        element.style.removeProperty('--glass-refraction')
        element.style.removeProperty('--glass-blur')
      }
    },
    [depth, bezel, blur],
  )
}
