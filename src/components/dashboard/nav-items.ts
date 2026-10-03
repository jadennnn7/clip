import type { LucideIcon } from 'lucide-react'
import { BarChart3, CalendarDays, CreditCard, House, Library, Link2, Palette, UserRound } from 'lucide-react'

/**
 * Die Ziele der App-Navigation — einmal definiert, dreimal genutzt: Sidebar,
 * Befehlspalette und Pfadzeile in der Kopfleiste. Drei eigene Listen würden
 * genau so lange übereinstimmen, bis jemand eine Seite umbenennt.
 */

export const NAV_GROUPS = ['Arbeitsbereich', 'Veröffentlichen', 'Konto'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  group: NavGroup
  /** `/dashboard` ist Präfix aller anderen Routen — dort exakter Vergleich. */
  exact?: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Übersicht', icon: House, group: 'Arbeitsbereich', exact: true },
  { href: '/dashboard/clips', label: 'Clip-Bibliothek', icon: Library, group: 'Arbeitsbereich' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, group: 'Arbeitsbereich' },
  { href: '/dashboard/brand', label: 'Brand-Kits', icon: Palette, group: 'Arbeitsbereich' },
  { href: '/dashboard/calendar', label: 'Kalender', icon: CalendarDays, group: 'Veröffentlichen' },
  { href: '/dashboard/connections', label: 'Kanäle', icon: Link2, group: 'Veröffentlichen' },
  { href: '/dashboard/billing', label: 'Abo & Verbrauch', icon: CreditCard, group: 'Konto' },
  { href: '/dashboard/account', label: 'Konto & Daten', icon: UserRound, group: 'Konto' },
]

export function isNavActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

export function findNavItem(pathname: string) {
  return NAV_ITEMS.find((item) => isNavActive(item, pathname))
}
