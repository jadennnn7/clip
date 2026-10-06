'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeft, type LucideIcon } from 'lucide-react'
import { MotionConfig, motion } from 'motion/react'

import { cn } from '@/lib/utils'
import { SIDEBAR_STATE_KEY, isSidebarCollapsed } from '@/lib/sidebar-state'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Feste Seitennavigation, per Knopf oder ⌘B auf eine Symbolschiene einklappbar.
 *
 * Vorher klappte die Leiste nur beim Überfahren auf und lag dabei `fixed` über
 * dem Inhalt. Das hielt das Layout ruhig, versteckte aber die Beschriftungen
 * die meiste Zeit — Navigation, die man erst suchen muss, ist keine. Jetzt
 * steht sie im Textfluss und ist standardmäßig eingeklappt; wer die Labels
 * sehen will, klappt sie bewusst auf, und das bleibt gespeichert.
 *
 * Unverändert gilt: **Beschriftungen bleiben im DOM.** Eingeklappt werden sie
 * nur ausgeblendet, damit die Verweise ihren zugänglichen Namen behalten.
 *
 * Unter `md` wird die Leiste zur Schublade über dem Inhalt; dort gibt es kein
 * Eingeklappt, nur offen oder zu.
 */

const RAIL_WIDTH = '3.05rem'
const PANEL_WIDTH = '15rem'
const DESKTOP_QUERY = '(min-width: 48rem)'

/* --- Gespeicherter Einklapp-Zustand ------------------------------------------
   Über `useSyncExternalStore` statt Effekt plus setState — siehe
   `use-stored-layout.ts`. Der Wert wird zusätzlich im Speicher gehalten: Ist
   localStorage blockiert, soll der Knopf trotzdem funktionieren, nur eben
   ohne Erinnerung über den Reload hinaus. Ein Cookie spiegelt ihn für den
   Server (siehe `lib/sidebar-state.ts`). */

const listeners = new Set<() => void>()
let collapsedValue: boolean | null = null

function readCollapsed(): boolean {
  if (collapsedValue !== null) return collapsedValue
  try {
    collapsedValue = isSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STATE_KEY))
  } catch {
    collapsedValue = true
  }
  return collapsedValue
}

