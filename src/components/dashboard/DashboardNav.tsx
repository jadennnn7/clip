'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, CalendarDays, Link2, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Projekte', icon: LayoutGrid },
  { href: '/dashboard/calendar', label: 'Kalender', icon: CalendarDays },
  { href: '/dashboard/connections', label: 'Kanäle', icon: Link2 },
  { href: '/dashboard/billing', label: 'Abo', icon: CreditCard },
] as const

/**
 * Hauptnavigation mit Kennzeichnung der aktuellen Seite.
 *
 * Bisher fehlte diese Anzeige vollständig — alle vier Einträge sahen auf jeder
 * Seite gleich aus. Dafür muss die Navigation clientseitig laufen
 * (`usePathname`), deshalb ist sie aus dem Server-Layout herausgelöst.
 */
export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="hidden items-center gap-0.5 md:flex">
      {NAV.map((item) => {
        // `/dashboard` ist Präfix aller anderen Routen und würde sonst immer
        // als aktiv gelten — deshalb dort exakter Vergleich.
        const isActive =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'transition-ui flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              isActive
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
