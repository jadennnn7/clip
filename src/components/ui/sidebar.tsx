'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeft, type LucideIcon } from 'lucide-react'
import { MotionConfig, motion } from 'motion/react'

import { cn } from '@/lib/utils'
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
const STORAGE_KEY = 'omegaclip-sidebar'
const DESKTOP_QUERY = '(min-width: 48rem)'

/* --- Gespeicherter Einklapp-Zustand ------------------------------------------
   Über `useSyncExternalStore` statt Effekt plus setState — siehe
   `use-stored-layout.ts`. Der Wert wird zusätzlich im Speicher gehalten: Ist
   localStorage blockiert, soll der Knopf trotzdem funktionieren, nur eben
   ohne Erinnerung über den Reload hinaus. */

const listeners = new Set<() => void>()
let collapsedValue: boolean | null = null

function readCollapsed(): boolean {
  if (collapsedValue !== null) return collapsedValue
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    // Ohne gespeicherten Wert: eingeklappt — mehr Platz für den Inhalt.
    collapsedValue = stored === null ? true : stored === 'collapsed'
  } catch {
    collapsedValue = true
  }
  return collapsedValue
}

function writeCollapsed(next: boolean) {
  collapsedValue = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded')
  } catch {
    // Privater Modus oder blockierter Speicher — gilt dann nur bis zum Reload.
  }
  listeners.forEach((listener) => listener())
}

function subscribeCollapsed(listener: () => void) {
  listeners.add(listener)
  // Ein zweiter Tab soll dieselbe Breite übernehmen, statt beim nächsten
  // Reload überraschend umzuspringen.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
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

function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const storedCollapsed = React.useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => true,
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
      {mobileOpen ? (
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[3px] animate-in fade-in-0 md:hidden"
        />
      ) : null}
      <nav
        data-slot="sidebar"
        data-collapsed={collapsed || undefined}
        data-mobile-open={mobileOpen || undefined}
        style={{ '--sidebar-width': collapsed ? RAIL_WIDTH : PANEL_WIDTH } as React.CSSProperties}
        className={cn(
          'group/sidebar flex flex-col text-sidebar-foreground',
          // Schublade unter `md`, ohne eigene Fläche — nur Navigation.
          'fixed inset-y-2 left-2 z-50 w-72 max-w-[85vw] -translate-x-[calc(100%+1rem)]',
          'transition-transform duration-300 ease-out-quint data-mobile-open:translate-x-0',
          'md:relative md:inset-auto md:z-auto md:my-2 md:ml-2 md:w-(--sidebar-width) md:max-w-none md:translate-x-0',
          animated ? 'md:transition-[width]' : 'md:transition-none',
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
      className={cn('flex shrink-0 flex-col gap-2 p-2 pt-3', className)}
      {...props}
    />
  )
}

/**
 * Welche Zeile gerade überfahren wird — für die ganze Navigation, nicht je
 * Zeile. So wechselt die Hover-Linse beim Weiterfahren in einem Zug zur
 * nächsten Zeile und gleitet hinüber, statt erst zu verschwinden und neu
 * aufzutauchen. Erst wer die Navigation verlässt, löscht sie.
 */
const SidebarHoverContext = React.createContext<{
  hovered: string | null
  setHovered: (href: string | null) => void
} | null>(null)

function SidebarBody({ className, children, ...props }: React.ComponentProps<'div'>) {
  const [hovered, setHovered] = React.useState<string | null>(null)
  const hover = React.useMemo(() => ({ hovered, setHovered }), [hovered])
  return (
    <div data-slot="sidebar-body" className={cn('min-h-0 flex-1', className)} {...props}>
      <ScrollArea className="h-full">
        <SidebarHoverContext.Provider value={hover}>
          <div className="flex flex-col gap-0.5 px-2 pb-2" onMouseLeave={() => setHovered(null)}>
            {children}
          </div>
        </SidebarHoverContext.Provider>
      </ScrollArea>
    </div>
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn('flex shrink-0 flex-col gap-1 p-2', className)}
      {...props}
    />
  )
}

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
      className={cn('flex flex-col gap-0.5 pt-4 first:pt-1', className)}
      {...props}
    >
      <p
        id={id}
        className="flex h-6 items-center px-2 text-[11px] font-medium tracking-wide whitespace-nowrap text-sidebar-foreground/45 transition-opacity group-data-collapsed/sidebar:opacity-0"
      >
        {label}
      </p>
      {children}
    </div>
  )
}

