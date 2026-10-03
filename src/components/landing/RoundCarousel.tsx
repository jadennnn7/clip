'use client'

import { useEffect, useRef } from 'react'

interface RoundCarouselImage {
  src: string
}

interface RoundCarouselProps {
  images?: RoundCarouselImage[]
  /** Beliebige Inhalte statt Bildern — hat Vorrang vor `images`. */
  faces?: React.ReactNode[]
  imageWidth?: number
  imageHeight?: number
  spacing?: number
  speed?: number
  direction?: 'right' | 'left'
  drag?: boolean
  sensitivity?: number
  tilt?: number
  perspective?: number
  cornerRadius?: number
  innerDim?: number
  background?: string
  style?: React.CSSProperties
}

export default function RoundCarousel({
  images = [],
  faces,
  imageWidth = 300,
  imageHeight = 300,
  spacing = 3,
  speed = 7,
  direction = 'right',
  drag = true,
  sensitivity = 5,
  tilt = -7,
  perspective = 3000,
  cornerRadius = 22,
  innerDim = 3.5,
  background = 'transparent',
  style = {},
}: RoundCarouselProps) {
  const items: (RoundCarouselImage | React.ReactNode)[] = faces ?? images
  const count = items.length

  const ringRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const rotYRef = useRef(0)
  const velRef = useRef(0)
  const lastRef = useRef(0)
  const dragRef = useRef({ active: false, x: 0 })

  const angle = 360 / count
  const factor = 1 + spacing * 0.15
  // Auf feste Nachkommastellen runden — sonst weichen Server- und Client-
  // Floats bei Hydration voneinander ab (z. B. 207.558 vs 207.558393…).
  const radius = Number(
    ((imageWidth * factor) / (2 * Math.tan(Math.PI / count))).toFixed(3),
  )
  const degPerSec = speed * 6 * (direction === 'left' ? -1 : 1)

  useEffect(() => {
    const ring = ringRef.current
    if (!ring) return

    const apply = () => {
      ring.style.transform = `translateZ(${-radius}px) rotateY(${rotYRef.current}deg)`
    }
    apply()

    // Ein dauerhaft rotierendes Element im Hero ist genau das, was
    // `prefers-reduced-motion` meint. Ziehen bleibt erlaubt — das löst der
    // Nutzer selbst aus.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

    const draw = (now: number) => {
      const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0
      lastRef.current = now
      const f = Math.min(dt, 0.1)
      const d = dragRef.current

      if (!d.active) {
        if (Math.abs(velRef.current) > 0.01) {
          rotYRef.current += velRef.current * f
          velRef.current *= 0.94
        } else if (!reduced.matches) {
          rotYRef.current += degPerSec * f
        }
      }

      apply()
      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastRef.current = 0
    }
  }, [radius, degPerSec, count])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!drag) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { active: true, x: e.clientX }
    velRef.current = 0
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d.active) return
    const dx = e.clientX - d.x
    d.x = e.clientX
    const k = 0.3 * sensitivity
    rotYRef.current += dx * k
    velRef.current = dx * k * 60
  }

  const onPointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragRef.current.active = false
  }

  const faceBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: cornerRadius,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }

  return (
    <div
      style={{
        ...style,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background,
        perspective: `${perspective}px`,
        cursor: drag ? 'grab' : 'default',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div style={{ transformStyle: 'preserve-3d', transform: `rotateX(${tilt}deg)` }}>
        <div
          ref={ringRef}
          style={{
            position: 'relative',
            width: imageWidth,
            height: imageHeight,
            transformStyle: 'preserve-3d',
          }}
        >
          {items.map((item, i) => {
            const node = faces ? (item as React.ReactNode) : null
            const src = faces ? undefined : (item as RoundCarouselImage)?.src

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: `rotateY(${i * angle}deg) translateZ(${radius}px)`,
                  transformStyle: 'preserve-3d',
                }}
              >
                <div
                  style={{
                    ...faceBase,
                    backgroundColor: src || node ? 'transparent' : '#222',
                    backgroundImage: src ? `url(${src})` : undefined,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                  }}
                >
                  {node}
                </div>
                <div
                  style={{
                    ...faceBase,
                    transform: 'rotateY(180deg)',
                    backgroundColor: src || node ? 'transparent' : '#181818',
                    backgroundImage: src ? `url(${src})` : undefined,
                    filter: `brightness(${innerDim / 10})`,
                  }}
                >
                  {node}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
