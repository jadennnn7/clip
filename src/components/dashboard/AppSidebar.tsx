'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  ChevronsUpDown,
  CreditCard,
  Link2,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Search,
  Sun,
  UserRound,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarLabel,
  SidebarLink,
  SidebarTooltip,
  SidebarTrigger,
  sidebarRowClasses,
} from '@/components/ui/sidebar'
import { CommandMenu } from '@/components/dashboard/CommandMenu'
import { NAV_GROUPS, NAV_ITEMS, isNavActive } from '@/components/dashboard/nav-items'
import { useStartNewProject } from '@/components/dashboard/new-project'
import { signOut } from '@/lib/auth-client'
import { OPEN_STATUSES, usePublishingQueue } from '@/stores/publishing-queue-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { Account } from '@/lib/account'

interface AppSidebarProps {
  /** `null` im Demo-Modus ohne Anmeldung. */
  account: Account | null
}

/** Name, Zweitzeile und Initialen — ohne Namen trägt die E-Mail-Adresse. */
function identity(account: Account | null) {
  if (!account) return { name: 'Demo-Modus', detail: 'Ohne Anmeldung', initials: 'D' }
  const name = account.fullName ?? (account.email.split('@')[0] || 'Dein Konto')
  const words = (account.fullName ?? account.email).split(/[\s@._-]+/).filter(Boolean)
  const initials = (account.fullName ? words.slice(0, 2).map((word) => word[0]) : [words[0]?.[0]]).join('').toUpperCase()
  return { name, detail: account.email, initials: initials || '?' }
}

/**
 * Hauptnavigation von OmegaClip.
 *
 * Von oben nach unten in der Reihenfolge, in der man sie braucht: wo bin ich
 * (Workspace), wohin will ich (Suche, neues Projekt), was gibt es (Gruppen),
 * wer bin ich (Konto). Das Guthaben steht weiterhin nur in der Kopfleiste —
 * zwei Anzeigen derselben Zahl auf einem Bildschirm sind eine zu viel.
 */
export function AppSidebar({ account }: AppSidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const startNewProject = useStartNewProject()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { name, detail, initials } = identity(account)

  const handleSignOut = () => {
    if (signingOut) return
    setSigningOut(true)
    // Bei Erfolg lädt die Anmeldeseite neu; zurück kommt man nur bei einem Fehler.
    signOut().catch((cause) => {
      setSigningOut(false)
      toast.error('Abmelden fehlgeschlagen', { description: cause instanceof Error ? cause.message : undefined })
    })
  }

  const hydrated = useWorkspaceStore((state) => state.hydrated)
  // Die Bibliothek listet Videos, ihre Clips liegen eine Ebene tiefer.
  const videoCount = useWorkspaceStore((state) => state.projects.length)
  const plannedCount = usePublishingQueue(
    (state) => state.jobs?.filter((job) => OPEN_STATUSES.includes(job.status)).length ?? 0,
  )

  // Zähler erst nach dem Laden des lokalen Workspace: Vorher stünden dort die
  // Beispielzahlen und sprängen einen Augenblick später um.
  const badges: Record<string, number | undefined> = hydrated
    ? { '/dashboard/clips': videoCount || undefined, '/dashboard/calendar': plannedCount || undefined }
    : {}

  return (
    <Sidebar aria-label="Hauptnavigation">
      <SidebarHeader>
        {/* Eingeklappt liegt der Ausklappknopf über dem Logo und erscheint
            beim Überfahren — so bleibt die Marke sichtbar, und der Knopf ist
            trotzdem dort, wo die Hand ihn sucht. */}
        <div className="group/brand relative flex h-9 items-center gap-1 pl-0.5">
          <Link
            href="/dashboard"
            className="flex min-w-0 flex-1 items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <span className="relative size-7 shrink-0 overflow-hidden group-data-collapsed/sidebar:group-hover/brand:opacity-0">
              <Image
                src="/Logo.png"
                alt=""
                width={28}
                height={28}
                className="size-7 scale-[1.45] object-contain"
              />
            </span>
            <SidebarLabel className="leading-tight">
              <span className="font-display text-[17px] font-semibold tracking-tight">Clyp</span>
            </SidebarLabel>
          </Link>
          <SidebarTrigger className="group-data-collapsed/sidebar:absolute group-data-collapsed/sidebar:left-0.5 group-data-collapsed/sidebar:opacity-0 group-data-collapsed/sidebar:group-hover/brand:opacity-100 group-data-collapsed/sidebar:focus-visible:opacity-100" />
        </div>

        <SidebarTooltip label="Suchen (⌘K)">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              sidebarRowClasses,
              'glass-field mt-1 text-sidebar-foreground/50 hover:text-sidebar-foreground/70',
            )}
          >
            <Search />
            <SidebarLabel>
              <span>Suchen …</span>
              <kbd className="ml-auto rounded-md bg-foreground/[0.06] px-1.5 py-px font-sans text-[10px] text-sidebar-foreground/50">
                ⌘K
              </kbd>
            </SidebarLabel>
          </button>
        </SidebarTooltip>

        <SidebarTooltip label="Neues Projekt">
          <button
            type="button"
            onClick={startNewProject}
            // Eine Zeile wie die Navigation, nicht der dritte weiße Knopf auf
            // dem Bildschirm: Auf der Übersicht steht das Eingabefeld ohnehin
            // daneben. Der gefüllte Kreis hält sie trotzdem auffindbar.
            className={cn(sidebarRowClasses, 'font-medium text-sidebar-foreground')}
          >
            <span className="liquid flex size-4 shrink-0 items-center justify-center rounded-full">
              <Plus className="size-3" strokeWidth={2.5} />
            </span>
            <SidebarLabel>Neues Projekt</SidebarLabel>
          </button>
        </SidebarTooltip>
      </SidebarHeader>

      <SidebarBody>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group} label={group}>
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                badge={badges[item.href]}
                active={isNavActive(item, pathname)}
              />
            ))}
          </SidebarGroup>
        ))}
      </SidebarBody>

      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              sidebarRowClasses,
              'h-11 gap-2.5 px-0.5 aria-expanded:bg-foreground/[0.05] dark:aria-expanded:bg-white/[0.06]',
            )}
            aria-label="Nutzermenü"
          >
            <Avatar size="sm" className="size-7 shrink-0">
              {account?.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-foreground/[0.07] text-[0.65rem] font-medium ring-1 ring-foreground/10 ring-inset">
                {initials}
              </AvatarFallback>
            </Avatar>
            <SidebarLabel className="gap-2">
              <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                <span className="w-full truncate text-left text-[13px] font-medium text-sidebar-foreground">
                  {name}
                </span>
                <span className="w-full truncate text-left text-[11px] text-sidebar-foreground/50">
                  {detail}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/40" />
            </SidebarLabel>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium text-foreground">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{detail}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Farbschema</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={(value) => setTheme(value)}>
                <DropdownMenuRadioItem value="light">
                  <Sun />
                  Hell
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon />
                  Dunkel
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor />
                  System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard/account" />}>
              <UserRound />
              Konto & Daten
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/billing" />}>
              <CreditCard />
              Abo verwalten
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/connections" />}>
              <Link2 />
              Verbundene Kanäle
            </DropdownMenuItem>
            {/* Im Demo-Modus gibt es kein Konto, von dem man sich abmelden könnte. */}
            {account ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
                  <LogOut />
                  {signingOut ? 'Wird abgemeldet …' : 'Abmelden'}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} />
    </Sidebar>
  )
}
