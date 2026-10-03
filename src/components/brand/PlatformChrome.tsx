import React from 'react'
import {
  Bookmark,
  Camera,
  ChevronDown,
  EllipsisVertical,
  Forward,
  Heart,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Music2,
  Plus,
  Repeat2,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import type { SocialPlatform } from '@/types/database'

/**
 * Wie ein Clip in den drei Apps aussieht, in denen er landet.
 *
 * Nachgezeichnet, nicht abfotografiert: nur die Elemente, die tatsächlich
 * über dem Video liegen — Kopfzeile, Leiste rechts, Name und Beschreibung
 * unten. Die Navigationsleiste der Apps fehlt mit Absicht; auf heutigen
 * Telefonen sitzt das 9:16-Video darüber, sie verdeckt also nichts.
 *
 * Alle Längen sind `cqw` des Bildes, der Vorfahr braucht `@container`. So
 * stimmen die Proportionen bei jeder Größe der Vorschau.
 */

export interface SafeZone {
  /** Unterkante der Kopfzeile, in Prozent der Bildhöhe. */
  top: number
  /** Oberkante von Name und Beschreibung. */
  bottom: number
  /** Oberkante der Leiste rechts. */
  railTop: number
  /** Breite der Leiste rechts, in Prozent der Bildbreite. */
  railWidth: number
}

/**
 * Wo die Apps eigene Bedienelemente über das Bild legen — gemessen an den
 * Zeichnungen unten, mit rund einem Prozent Luft. Zeichnung und Warnung
 * müssen übereinstimmen: Sonst warnt die Vorschau vor einer Überdeckung, die
 * im Bild daneben gar nicht zu sehen ist. Näherungswerte — die Apps
 * verschieben ihre Leisten mit jedem größeren Update ein Stück.
 */
export const PLATFORM_ZONES: Record<SocialPlatform, SafeZone> = {
  tiktok: { top: 9, bottom: 83, railTop: 45, railWidth: 15 },
  instagram: { top: 8, bottom: 83, railTop: 55, railWidth: 14 },
  youtube: { top: 8, bottom: 80, railTop: 43, railWidth: 16 },
}

/** Die strengste Kombination aller drei — gilt, solange keine App gewählt ist. */
export const STRICTEST_ZONE: SafeZone = {
  top: Math.max(...Object.values(PLATFORM_ZONES).map((zone) => zone.top)),
  bottom: Math.min(...Object.values(PLATFORM_ZONES).map((zone) => zone.bottom)),
  railTop: Math.min(...Object.values(PLATFORM_ZONES).map((zone) => zone.railTop)),
  railWidth: Math.max(...Object.values(PLATFORM_ZONES).map((zone) => zone.railWidth)),
}

/** Kurz genug für die Umschaltleiste. */
export const PLATFORM_SHORT_LABEL: Record<SocialPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Reels',
  youtube: 'Shorts',
}

const HANDLE = 'deinkanal'
const DESCRIPTION = 'Der wahre Grund, warum die meisten Creator aufgeben'
const TAGS = '#creator #mindset'

/** Weiße Schrift mit dem weichen Schatten, den alle drei Apps über Video legen. */
const SHADOW = '[text-shadow:0_1px_2px_rgb(0_0_0/0.5)] [&_svg]:drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.45)]'

