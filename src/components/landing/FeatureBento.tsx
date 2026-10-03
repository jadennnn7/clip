import React from 'react'
import { Minus, Plus } from 'lucide-react'
import { CAPTION_PRESETS } from '../../../remotion/captions/presets'
import { CLIP_STILL, EPISODE_MOMENTS } from '@/components/landing/Episode'
import { EditorVisual } from '@/components/landing/FeatureVisuals'
import { LANDING_PLATFORMS, PlatformLogo } from '@/components/landing/PlatformLogo'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'

const PRESET_COUNT = Object.keys(CAPTION_PRESETS).length
const TOP = EPISODE_MOMENTS[0]

/**
 * „Funktionen" als Raster: was ein Clip mitbringt und wo du eingreifen
 * kannst — genau das, was der Film unter „So geht’s" nicht zeigt. Vorher
 * standen hier drei lange Kapitel, die denselben Ablauf noch einmal erzählten.
 *
 * Die große Kachel ist der Editor. Die kleinen Ansichten bleiben schlicht:
 * eine Aussage, ein Bild.
 */
export function FeatureBento() {
  return (
    <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
      <Tile
        index={0}
        className="md:col-span-2 lg:col-span-4 lg:row-span-2"
        title="Nachschärfen im Transkript"
        body="Jeder Clip landet im Editor. Schnittgrenzen setzt du im Text statt auf einer Timeline, Untertitel und Bildausschnitt mit einem Klick — die Vorschau wartet nicht auf einen Export."
      >
        <EditorVisual />
      </Tile>

      <Tile
        index={1}
        className="lg:col-span-2"
        title="Score mit Begründung"
        body="Jeder Clip bekommt 1–100 und zwei Sätze dazu — prüfen statt glauben."
      >
        <ScoreView />
      </Tile>

      <Tile
        index={2}
        className="lg:col-span-2"
        title="Reframing auf den Sprecher"
        body="Der 9:16-Ausschnitt folgt dem, der gerade spricht — von Hand korrigierbar."
      >
        <ReframeView />
      </Tile>

      <Tile
        index={3}
        className="lg:col-span-2"
        title={`${PRESET_COUNT} Untertitel-Vorlagen`}
        body="Wort für Wort im Takt der Sprache. Schrift, Farbe, Kontur und Animation frei einstellbar."
      >
        <CaptionsView />
      </Tile>

      <Tile
        index={4}
        className="lg:col-span-2"
        title="Auto-Publish ab deinem Score"
        body="Pro Kanal einstellbar. Alles darunter wartet in der Queue auf deine Freigabe."
      >
        <ThresholdView />
      </Tile>

      <Tile
        index={5}
        className="md:col-span-2 lg:col-span-2"
        title="Über die Woche verteilt"
        body="Die stärksten Clips zuerst, mit Abstand dazwischen und nur zwischen 9 und 21 Uhr — kein Kanal postet alles auf einmal."
      >
        <ScheduleView />
      </Tile>
    </ul>
  )
}

function Tile({
  index,
  className,
  title,
  body,
  children,
}: {
  index: number
  className?: string
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <li
      className={cn('glass-tile scroll-rise flex flex-col overflow-hidden rounded-3xl', className)}
      style={{ '--i': index % 3 } as React.CSSProperties}
    >
      <div aria-hidden className="flex flex-1 items-center justify-center p-4 sm:p-5">
        <div className="w-full">{children}</div>
      </div>
      <div className="px-6 pb-6">
        <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-white">
          {title}
        </h3>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-pretty text-white/60">{body}</p>
      </div>
    </li>
  )
}

/** Der stärkste Clip mit seinem Score und dem, was ihn trägt und bremst. */
function ScoreView() {
  const radius = 26
  const length = 2 * Math.PI * radius
  return (
    <div className="glass-field rounded-2xl p-4">
      <div className="flex items-center gap-4">
        <span className="relative flex size-16 shrink-0 items-center justify-center">
          <svg viewBox="0 0 64 64" className="absolute inset-0 size-full -rotate-90">
            <circle cx="32" cy="32" r={radius} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="5" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${(length * TOP.score) / 100} ${length}`}
            />
          </svg>
          <span className="font-display text-xl font-semibold text-white tabular-nums">
            {TOP.score}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-white">{TOP.text}</span>
          <span className="block font-mono text-[0.6875rem] text-white/45">
            4:05–4:37
          </span>
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-3 text-xs leading-relaxed text-white/70">
        <li className="flex gap-2">
          <Plus className="mt-0.5 size-3.5 shrink-0 text-brand" />
          These in den ersten drei Sekunden, klare Auflösung.
        </li>
        <li className="flex gap-2">
          <Minus className="mt-0.5 size-3.5 shrink-0 text-white/40" />
          Ein Nebensatz in der Mitte bremst kurz.
        </li>
      </ul>
    </div>
  )
}

/**
 * Das Querformat mit dem 9:16-Ausschnitt auf dem Sprecher. Das Standbild
 * gibt es nur im Hochformat: Der Rest der Szene ist dasselbe Bild, weich
 * gezogen und abgedunkelt — scharf ist nur, was im Clip landet.
 */
function ReframeView() {
  const cropW = (9 / 16) * (9 / 16) * 100
  const cropX = TOP.focus[0] * (100 - cropW)
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10">
      {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, schon in Kartengröße */}
      <img
        src={CLIP_STILL}
        alt=""
        loading="lazy"
        draggable={false}
        className="absolute inset-0 size-full scale-110 object-cover blur-md brightness-[0.4]"
      />
      <span
        className="absolute inset-y-0 overflow-hidden rounded-md ring-2 ring-brand"
        style={{ left: `${cropX}%`, width: `${cropW}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, schon in Kartengröße */}
        <img src={CLIP_STILL} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
      </span>
      <span className="glass-chip absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[0.625rem] font-medium">
        9:16 · folgt dem Sprecher
      </span>
    </div>
  )
}

