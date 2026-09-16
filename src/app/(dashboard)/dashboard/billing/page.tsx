import React from 'react'
import { Check } from 'lucide-react'
import { PLANS } from '@/lib/stripe/plans'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { cn } from '@/lib/utils'

export default function BillingPage() {
  // Phase 2: aus `profiles` (Stripe-Webhook hält Stufe und Limits aktuell).
  const current = { tier: 'starter' as const, used: 38.4, limit: 120 }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Abo & Verbrauch"
          description="Abgerechnet wird nach Render-Minuten und verbundenen Kanälen — das sind die beiden Größen, die tatsächlich Kosten verursachen."
        />

        <Card className="mb-8 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base">Aktueller Verbrauch</CardTitle>
            <CardDescription>
              {current.used.toFixed(1)} von {current.limit} Render-Minuten in diesem Zeitraum
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={(current.used / current.limit) * 100} className="h-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              Minuten werden beim Start eines Renders reserviert und bei einem Fehlschlag
              automatisch zurückgebucht.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === current.tier
            return (
              <Card
                key={plan.tier}
                className={cn(
                  'transition-ui shadow-xs hover:shadow-sm',
                  isCurrent && 'border-primary/60 shadow-sm',
                )}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {isCurrent ? <Badge variant="secondary">Aktuell</Badge> : null}
                  </div>
                  <CardDescription>
                    <span className="text-3xl font-semibold tracking-tight text-foreground">
                      {plan.priceMonthly} €
                    </span>
                    <span className="text-xs"> / Monat</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ul className="flex flex-col gap-1.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs">
                        <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={isCurrent ? 'outline' : 'default'}
                    size="sm"
                    className="w-full"
                    disabled={isCurrent}
                  >
                    {isCurrent ? 'Aktiver Plan' : 'Wechseln'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}