function writeCookie(collapsed: boolean) {
  document.cookie = `${SIDEBAR_STATE_KEY}=${collapsed ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
}

function writeCollapsed(next: boolean) {
  collapsedValue = next
  try {
    window.localStorage.setItem(SIDEBAR_STATE_KEY, next ? 'collapsed' : 'expanded')
  } catch {
    // Privater Modus oder blockierter Speicher — gilt dann nur bis zum Reload.
  }
  writeCookie(next)
  listeners.forEach((listener) => listener())
}

function subscribeCollapsed(listener: () => void) {
  listeners.add(listener)
  // Ein zweiter Tab soll dieselbe Breite übernehmen, statt beim nächsten
  // Reload überraschend umzuspringen.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SIDEBAR_STATE_KEY) return
    collapsedValue = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function subscribeDesktop(listener: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/* --- Kontext ------------------------------------------------------------------ */

type SidebarContextValue = {
  /** Eingeklappt — gilt nur ab `md`; in der Schublade ist die Leiste immer breit. */
  collapsed: boolean
  toggle: () => void
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  /** Erst nach einer Nutzeraktion animieren, nicht beim Wiederherstellen. */
  animated: boolean
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar muss innerhalb von <SidebarProvider> verwendet werden.')
  }
  return context
}

function SidebarProvider({
  children,
  defaultCollapsed = true,
}: {
  children: React.ReactNode
  /** Zustand aus dem Cookie — damit schon das Server-HTML die richtige Breite hat. */
  defaultCollapsed?: boolean
}) {
  const pathname = usePathname()
  const storedCollapsed = React.useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => defaultCollapsed,
  )
  const isDesktop = React.useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  )
  const [animated, setAnimated] = React.useState(false)
  // Die Schublade merkt sich, auf welcher Seite sie geöffnet wurde. Führt ein
  // Klick darin woandershin, ist sie damit automatisch zu — ohne Effekt, der
  // auf den Routenwechsel lauscht.
  const [openedOn, setOpenedOn] = React.useState<string | null>(null)

  const collapsed = storedCollapsed && isDesktop
  const mobileOpen = !isDesktop && openedOn === pathname

  const toggle = React.useCallback(() => {
    setAnimated(true)
    writeCollapsed(!readCollapsed())
  }, [])

  const setMobileOpen = React.useCallback(
    (open: boolean) => setOpenedOn(open ? pathname : null),
    [pathname],
  )

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        if (window.matchMedia(DESKTOP_QUERY).matches) toggle()
        else setOpenedOn((current) => (current ? null : window.location.pathname))
      }
      if (event.key === 'Escape') setOpenedOn(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  // Wer den Zustand bisher nur in localStorage hatte, bekommt ihn einmal ins
  // Cookie gespiegelt — ab dem nächsten Laden stimmt dann schon das Server-HTML.
  React.useEffect(() => {
    if (!document.cookie.split('; ').some((entry) => entry.startsWith(`${SIDEBAR_STATE_KEY}=`))) {
      writeCookie(readCollapsed())
    }
  }, [])

  const value = React.useMemo(
    () => ({ collapsed, toggle, mobileOpen, setMobileOpen, animated }),
    [collapsed, toggle, mobileOpen, setMobileOpen, animated],
  )

  return (
    <SidebarContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </SidebarContext.Provider>
  )
}

/* --- Bausteine ---------------------------------------------------------------- */

function Sidebar({ className, children, ...props }: React.ComponentProps<'nav'>) {
  const { collapsed, mobileOpen, setMobileOpen, animated } = useSidebar()

  return (
    <>
      {/* Bleibt stehen und blendet nur aus — sonst verschwände der Schleier
          beim Schließen schlagartig, während die Schublade noch hinausgleitet. */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/30 backdrop-blur-[3px] transition-opacity duration-300 ease-out-quint md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <nav
        data-slot="sidebar"
        data-collapsed={collapsed || undefined}
        data-animated={animated || undefined}
        data-mobile-open={mobileOpen || undefined}
        style={{ '--sidebar-width': collapsed ? RAIL_WIDTH : PANEL_WIDTH } as React.CSSProperties}
        className={cn(
          'group/sidebar flex flex-col text-sidebar-foreground',
          // Schublade unter `md`, ohne eigene Fläche — nur Navigation.
          'fixed inset-y-2 left-2 z-50 w-72 max-w-[85vw] -translate-x-[calc(100%+1rem)]',
          'transition-transform duration-300 ease-out-quint data-mobile-open:translate-x-0',
          'md:relative md:inset-auto md:z-auto md:my-2 md:ml-2 md:w-(--sidebar-width) md:max-w-none md:translate-x-0',
          animated ? 'md:transition-[width] md:duration-300 md:ease-out-quint' : 'md:transition-none',
          className,
        )}
        {...props}
      >
        {children}
      </nav>
    </>
  )
}

/** Alles rechts neben der Leiste. */
function SidebarInset({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-inset" className={cn('min-w-0 flex-1', className)} {...props} />
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn('sidebar-in flex shrink-0 flex-col gap-2 p-2 pt-3', className)}
      {...props}
    />
  )
}

function SidebarBody({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="sidebar-body" className={cn('min-h-0 flex-1', className)} {...props}>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-0.5 px-2 pb-2">{children}</div>
      </ScrollArea>
    </div>
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn('sidebar-in flex shrink-0 flex-col gap-1 p-2', className)}
      {...props}
    />
  )
}

/**
 * Ein- und Ausblenden der Beschriftungen beim Umschalten. Aufklappen: Erst
 * wächst die Leiste, kurz danach blenden die Texte ein und rücken 4 px nach.
 * Einklappen: Die Texte gehen sofort, bevor die Leiste schmal wird — sonst
 * würden sie sichtbar abgeschnitten. Nur nach einer Nutzeraktion
 * (`data-animated`), nicht beim Wiederherstellen nach dem Laden.
 */
const sidebarRevealClasses =
  'group-data-animated/sidebar:transition-[opacity,translate] group-data-animated/sidebar:duration-200 ' +
  'group-data-animated/sidebar:delay-75 group-data-animated/sidebar:ease-out-quint ' +
  'group-data-collapsed/sidebar:pointer-events-none group-data-collapsed/sidebar:-translate-x-1 group-data-collapsed/sidebar:opacity-0 ' +
  'group-data-animated/sidebar:group-data-collapsed/sidebar:delay-0 group-data-animated/sidebar:group-data-collapsed/sidebar:duration-100'

/**
 * Gruppe mit Überschrift. Eingeklappt wird die Überschrift unsichtbar, behält
 * aber ihre Höhe — sonst rutschen beim Umschalten alle Symbole nach oben.
 */
function SidebarGroup({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { label: string }) {
  const id = React.useId()
  return (
    <div
      role="group"
      aria-labelledby={id}
      data-slot="sidebar-group"
      className={cn('sidebar-in flex flex-col gap-0.5 pt-4 first:pt-1', className)}
      {...props}
    >
      <p
        id={id}
        className={cn('flex h-6 items-center px-2 text-[11px] font-medium tracking-wide whitespace-nowrap text-sidebar-foreground/45', sidebarRevealClasses)}
      >
        {label}
      </p>
      {children}
    </div>
  )
}

/**
 * Gemeinsame Grundform aller Zeilen — Verweise, Schalter, Menü-Auslöser.
 * Hover ist für alle Zeilen derselbe: eine neutrale, leicht hellere Fläche,
 * ohne Bewegung und ohne Blau. Blau trägt nur die aktive Seite — sonst sehen
 * „hier bin ich" und „hier ist der Zeiger" gleich aus.
 */
const sidebarRowClasses =
  'transition-ui relative ' +
  'flex h-8 w-full shrink-0 items-center gap-2.5 rounded-[10px] px-2 text-[13px] ' +
  'text-sidebar-foreground/70 outline-none ' +
  'hover:bg-foreground/[0.05] hover:text-sidebar-foreground ' +
  'focus-visible:ring-2 focus-visible:ring-sidebar-ring ' +
  '[&>svg]:size-4 [&>svg]:shrink-0'

/**
 * Aktive Zeile. Die Fläche dahinter gleitet als Linse von Zeile zu Zeile.
 */
const sidebarRowActiveClasses = 'z-10 font-medium text-sidebar-foreground hover:bg-transparent'

/** Federt leicht nach — wie im Dock. */
const LENS_SPRING = { type: 'spring', stiffness: 320, damping: 24 } as const

function SidebarLens() {
  return (
    <motion.span
      layoutId="sidebar-lens"
      aria-hidden
      transition={LENS_SPRING}
      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-sidebar-primary/[0.1] ring-1 ring-sidebar-primary/20 dark:bg-sidebar-primary/[0.12] dark:ring-sidebar-primary/25"
    />
  )
}

/** Beschriftung einer Zeile — eingeklappt ausgeblendet, aber im DOM. */
function SidebarLabel({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="sidebar-label"
      className={cn('flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap', sidebarRevealClasses, className)}
      {...props}
    />
  )
}

/** Zeigt eingeklappt den Namen als Tooltip; ausgeklappt steht er ja daneben. */
function SidebarTooltip({
  label,
  children,
}: {
  label: string
  children: React.ReactElement
}) {
  const { collapsed } = useSidebar()
  return (
    <Tooltip disabled={!collapsed}>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  badge,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Link>, 'href' | 'children'> & {
  href: string
  icon: LucideIcon
  label: string
  active?: boolean
  /** Zähler rechts in der Zeile, etwa die Zahl der Projekte. */
  badge?: React.ReactNode
}) {
  return (
    <SidebarTooltip label={label}>
      <Link
        href={href}
        data-slot="sidebar-link"
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(sidebarRowClasses, 'group/link isolate', active && sidebarRowActiveClasses, className)}
        {...props}
      >
        {active ? <SidebarLens /> : null}

        <Icon
          className={cn(
            'transition-ui relative z-[1]',
            active ? 'text-sidebar-primary' : 'text-sidebar-foreground/55 group-hover/link:text-sidebar-foreground/90',
          )}
          strokeWidth={1.75}
        />

        <SidebarLabel className="relative z-[1]">
          <span className="truncate">{label}</span>
          {badge !== undefined && badge !== null ? (
            // Kommt erst nach dem Laden des Workspace — blendet ein, statt aufzuploppen.
            <span className="ml-auto animate-in rounded-full bg-sidebar-primary/10 px-1.5 text-[11px] font-medium text-sidebar-primary tabular-nums duration-300 fade-in-0">
              {badge}
            </span>
          ) : null}
        </SidebarLabel>
      </Link>
    </SidebarTooltip>
  )
}

/** Knopf zum Ein-/Ausklappen (ab `md`) bzw. Schließen der Schublade. */
function SidebarTrigger({ className, ...props }: React.ComponentProps<'button'>) {
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebar()
  return (
    <button
      type="button"
      data-slot="sidebar-trigger"
      aria-label={
        mobileOpen ? 'Navigation schließen' : collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'
      }
      aria-expanded={mobileOpen || !collapsed}
      onClick={() => (mobileOpen ? setMobileOpen(false) : toggle())}
      className={cn(
        'transition-[color,background-color] duration-200 ease-out flex size-7 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55 outline-none',
        'hover:bg-foreground/[0.06] hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        className,
      )}
      {...props}
    >
      <PanelLeft className="size-4" />
    </button>
  )
}

export {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarHeader,
  SidebarBody,
  SidebarFooter,
  SidebarGroup,
  SidebarLabel,
  SidebarLink,
  SidebarTooltip,
  SidebarTrigger,
  useSidebar,
  sidebarRowClasses,
  sidebarRowActiveClasses,
  RAIL_WIDTH,
  PANEL_WIDTH,
}
