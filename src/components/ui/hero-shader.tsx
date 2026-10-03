'use client'

import type React from 'react'

import { MeshGradient } from '@paper-design/shaders-react'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

/**
 * Shader-Hintergrund für den Hero.
 *
 * Angepasst von Paper Design's "Hero Shader" — die Original-Farben
 * (#8b5cf6 Violett, #1e1b4b Indigo, #4c1d95 Purpur) sind hier durch die
 * Blautöne des Logos ersetzt (`--color-brand*` in `globals.css`). Beide
 * Mesh-Ebenen und das Spotlight sind blau; die zweite, schwächere Ebene
 * bringt mit dem hellsten Logo-Ton weißliches Licht hinein, damit der Hero
 * nach Glas aussieht und nicht nach eingefärbter Fläche.
 *
 * Der Shader ist Atmosphäre, nicht Motiv. Die frühere Fassung ließ ihn roh
 * über die volle Fläche laufen: Seine helle Keule wanderte durch die
 * Headline, sodass „Zehn Clips." je nach Animationsphase auf Weiß stand und
 * verschwand. Deshalb liegt er jetzt unter einer Kette von Schichten, die
 * ihn führen — Maske, Spotlight, Raster, Scrim, Vignette, Auslauf. Sie
 * sind Weiß- und Schwarz-Alpha und garantieren, dass Text immer auf nahezu
 * Schwarz sitzt.
 */
interface ShaderBackgroundProps {
  children: React.ReactNode
  className?: string
  /**
   * Auslauf nach Schwarz am unteren Rand samt Lichtnaht. Der Hero braucht ihn,
   * um in die Seite überzugehen; eine abgeschlossene Bühne im Dashboard hat
   * keinen Übergang — dort würde der 16rem hohe Verlauf die halbe Fläche
   * abdunkeln.
   */
  fade?: boolean
}

export function ShaderBackground({
  children,
  className,
  fade = true,
}: ShaderBackgroundProps) {
  const reducedMotion = usePrefersReducedMotion()

  // Die Shader rendern auf Canvas — die `prefers-reduced-motion`-Regel aus
  // `globals.css` greift dort nicht, weil sie nur CSS-Animationen abschaltet.
  // Speed 0 friert das Mesh auf einem Standbild ein, statt es zu entfernen:
  // Die Komposition bleibt identisch, nur die Bewegung fällt weg.
  const speedFactor = reducedMotion ? 0 : 1

  return (
    <div
      className={`relative isolate w-full overflow-hidden bg-black ${className ?? ''}`}
    >
      {/* SVG-Filter: `glass-effect` für die Badge-Pille, `gooey-filter` für
          den verschmelzenden CTA-Button in der Navbar. */}
      <svg className="absolute inset-0 size-0">
        <defs>
          <filter
            id="glass-effect"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feTurbulence baseFrequency="0.005" numOctaves={1} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02
                      0 1 0 0 0.02
                      0 0 1 0 0.02
                      0 0 0 0.9 0"
              result="tint"
            />
          </filter>
          <filter
            id="gooey-filter"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 19 -9"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Schicht 1 — das Mesh selbst, maskiert.
          `backgroundColor`/`wireframe` aus der Vorlage existieren in der
          installierten Paketversion (0.0.80) nicht mehr; die Basisfläche kommt
          aus dem `bg-black` des Containers. Die Maske zieht das Licht nach
          oben und lässt es zum unteren Rand hin auf Schwarz auslaufen, damit
          der Hero nicht mit einer harten Kante in den nächsten Abschnitt
          stößt. Langsamer und weniger verzerrt als zuvor: Ein Hintergrund,
          der sich sichtbar windet, zieht den Blick von der Headline ab. */}
      <div
        className="absolute inset-0 opacity-95"
        style={{
          maskImage:
            'radial-gradient(130% 78% at 50% 4%, #000 0%, #000 38%, transparent 82%)',
          WebkitMaskImage:
            'radial-gradient(130% 78% at 50% 4%, #000 0%, #000 38%, transparent 82%)',
        }}
      >
        <MeshGradient
          className="absolute inset-0 size-full"
          colors={['#000000', '#2493ff', '#8fc8ff', '#0b2f5c', '#4aa3ff']}
          speed={0.14 * speedFactor}
          distortion={0.62}
        />
        <MeshGradient
          className="absolute inset-0 size-full opacity-45"
          colors={['#000000', '#d2e8fd', '#2f7fd6', '#000000']}
          speed={0.09 * speedFactor}
          grainOverlay={0.4}
        />
      </div>

      {/* Schicht 2 — Spotlight. Eine einzelne, sehr weiche Lichtquelle über
          der Headline. Sie gibt der Fläche eine Richtung; ohne sie wirkt das
          Mesh wie Rauschen ohne Ursache. */}
      <div
        className="absolute inset-x-0 top-0 h-[70%]"
        style={{
          background:
            'radial-gradient(60% 100% at 50% -8%, rgba(111,186,253,0.34), rgba(36,147,255,0.12) 42%, transparent 72%)',
        }}
      />

      {/* Schicht 3 — Hairline-Raster. Gibt der Fläche Maßstab und verrät,
          dass hier etwas konstruiert wurde. Radial ausmaskiert, damit es sich
          zum Rand hin auflöst statt abzuschneiden. */}
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(100% 70% at 50% 28%, #000 0%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(100% 70% at 50% 28%, #000 0%, transparent 78%)',
        }}
      />

      {/* Schicht 4 — Scrim. Der eigentliche Grund, warum die Headline jetzt
          in jeder Animationsphase gleich gut lesbar ist: eine weiche dunkle
          Ellipse genau dort, wo die Textspalte steht. Sie senkt die Helligkeit
          unter dem Text um einen konstanten Betrag, unabhängig davon, wohin
          die helle Keule des Meshs gerade wandert. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(52% 48% at 50% 34%, rgba(0,0,0,0.72), rgba(0,0,0,0.45) 55%, transparent 80%)',
        }}
      />

      {/* Schicht 5 — Vignette und Auslauf nach unten. Der lineare Verlauf
          endet auf reinem Schwarz, sodass der Hero in die Seite übergeht,
          statt an ihr abzubrechen. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 40%, transparent 42%, rgba(0,0,0,0.55) 78%, rgba(0,0,0,0.85) 100%)',
        }}
      />
      {fade ? (
        <>
          <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent via-black/70 to-black" />

          {/* Schicht 6 — die Naht. Ein Lichtfaden auf der Kante zum nächsten
              Abschnitt; dasselbe Detail, das Karten und Pillen hier oben tragen. */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </>
      ) : null}

      <div className="relative z-10">{children}</div>
    </div>
  )
}
