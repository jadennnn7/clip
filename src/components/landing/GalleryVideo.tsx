'use client'

import { useEffect, useRef } from 'react'

/**
 * Ein Beispielclip der Galerie: stumm, in Schleife.
 *
 * Spielt nur, solange die Karte im Bild ist: Im Band stehen sechzehn Karten
 * (die Liste doppelt), sichtbar sind höchstens sieben. Bis dahin lädt das
 * Video nichts und zeigt sein Standbild. Mit „Bewegung reduzieren" bleibt es
 * beim Standbild.
 *
 * Schmale Fenster bekommen `smallSrc` (360 × 640, gut halb so groß): Die
 * Karte ist dort nur 168 px breit. Die große Quelle steht zuerst und trägt
 * die Bedingung — ein Browser, der `media` an `<source>` nicht kennt, nimmt
 * sie wie bisher für alle.
 */
export function GalleryVideo({
  src,
  smallSrc,
  poster,
  label,
}: {
  src: string
  smallSrc?: string
  poster: string
  /** Leer für die doppelte Hälfte des Bands, die Vorleser überspringen. */
  label: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {})
      else video.pause()
    }, { rootMargin: '0px 240px' })
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  return (
    <video
      ref={videoRef}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label || undefined}
      className="absolute inset-0 size-full object-cover"
    >
      {/* Gleich der Grenze, ab der die Karte in `ClipGallery` wächst (`sm`). */}
      <source src={src} type="video/mp4" media={smallSrc ? '(min-width: 40rem)' : undefined} />
      {smallSrc ? <source src={smallSrc} type="video/mp4" /> : null}
    </video>
  )
}
