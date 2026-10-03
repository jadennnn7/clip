import type { ReactNode } from 'react'
import { Check, Link2, Mail, Plug } from 'lucide-react'
import { LANDING_PLATFORMS, PlatformLogo } from '@/components/landing/PlatformLogo'
import { getPlan, planFacts } from '@/lib/stripe/plans'
import { cn } from '@/lib/utils'

/**
 * Das Bild der Registrierung: der Weg zum ersten Clip.
 *
 * Die Anmeldung zeigt, was ein bestehendes Konto tut (den Feed). Hier steht,
 * was nach dem Klick auf „Registrieren" kommt — drei Schritte, der erste ist
 * der, in dem man gerade steht. Ein Lichtpunkt läuft die Schiene entlang und
 * zieht den Blick vom ersten zum letzten Schritt.
 *
 * Darunter der Gratis-Test aus `PLANS`: Wer sich registriert, soll vorher
 * wissen, was er bekommt.
 */

const thumb = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=72&h=128&fit=crop&crop=faces,center&q=70&auto=format`

const THUMBS = ['1500648767791-00dcc994a43e', '1494790108377-be9c29b29330', '1507003211169-0a1dd7228f2d']

const FREE = getPlan('free')

const CSS = `
@keyframes start-rail{0%{top:0%;opacity:0}8%{opacity:1}78%{opacity:1}88%{top:100%;opacity:0}100%{top:100%;opacity:0}}
@keyframes start-halo{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:0;transform:scale(1.6)}}
.start-rail{animation:start-rail 5.5s cubic-bezier(.65,0,.35,1) infinite}
.start-halo{animation:start-halo 2.4s ease-out infinite}
@media (prefers-reduced-motion:reduce){.start-rail,.start-halo{animation:none}.start-rail{opacity:0}}
`

export function StartSteps({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative select-none', className)}>
      <style>{CSS}</style>

      <ol className="relative flex flex-col gap-3">
        {/* Schiene zwischen den Knoten, mit dem wandernden Licht. */}
        <div className="pointer-events-none absolute top-9 bottom-9 left-[2.125rem] w-px bg-gradient-to-b from-white/35 via-white/15 to-white/10">
          <span className="start-rail absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_3px_rgb(255_255_255/0.55)]" />
        </div>

        <Step
          number={1}
          icon={<Mail className="size-4" />}
          title="Konto erstellen"
          text="Name und E-Mail – ein Passwort brauchst du nicht."
          active
        />

        <Step number={2} icon={<Plug className="size-4" />} title="Kanäle verbinden" text="Mit einem Klick, jederzeit wieder trennbar.">
          <div className="mt-3 flex gap-1.5">
            {LANDING_PLATFORMS.map((platform) => (
              <span key={platform} className="glass-lens flex size-8 items-center justify-center rounded-lg">
                <PlatformLogo platform={platform} className="size-4 text-white/85" />
              </span>
            ))}
          </div>
        </Step>

        <Step number={3} icon={<Link2 className="size-4" />} title="Erstes Video einfügen" text="Link oder Datei – die Clips entstehen von selbst.">
          <div className="mt-3 flex items-end gap-1.5">
            {THUMBS.map((id) => (
              <span key={id} className="relative h-14 w-8 overflow-hidden rounded-md ring-1 ring-white/15">
                {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, per URL zugeschnitten */}
                <img src={thumb(id)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              </span>
            ))}
            <span className="ml-1 text-xs text-white/45">+ weitere Clips</span>
          </div>
        </Step>
      </ol>

      <div className="glass-tile mt-4 rounded-2xl p-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold text-white">
            {FREE.name}
            <span className="ml-2 font-normal text-white/50">zum Start</span>
          </p>
          <p className="font-display text-2xl font-semibold tracking-tight text-white">
            0 €<span className="ml-1 text-sm font-normal text-white/50">einmalig</span>
          </p>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/[0.08] pt-4 text-[13px] text-white/70">
          {planFacts(FREE).map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="size-3.5 shrink-0 text-white/60" strokeWidth={2.5} />
              {feature}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Check className="size-3.5 shrink-0 text-white/60" strokeWidth={2.5} />
            Keine Kreditkarte nötig
          </li>
        </ul>
      </div>
    </div>
  )
}

function Step({
  number,
  icon,
  title,
  text,
  active = false,
  children,
}: {
  number: number
  icon: ReactNode
  title: string
  text: string
  active?: boolean
  children?: ReactNode
}) {
  return (
    <li className={cn('glass-tile flex items-start gap-4 rounded-2xl p-4', active && 'ring-1 ring-white/25')}>
      <span className="relative flex size-9 shrink-0 items-center justify-center">
        {active ? <span className="start-halo absolute inset-0 rounded-full bg-white/40" /> : null}
        <span
          className={cn(
            'relative flex size-9 items-center justify-center rounded-full',
            active ? 'liquid text-black' : 'glass-lens text-white/80',
          )}
        >
          {icon}
        </span>
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-medium tracking-[0.14em] text-white/45 uppercase">Schritt {number}</span>
          {active ? (
            <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-white uppercase">
              Jetzt
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-[15px] font-medium text-white">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-white/55">{text}</span>
        {/* Auf niedrigen Bildschirmen reicht der Text — sonst müsste man scrollen. */}
        {children ? <div className="[@media(max-height:820px)]:hidden">{children}</div> : null}
      </div>
    </li>
  )
}