/**
 * Drei Vorlagen auf demselben Bild: dieselben Farben, Konturen und
 * Schreibweisen wie im Editor — nur ohne deren Webfonts, die die
 * Landing-Page nicht lädt.
 */
function CaptionsView() {
  const samples = [
    { preset: CAPTION_PRESETS.hormozi, words: ['Das', 'ändert', 'alles'], hot: 1 },
    { preset: CAPTION_PRESETS.box, words: ['Niemand', 'sagt', 'dir', 'das'], hot: 0 },
    { preset: CAPTION_PRESETS.karaoke, words: ['So', 'fängst', 'du', 'an'], hot: 1 },
  ]
  return (
    <div className="relative overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10">
      {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, schon in Kartengröße */}
      <img
        src={CLIP_STILL}
        alt=""
        loading="lazy"
        draggable={false}
        className="absolute inset-0 size-full object-cover opacity-40 blur-[2px]"
      />
      <div className="relative flex flex-col items-center gap-3 px-3 py-6">
        {samples.map(({ preset, words, hot }) => (
          <p
            key={preset.preset}
            className="rounded-md px-2 py-0.5 text-center text-lg leading-tight font-extrabold"
            style={{
              color: preset.color,
              textTransform: preset.uppercase ? 'uppercase' : 'none',
              WebkitTextStroke: preset.strokeWidth ? `1.5px ${preset.strokeColor}` : undefined,
              paintOrder: 'stroke fill',
              backgroundColor: preset.background
                ? `color-mix(in srgb, ${preset.background} ${(preset.backgroundOpacity ?? 1) * 100}%, transparent)`
                : undefined,
              textShadow: '0 2px 6px rgb(0 0 0 / 0.5)',
            }}
          >
            {words.map((word, index) => (
              <React.Fragment key={index}>
                {index > 0 ? ' ' : null}
                <span style={index === hot ? { color: preset.highlightColor } : undefined}>
                  {word}
                </span>
              </React.Fragment>
            ))}
          </p>
        ))}
      </div>
    </div>
  )
}

/** Die Schwelle und die Kanäle, für die sie gilt. */
function ThresholdView() {
  return (
    <div className="glass-field rounded-2xl p-4">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Auto-Publish ab</span>
        <span className="rounded-full bg-brand px-2 py-0.5 font-mono font-semibold text-brand-ink tabular-nums">
          80
        </span>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-white/10">
        <span className="absolute inset-y-0 right-0 left-[80%] rounded-full bg-brand" />
        <span className="absolute top-1/2 left-[80%] size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-brand" />
      </div>
      <ul className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-3">
        {LANDING_PLATFORMS.map((platform) => (
          <li key={platform} className="flex items-center gap-2.5 text-xs text-white/80">
            <PlatformLogo platform={platform} className="size-4 text-white" />
            <span className="flex-1">{PLATFORM_LABEL[platform]}</span>
            <span className="flex h-4 w-7 items-center justify-end rounded-full bg-brand p-0.5">
              <span className="size-3 rounded-full bg-white" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr']
const SLOT_TIMES = ['09:00', '17:00']

/**
 * Die fünf Clips der Folge im Wochenplan — so, wie `distributePublishTimes`
 * sie legt: der stärkste zuerst, acht Stunden Abstand, nur zwischen 9 und
 * 21 Uhr. Was übrig bleibt, ist frei.
 */
function ScheduleView() {
  return (
    <div className="glass-field rounded-2xl p-4">
      <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1.5 text-[0.625rem]">
        <span />
        {WEEKDAYS.map((day) => (
          <span key={day} className="text-center font-medium text-white/50">{day}</span>
        ))}
        {SLOT_TIMES.map((time, row) => (
          <React.Fragment key={time}>
            <span className="self-center pr-1 font-mono text-white/40 tabular-nums">{time}</span>
            {WEEKDAYS.map((day, column) => {
              const index = column * SLOT_TIMES.length + row
              const moment = EPISODE_MOMENTS[index]
              return moment ? (
                <span
                  key={day}
                  className={cn(
                    'flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg ring-1 ring-inset',
                    index === 0 ? 'bg-brand/15 ring-brand/50' : 'bg-white/[0.06] ring-white/10',
                  )}
                >
                  <PlatformLogo platform={LANDING_PLATFORMS[index % LANDING_PLATFORMS.length]} className="size-3 text-white/80" />
                  <span className="font-semibold text-white tabular-nums">{moment.score}</span>
                </span>
              ) : (
                <span key={day} className="h-10 rounded-lg border border-dashed border-white/10" />
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-3 border-t border-white/[0.07] pt-3 font-mono text-[0.625rem] text-white/45">
        Stärkster Clip zuerst · alle 8 h · 9–21 Uhr
      </p>
    </div>
  )
}
