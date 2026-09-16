'use client'

import React, { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { AutomationMode, SocialAccount, SocialPlatform } from '@/types/database'
import { AccountCard, PLATFORM_LABEL } from '@/components/social/AccountCard'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Plattform-Einschränkungen, die den vollautomatischen Betrieb begrenzen.
 *
 * Diese Texte sind kein Kleingedrucktes — sie sind Produktinformation. Ein
 * Nutzer, der „Set it and forget it" kauft und dann feststellt, dass TikTok nur
 * Entwürfe erhält, fühlt sich getäuscht. Deshalb steht die Einschränkung
 * direkt an der Verbindung.
 */
const PLATFORM_LIMITS: Partial<Record<SocialPlatform, string>> = {
  tiktok:
    'TikTok erlaubt vollautomatisches Veröffentlichen erst nach bestandenem Content-Posting-Audit. Bis dahin landen Clips als Entwurf in deiner TikTok-Inbox — du tippst dort einmal auf „Posten".',
  youtube:
    'Bis zum abgeschlossenen Google-Compliance-Audit lädt die YouTube-API Videos ausschließlich als „privat" hoch. Zusätzlich sind 100 Uploads pro Tag über alle Nutzer hinweg das Limit.',
}

const initialAccounts: SocialAccount[] = [
  {
    id: 'sa-001',
    user_id: 'mock-user',
    platform: 'youtube',
    platform_account_id: 'UC_mock',
    platform_username: '@jadenbuilds',
    avatar_url: null,
    status: 'active',
    automation_mode: 'auto_publish',
    auto_publish_min_score: 80,
    meta_page_id: null,
    meta_ig_user_id: null,
    last_published_at: '2026-09-14T17:02:00.000Z',
    last_error: null,
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-09-14T17:02:00.000Z',
  },
  {
    id: 'sa-002',
    user_id: 'mock-user',
    platform: 'tiktok',
    platform_account_id: 'tt_mock',
    platform_username: '@jadenbuilds',
    avatar_url: null,
    status: 'active',
    // Hart auf review_queue, solange das Audit aussteht.
    automation_mode: 'review_queue',
    auto_publish_min_score: 80,
    meta_page_id: null,
    meta_ig_user_id: null,
    last_published_at: null,
    last_error: null,
    created_at: '2026-08-21T09:30:00.000Z',
    updated_at: '2026-08-21T09:30:00.000Z',
  },
]

export default function ConnectionsPage() {
  const [accounts, setAccounts] = useState(initialAccounts)

  const connected = new Set(accounts.map((account) => account.platform))
  const available = (['youtube', 'tiktok', 'instagram'] as SocialPlatform[]).filter(
    (platform) => !connected.has(platform),
  )

  function update(id: string, patch: Partial<SocialAccount>) {
    setAccounts((current) =>
      current.map((account) => (account.id === id ? { ...account, ...patch } : account)),
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Verbundene Kanäle</h1>
          <p className="text-sm text-muted-foreground">
            Lege pro Kanal fest, wie weit die Automatik gehen darf.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              blockedReason={PLATFORM_LIMITS[account.platform]}
              onAutomationChange={(mode: AutomationMode) => {
                update(account.id, { automation_mode: mode })
                toast.success(`${PLATFORM_LABEL[account.platform]} aktualisiert`)
              }}
              onMinScoreChange={(score) => update(account.id, { auto_publish_min_score: score })}
            />
          ))}
        </div>

        {available.length > 0 ? (
          <>
            <h2 className="mt-8 mb-3 text-sm font-medium">Weitere Kanäle verbinden</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {available.map((platform) => (
                  <Card key={platform}>
                    <CardContent className="flex flex-col items-center gap-3 py-6">
                      <PlatformIcon
                        platform={platform}
                        className="size-7 text-muted-foreground"
                      />
                      <p className="text-sm font-medium">{PLATFORM_LABEL[platform]}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() =>
                          toast.info('OAuth-Flow folgt mit Phase 2', {
                            description: `/api/oauth/${platform}/connect`,
                          })
                        }
                      >
                        <ExternalLink className="size-3.5" />
                        Verbinden
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </>
        ) : null}
      </div>
    </ScrollArea>
  )
}