/**
 * Gemeinsame Grundform aller Zeilen — Verweise, Schalter, Menü-Auslöser.
 * Nav-Links ergänzen den Dock-Hover (gleitende Linse + federndes Icon) in
 * `SidebarLink`.
 */
const sidebarRowClasses =
  'relative transition-colors duration-200 ease-out ' +
  'flex h-8 w-full shrink-0 items-center gap-2.5 rounded-[10px] px-2 text-[13px] ' +
  'text-sidebar-foreground/70 outline-none ' +
  'hover:bg-foreground/[0.05] hover:text-sidebar-foreground ' +
  'focus-visible:ring-2 focus-visible:ring-sidebar-ring ' +
  '[&>svg]:size-4 [&>svg]:shrink-0'

/**
 * Aktive Zeile. Die Fläche dahinter gleitet als Linse von Zeile zu Zeile.
 */
const sidebarRowActiveClasses = 'font-medium text-sidebar-foreground hover:bg-transparent'

/** Federt leicht nach — wie im Dock. */
const LENS_SPRING = { type: 'spring', stiffness: 320, damping: 24 } as const
const DOCK_SPRING = { type: 'spring', stiffness: 300, damping: 20 } as const

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
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap transition-opacity',
        'group-data-collapsed/sidebar:pointer-events-none group-data-collapsed/sidebar:opacity-0',
        className,
      )}
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
  const shared = React.useContext(SidebarHoverContext)
  const [ownHover, setOwnHover] = React.useState(false)
  const hovered = shared ? shared.hovered === href : ownHover
  const setHovered = (next: boolean) => {
    if (shared) {
      if (next) shared.setHovered(href)
      else if (shared.hovered === href) shared.setHovered(null)
    } else setOwnHover(next)
  }

  return (
    <SidebarTooltip label={label}>
      <Link
        href={href}
        data-slot="sidebar-link"
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        onMouseEnter={() => setHovered(true)}
        // Mit gemeinsamem Zustand löscht erst das Verlassen der Navigation.
        onMouseLeave={shared ? undefined : () => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        // Den Hover-Grund liefert die Linse, nicht die Zeile selbst.
        className={cn(sidebarRowClasses, 'relative hover:bg-transparent', active && sidebarRowActiveClasses, className)}
        {...props}
      >
        {active ? <SidebarLens /> : null}

        {/* Dock-Hover, Teil 1: eine Linse über die ganze Zeile. Sie gleitet
            per `layoutId` federnd von Zeile zu Zeile — und füllt genau die
            Zeile, steht also nirgends über. Auf der aktiven Zeile liegt
            schon deren Linse, dort bleibt sie weg. */}
        {hovered && !active ? (
          <motion.span
            layoutId="sidebar-hover-lens"
            aria-hidden
            transition={DOCK_SPRING}
            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-foreground/[0.055] shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] ring-1 ring-sidebar-primary/15 dark:ring-sidebar-primary/20"
          />
        ) : null}

        {/* Teil 2: Das Icon federt hoch und nimmt das Blau an. */}
        <motion.span
          className="relative z-[1] flex size-4 shrink-0 items-center justify-center"
          animate={{
            scale: hovered ? 1.15 : 1,
            rotate: hovered ? -5 : 0,
          }}
          transition={DOCK_SPRING}
        >
          <Icon
            className={cn(
              'size-4 transition-colors duration-200',
              active || hovered ? 'text-sidebar-primary' : 'text-sidebar-foreground/55',
            )}
            strokeWidth={1.75}
          />
        </motion.span>

        <SidebarLabel className="relative z-[1]">
          <span className="truncate">{label}</span>
          {badge !== undefined && badge !== null ? (
            <span className="ml-auto rounded-full bg-sidebar-primary/10 px-1.5 text-[11px] font-medium text-sidebar-primary tabular-nums">
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
