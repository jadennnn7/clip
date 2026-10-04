'use client'

import Link from 'next/link'
import { Clapperboard, type LucideIcon } from 'lucide-react'
import { NAV_ITEMS } from '@/components/dashboard/nav-items'
import { EDITOR_ENABLED } from '@/lib/features'
import { cn } from '@/lib/utils'

/** Das Icon, das die Sidebar für diese Seite zeigt — einmal definiert in `nav-items.ts`. */
function sidebarIcon(href: string): LucideIcon {
  const icon = NAV_ITEMS.find((item) => item.href === href)?.icon
  if (!icon) throw new Error(`Kein Navigationseintrag für ${href}`)
  return icon
}

const ITEMS: ReadonlyArray<{ id: string; label: string; icon: LucideIcon; href?: string }> = [
  { id: 'editor', label: 'Video-Editor', icon: Clapperboard },
  { id: 'clips', label: 'Clip-Bibliothek', icon: sidebarIcon('/dashboard/clips'), href: '/dashboard/clips' },
  { id: 'analytics', label: 'Analytics', icon: sidebarIcon('/dashboard/analytics'), href: '/dashboard/analytics' },
  { id: 'calendar', label: 'Kalender', icon: sidebarIcon('/dashboard/calendar'), href: '/dashboard/calendar' },
  { id: 'brand', label: 'Brand-Kits', icon: sidebarIcon('/dashboard/brand'), href: '/dashboard/brand' },
]

// Der Video-Editor ist abgeschaltet (`lib/features.ts`) — dann ohne seine Kachel.
const VISIBLE_ITEMS = ITEMS.filter((item) => EDITOR_ENABLED || item.id !== 'editor')

/**
 * Schnellzugriff — flache Kacheln mit denselben Linien-Icons wie die
 * Sidebar. Vorher standen hier bunte 3D-Bilder; die wirkten verspielt neben
 * dem sonst ruhigen, flachen Dashboard. Hover: leichte Hebung, klarere
 * Kante, das Icon wird logo-blau — wie in der Sidebar.
 */
export function QuickAccessNav({ onEditorOpen }: { onEditorOpen: () => void }) {
  return (
    <nav
      aria-label="Schnellzugriff"
      className="rise-in mt-6 flex items-center justify-center gap-4 sm:gap-6"
      style={{ animationDelay: '120ms' }}
    >
      {VISIBLE_ITEMS.map((item) => {
        const Icon = item.icon
        const body = (
          <>
            <div
              className={cn(
                'relative flex size-12 items-center justify-center rounded-[14px] sm:size-13',
                'bg-foreground/[0.04] ring-1 ring-foreground/[0.08]',
                'transition-[transform,background-color,box-shadow,ring-color] duration-200 ease-out',
                'group-hover:-translate-y-0.5',
                'group-hover:bg-foreground/[0.07] group-hover:ring-foreground/16',
                'group-hover:shadow-[0_8px_20px_-10px_rgb(0_0_0/0.45)]',
                'group-focus-visible:bg-foreground/[0.07] group-focus-visible:ring-foreground/16',
              )}
            >
              <Icon
                aria-hidden
                strokeWidth={1.75}
                className="size-5 text-foreground/70 transition-colors duration-200 ease-out group-hover:text-primary group-focus-visible:text-primary"
              />
            </div>
            <span className="mt-2.5 text-[12px] font-medium tracking-tight text-foreground/65 transition-colors duration-200 ease-out group-hover:text-foreground sm:text-[12.5px]">
              {item.label}
            </span>
          </>
        )

        const shared =
          'group flex flex-col items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

        if (!item.href) {
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
