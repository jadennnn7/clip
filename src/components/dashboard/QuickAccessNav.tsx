'use client'

import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

const ITEMS = [
  {
    id: 'editor',
    label: 'Video-Editor',
    src: '/bubble-editor.png',
    onClick: true as const,
  },
  {
    id: 'clips',
    label: 'Clip-Bibliothek',
    src: '/bubble-clips.png',
    href: '/dashboard/clips',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    src: '/bubble-analytics.png',
    href: '/dashboard/analytics',
  },
  {
    id: 'calendar',
    label: 'Kalender',
    src: '/bubble-calendar.png',
    href: '/dashboard/calendar',
  },
  {
    id: 'brand',
    label: 'Brand-Kits',
    src: '/bubble-brand.png',
    href: '/dashboard/brand',
  },
] as const

/**
 * Schnellzugriff — flache Kacheln, zurückhaltender Hover.
 * Kein Glow, kein Lichtstreif: nur leichte Hebung und klarere Kante.
 */
export function QuickAccessNav({ onEditorOpen }: { onEditorOpen: () => void }) {
  return (
    <nav
      aria-label="Schnellzugriff"
      className="rise-in mt-6 flex items-center justify-center gap-4 sm:gap-6"
      style={{ animationDelay: '120ms' }}
    >
      {ITEMS.map((item) => {
        const body = (
          <>
            <div
              className={cn(
                'relative flex size-14 items-center justify-center rounded-2xl sm:size-15',
                'bg-foreground/[0.04] ring-1 ring-foreground/[0.08]',
                'transition-[transform,background-color,box-shadow,ring-color] duration-200 ease-out',
                'group-hover:-translate-y-0.5',
                'group-hover:bg-foreground/[0.07] group-hover:ring-foreground/16',
                'group-hover:shadow-[0_8px_20px_-10px_rgb(0_0_0/0.45)]',
                'group-focus-visible:bg-foreground/[0.07] group-focus-visible:ring-foreground/16',
              )}
            >
              <Image
                src={item.src}
                alt=""
                width={40}
                height={40}
                priority
                className="size-9 object-contain transition-transform duration-200 ease-out group-hover:scale-[1.03] sm:size-10"
              />
            </div>
            <span className="mt-2.5 text-[12px] font-medium tracking-tight text-foreground/65 transition-colors duration-200 ease-out group-hover:text-foreground sm:text-[12.5px]">
              {item.label}
            </span>
          </>
        )

        const shared =
          'group flex flex-col items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

        if (!('href' in item)) {
          return (
            <button
              key={item.id}
              type="button"
              onClick={onEditorOpen}
              className={cn(shared, 'cursor-pointer')}
            >
              {body}
            </button>
          )
        }

        return (
          <Link key={item.id} href={item.href} className={shared}>
            {body}
          </Link>
        )
      })}
    </nav>
  )
}
