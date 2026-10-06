import React from 'react'
import { cookies } from 'next/headers'
import { AppSidebar } from '@/components/dashboard/AppSidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { SupportWidget } from '@/components/support/SupportWidget'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { WorkspaceOwner } from '@/components/workspace/WorkspaceProvider'
import { getAccount } from '@/lib/account'
import { SIDEBAR_STATE_KEY, isSidebarCollapsed } from '@/lib/sidebar-state'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [account, cookieStore] = await Promise.all([getAccount(), cookies()])
  return (
    <SidebarProvider defaultCollapsed={isSidebarCollapsed(cookieStore.get(SIDEBAR_STATE_KEY)?.value)}>
      <WorkspaceOwner userId={account?.id ?? null} />
      {/* Schwebendes Layout: Unten liegt nur Licht (`ambient`), darauf die
          Glasflächen — Sidebar und Kopfleiste. Der Inhalt ist keine eigene
          Fläche mehr, er liegt direkt auf dem Grund und scrollt unter der
          Kopfleiste durch. Erst dadurch hat das Glas etwas, das es bricht. */}
      <div
        className="ambient flex h-dvh overflow-hidden"
        style={{ '--app-top': '4.25rem' } as React.CSSProperties}
      >
        <AppSidebar account={account} />

        <SidebarInset className="relative flex min-h-0 flex-col">
          {/* Die Meldungen leitet die Kopfleiste selbst aus dem Workspace ab. */}
          <TopBar />

          <main data-slot="app-main" className="min-h-0 flex-1 overflow-hidden">
            {children}
          </main>
        </SidebarInset>
      </div>
      {/* Auf jeder Seite der App dieselbe Hilfe — ein Gespräch, das beim Seitenwechsel weiterläuft. */}
      <SupportWidget firstName={account?.fullName?.split(/\s+/)[0]} email={account?.email || null} />

    </SidebarProvider>
  )
}
