import React from 'react'
import { ChapterMarker, type ChapterId } from '@/components/landing/Chapters'
import { cn } from '@/lib/utils'

/**
 * Bausteine der öffentlichen Seiten (Landingpage, Partnerprogramm) — damit
 * jede Seite denselben Takt hat: gleiche Abstände, gleiche Köpfe, dasselbe
 * Licht.
 */

/**
 * Staffelung der Scroll-Animationen (`.scroll-rise` & Co. in `globals.css`)
 * für Kacheln, die in derselben Reihe gleichzeitig ins Bild kommen.
 */
export const stagger = (index: number) => ({ '--i': index }) as React.CSSProperties

/**
 * Ein Abschnitt der Seite — und ein Kapitel des Videos, das die Seite ist:
 * `data-chapter` ist der Anker, an dem der Scrubber in der Navbar das
 * Kapitel beginnen lässt. Keine Rahmenlinien und keine Farbbänder zwischen
 * den Abschnitten: Auf dem dunklen Grund trennt Abstand, und Licht gliedert.
 */
export function Section({
  id,
  children,
}: {
  id?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      data-chapter={id}
      className="relative scroll-mt-16 px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  )
}

/**
 * Kopf jedes Abschnitts: Kapitelmarke, Überschrift, Lead. Überall gleich,
 * damit die lange Seite einen Takt hat — die Marke nimmt die aus dem Hero
 * wieder auf, jede mit der Zeit, zu der ihr Kapitel beginnt. Seiten ohne
 * Kapitel geben ihre eigene Marke mit (`marker`).
 */
export function SectionHeader({
  chapter,
  marker,
  title,
  lead,
  className,
}: {
  chapter?: ChapterId
  marker?: React.ReactNode
  title: React.ReactNode
  lead?: string
  className?: string
}) {
  return (
    <header className={cn('max-w-2xl', className)}>
      {/* Marke, Überschrift und Lead kommen nacheinander herein. */}
      {marker ?? (chapter ? <ChapterMarker id={chapter} className="scroll-rise" /> : null)}
      <h2
        className="scroll-rise mt-5 font-display text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-white sm:text-5xl"
        style={stagger(0.5)}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className="scroll-rise mt-5 max-w-xl text-base leading-relaxed text-pretty text-white/60 sm:text-[1.0625rem]"
          style={stagger(1)}
        >
          {lead}
        </p>
      ) : null}
    </header>
  )
}

/**
 * Weiches Umgebungslicht hinter einem Abschnitt, leicht ins Logo-Blau
 * gezogen — so hallt der Hero über die ganze Seite nach.
 */
export function AmbientLight({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.08),transparent)]',
        className,
      )}
    />
  )
}
