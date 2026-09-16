import React from 'react'
import Link from 'next/link'
import { Clapperboard } from 'lucide-react'
import { CreditMeter } from '@/components/dashboard/CreditMeter'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { mockUsage } from '@/lib/mock-data'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/theme-toggle'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Phase 2: Profil kommt aus Supabase (`createClient()` → profiles).
  // Die Guthabenwerte stammen aus derselben Quelle wie die Kennzahlen im
  // Dashboard — zwei Stellen, die dasselbe anzeigen sollen, laufen sonst
  // auseinander.
  const profile = {
    full_name: 'Jaden Tomic',
    email: 'tomicjaden@gmail.com',
    render_minutes_used: mockUsage.renderMinutesUsed,
    render_minutes_limit: mockUsage.renderMinutesLimit,
  }

  const initials = profile.full_name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          <Clapperboard className="size-5" />
          <span className="text-sm font-semibold tracking-tight">OmegaClip</span>
        </Link>

        <DashboardNav />

        <div className="ml-auto flex items-center gap-4">
          <CreditMeter
            used={profile.render_minutes_used}
            limit={profile.render_minutes_limit}
          />

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Nutzermenü"
            >
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground">{profile.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/dashboard/billing" />}>
                Abo verwalten
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/dashboard/connections" />}>
                Verbundene Kanäle
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Abmelden</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
