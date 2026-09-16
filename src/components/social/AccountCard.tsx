'use client'

import React from 'react'
import { CircleCheck, TriangleAlert, Clock, Zap, Hand } from 'lucide-react'
import type { AutomationMode, SocialAccount, SocialPlatform } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { singleValue } from '@/lib/slider-value'
import { PlatformIcon } from './PlatformIcon'

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  youtube: 'YouTube Shorts',
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
}

/** Label je Modus — der Select zeigt sonst den rohen Enum-Wert an. */
export const AUTOMATION_LABEL: Record<AutomationMode, string> = {
  auto_publish: 'Vollautomatisch',
  review_queue: 'Freigabe-Queue',
  manual: 'Nur rendern',
}

const AUTOMATION_OPTIONS: Array<{
  value: AutomationMode
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    value: 'auto_publish',
    icon: Zap,
    description: 'Clips werden ohne Rückfrage veröffentlicht.',
  },
  {
    value: 'review_queue',
    icon: Clock,
    description: 'Clips werden eingeplant und warten auf deine Freigabe.',
  },
  {
    value: 'manual',
    icon: Hand,
    description: 'Kein automatisches Einplanen.',
  },
]

interface AccountCardProps {
  account: SocialAccount
  /**
   * Plattform-Einschränkung, die Vollautomatik verhindert. Ist sie gesetzt,
   * wird `auto_publish` gesperrt und der Grund offen genannt — Nutzer sollen
   * nicht rätseln, warum ihr TikTok-Konto nicht automatisch postet.
   */
  blockedReason?: string
  onAutomationChange: (mode: AutomationMode) => void
  onMinScoreChange: (score: number) => void
}

export function AccountCard({
  account,
  blockedReason,
  onAutomationChange,
  onMinScoreChange,
}: AccountCardProps) {
  const isHealthy = account.status === 'active'

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <Avatar className="size-10">
          {account.avatar_url ? <AvatarImage src={account.avatar_url} alt="" /> : null}
          <AvatarFallback>
            <PlatformIcon platform={account.platform} className="size-5" />
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {account.platform_username ?? PLATFORM_LABEL[account.platform]}
          </p>
          <p className="text-xs text-muted-foreground">{PLATFORM_LABEL[account.platform]}</p>
        </div>

        <Badge
          variant="secondary"
          className={cn(
            'gap-1 border-0',
            isHealthy
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/15 text-destructive',
          )}
        >
          {isHealthy ? <CircleCheck className="size-3" /> : <TriangleAlert className="size-3" />}
          {isHealthy ? 'Verbunden' : 'Neu verbinden'}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {blockedReason ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs leading-relaxed">{blockedReason}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Automatisierung</Label>
          <Select
            value={account.automation_mode}
            onValueChange={(value) => onAutomationChange(value as AutomationMode)}
          >
            <SelectTrigger className="w-full">
              {/* Base UI rendert ohne Render-Funktion den rohen Wert
                  ("review_queue") statt des Labels. */}
              <SelectValue>
                {(value) => AUTOMATION_LABEL[value as AutomationMode]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AUTOMATION_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.value === 'auto_publish' && Boolean(blockedReason)}
                >
                  <span className="flex items-center gap-2">
                    <option.icon className="size-3.5" />
                    {AUTOMATION_LABEL[option.value]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {AUTOMATION_OPTIONS.find((o) => o.value === account.automation_mode)?.description}
          </p>
        </div>

        {account.automation_mode === 'auto_publish' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Mindest-Score</Label>
              <span className="font-mono text-xs tabular-nums">
                {account.auto_publish_min_score}
              </span>
            </div>
            <Slider
              value={[account.auto_publish_min_score]}
              min={0}
              max={100}
              step={5}
              onValueChange={(value) => onMinScoreChange(singleValue(value))}
            />
            <p className="text-xs text-muted-foreground">
              Nur Clips mit einem Viralitäts-Score ab {account.auto_publish_min_score} werden
              automatisch veröffentlicht.
            </p>
          </div>
        ) : null}

        <Button variant="outline" size="sm" className="w-full">
          Verbindung trennen
        </Button>
      </CardContent>
    </Card>
  )
}
