import React from 'react'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface CreditMeterProps {
  used: number
  limit: number
}

/**
 * Verbleibende Render-Minuten.
 *
 * Bewusst prominent in der Kopfzeile: Rendering ist der teuerste Posten der
 * Plattform (Remotion Lambda ~$0,017 pro Minute Video plus Lizenz), also ist
 * das Kontingent die Größe, an der Nutzer ihr Abo bemessen.
 */
export function CreditMeter({ used, limit }: CreditMeterProps) {
  const remaining = Math.max(0, limit - used)
  const percentUsed = limit > 0 ? Math.min(100, (used / limit) * 100) : 0

  return (
    <Tooltip>
      {/* Base UI ersetzt `asChild` durch `render` — der Trigger rendert als div,
          damit hier kein verschachtelter Button entsteht. */}
      <TooltipTrigger render={<div />} className="hidden w-40 flex-col gap-1 sm:flex">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Render-Minuten</span>
          <span className="font-medium tabular-nums">{remaining.toFixed(0)}</span>
        </div>
        <Progress value={percentUsed} className="h-1.5" />
      </TooltipTrigger>
      <TooltipContent>
        {used.toFixed(1)} von {limit} Minuten verbraucht
      </TooltipContent>
    </Tooltip>
  )
}