export function PlatformChrome({ platform }: { platform: SocialPlatform }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 z-10 text-white select-none ${SHADOW}`}>
      {/* Die Apps dunkeln oben und unten leicht ab, damit ihre eigene Schrift
          lesbar bleibt — das gehört zum Bild, das der Zuschauer sieht. */}
      <div className="absolute inset-x-0 top-0 h-[14%] bg-gradient-to-b from-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-black/45 to-transparent" />
      {platform === 'tiktok' ? <TikTok /> : platform === 'instagram' ? <Reels /> : <Shorts />}
    </div>
  )
}

/* ========================================================================== */

function RailItem({ icon, label, filled = true }: { icon: React.ReactNode; label?: string; filled?: boolean }) {
  return (
    <span className="flex flex-col items-center" style={{ gap: '0.9cqw' }}>
      <span className={filled ? '[&_svg]:fill-current' : undefined}>{icon}</span>
      {label ? (
        <span className="font-semibold tabular-nums" style={{ fontSize: '3cqw' }}>
          {label}
        </span>
      ) : null}
    </span>
  )
}

const icon = (Component: React.ComponentType<{ style?: React.CSSProperties; strokeWidth?: number }>, size = 8.5) => (
  <Component style={{ width: `${size}cqw`, height: `${size}cqw` }} strokeWidth={1.75} />
)

function Avatar({ size }: { size: number }) {
  return (
    <span
      className="block shrink-0 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-600"
      style={{ width: `${size}cqw`, height: `${size}cqw`, boxShadow: '0 0 0 0.5cqw white' }}
    />
  )
}

/* ========================================================================== */

function TikTok() {
  return (
    <>
      <div className="absolute inset-x-0 flex items-center justify-center" style={{ top: '3.5%', fontSize: '4.2cqw' }}>
        <span className="font-semibold text-white/65">Folge ich</span>
        <span className="relative font-bold" style={{ marginLeft: '5cqw' }}>
          Für dich
          <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white" style={{ bottom: '-1.8cqw', width: '6cqw', height: '0.7cqw' }} />
        </span>
        <span className="absolute" style={{ right: '4cqw' }}>
          {icon(Search, 6)}
        </span>
      </div>

      <div className="absolute flex flex-col items-center" style={{ right: '2.5cqw', bottom: '3.5%', gap: '4.2cqw' }}>
        <span className="relative" style={{ marginBottom: '1.5cqw' }}>
          <Avatar size={10} />
          <span
            className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-white text-black"
            style={{ bottom: '-2.2cqw', width: '4.4cqw', height: '4.4cqw' }}
          >
            <Plus style={{ width: '3cqw', height: '3cqw' }} strokeWidth={3} />
          </span>
        </span>
        <RailItem icon={icon(Heart)} label="12,4K" />
        <RailItem icon={icon(MessageCircle)} label="318" />
        <RailItem icon={icon(Bookmark)} label="1.204" />
        <RailItem icon={icon(Forward)} label="96" />
        <span
          className="rounded-full"
          style={{ width: '9cqw', height: '9cqw', background: 'radial-gradient(circle, #a3a3a3 0 22%, #262626 24% 100%)', boxShadow: '0 0 0 1.2cqw #171717' }}
        />
      </div>

      <div className="absolute" style={{ left: '3.5cqw', right: '19cqw', bottom: '3.5%', fontSize: '3.6cqw', lineHeight: 1.35 }}>
        <p className="font-bold" style={{ fontSize: '4cqw' }}>
          {HANDLE}
        </p>
        <p className="line-clamp-2" style={{ marginTop: '1cqw' }}>
          {DESCRIPTION} <span className="font-semibold">{TAGS}</span>
        </p>
        <p className="flex items-center" style={{ marginTop: '1.6cqw', gap: '1.4cqw' }}>
          {icon(Music2, 3.6)}
          <span className="truncate">Originalton – {HANDLE}</span>
        </p>
      </div>
    </>
  )
}

/* ========================================================================== */

function Reels() {
  return (
    <>
      <div className="absolute inset-x-0 flex items-center justify-between" style={{ top: '3.2%', padding: '0 4cqw', fontSize: '5.4cqw' }}>
        <span className="flex items-center font-bold" style={{ gap: '1cqw' }}>
          Reels
          {icon(ChevronDown, 5)}
        </span>
        {icon(Camera, 7)}
      </div>

      <div className="absolute flex flex-col items-center" style={{ right: '3cqw', bottom: '3.5%', gap: '4.4cqw' }}>
        <RailItem icon={icon(Heart, 7.5)} label="12,4K" filled={false} />
        <RailItem icon={icon(MessageCircle, 7.5)} label="318" filled={false} />
        <RailItem icon={icon(Send, 7.5)} label="96" filled={false} />
        <RailItem icon={icon(MoreHorizontal, 7.5)} filled={false} />
        <span
          className="rounded-md bg-gradient-to-br from-neutral-400 to-neutral-700"
          style={{ width: '7.5cqw', height: '7.5cqw', boxShadow: '0 0 0 0.5cqw white' }}
        />
      </div>

      <div className="absolute" style={{ left: '3.5cqw', right: '18cqw', bottom: '3.5%', fontSize: '3.6cqw', lineHeight: 1.35 }}>
        <p className="flex items-center" style={{ gap: '2cqw' }}>
          <Avatar size={7.5} />
          <span className="font-semibold" style={{ fontSize: '3.8cqw' }}>
            {HANDLE}
          </span>
          <span className="rounded-md font-semibold" style={{ padding: '0.6cqw 2.2cqw', boxShadow: 'inset 0 0 0 0.35cqw rgb(255 255 255 / 0.85)' }}>
            Folgen
          </span>
        </p>
        <p className="line-clamp-1" style={{ marginTop: '2cqw' }}>
          {DESCRIPTION} <span className="text-white/70">… mehr</span>
        </p>
        <p className="flex items-center" style={{ marginTop: '1.6cqw', gap: '1.4cqw' }}>
          {icon(Music2, 3.6)}
          <span className="truncate">
            {HANDLE} · Originalaudio
          </span>
        </p>
      </div>
    </>
  )
}

/* ========================================================================== */

function Shorts() {
  return (
    <>
      <div className="absolute inset-x-0 flex items-center justify-end" style={{ top: '3.2%', padding: '0 3cqw', gap: '5cqw' }}>
        {icon(Search, 6.5)}
        {icon(EllipsisVertical, 6.5)}
      </div>

      <div className="absolute flex flex-col items-center" style={{ right: '2.5cqw', bottom: '3.5%', gap: '3.4cqw' }}>
        {/* Das Label unter „Mag ich nicht“ fehlt wie in der App bei schmalen
            Bildschirmen — ausgeschrieben wäre es breiter als die Leiste. */}
        {[
          { key: 'like', Icon: ThumbsUp, label: '12.402' },
          { key: 'dislike', Icon: ThumbsDown, label: null },
          { key: 'comments', Icon: MessageSquareText, label: '318' },
          { key: 'share', Icon: Forward, label: 'Teilen' },
          { key: 'remix', Icon: Repeat2, label: 'Remix' },
        ].map(({ key, Icon, label }) => (
          <span key={key} className="flex flex-col items-center" style={{ gap: '0.9cqw' }}>
            <span
              className="flex items-center justify-center rounded-full bg-black/35 [&_svg]:fill-current"
              style={{ width: '10cqw', height: '10cqw' }}
            >
              {icon(Icon, 5.5)}
            </span>
            {label ? (
              <span className="font-medium whitespace-nowrap" style={{ fontSize: '2.7cqw' }}>
                {label}
              </span>
            ) : null}
          </span>
        ))}
        <span
          className="rounded-md bg-gradient-to-br from-neutral-400 to-neutral-700"
          style={{ width: '8.5cqw', height: '8.5cqw', boxShadow: '0 0 0 0.5cqw white' }}
        />
      </div>

      <div className="absolute" style={{ left: '3.5cqw', right: '19cqw', bottom: '3.5%', fontSize: '3.7cqw', lineHeight: 1.35 }}>
        <p className="flex items-center" style={{ gap: '2cqw' }}>
          <Avatar size={7.5} />
          <span className="font-semibold">@{HANDLE}</span>
          <span className="rounded-full bg-white font-semibold text-black" style={{ padding: '1cqw 3cqw', fontSize: '3.3cqw' }}>
            Abonnieren
          </span>
        </p>
        <p className="line-clamp-2 font-medium" style={{ marginTop: '2cqw' }}>
          {DESCRIPTION}
        </p>
        <p className="flex items-center" style={{ marginTop: '1.6cqw', gap: '1.4cqw' }}>
          {icon(Music2, 3.6)}
          <span className="truncate">Originalton · {HANDLE}</span>
        </p>
      </div>
    </>
  )
}
