'use client'

import { useEffect, useRef } from 'react'

/**
 * Ein Beispielclip der Galerie: stumm, in Schleife.
 *
 * Spielt nur, solange die Karte im Bild ist: Im Band stehen sechzehn Karten
 * (die Liste doppelt), sichtbar sind höchstens sieben. Bis dahin lädt das
 * Video nichts und zeigt sein Standbild. Mit „Bewegung reduzieren" bleibt es
 * beim Standbild.
 */
export function GalleryVideo({
  src,
  poster,
  label,
}: {
  src: string
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
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label || undefined}
      className="absolute inset-0 size-full object-cover"
    />
  )
}
