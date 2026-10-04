'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { SubscriptionTier } from '@/types/database'
import type { BillingInterval } from '@/lib/stripe/plans'

/** Wie `CreditBalance` in `services/billing/credits.ts`, als JSON. */
export interface BillingUsage {
  tier: SubscriptionTier
  planCredits: number
  packCredits: number
  available: number
  monthlyCredits: number
  nextGrantAt: string | null
  trialExportsLeft: number | null
  /** Gratis-Tarif: Die Vorschau zeigt das Wasserzeichen, das der Export bekommt. */
  watermark: boolean
  /** Laufzeit des aktiven Abos, null ohne Abo. */
  interval: BillingInterval | null
  /** Ob der Jahrestarif in Stripe eingerichtet und buchbar ist. */
  yearlyAvailable: boolean
}

const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function parseUsage(data: unknown): BillingUsage | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  if (!['free', 'starter', 'pro', 'agency'].includes(value.tier as string)) return null
  if (!isAmount(value.planCredits) || !isAmount(value.packCredits) || !isAmount(value.available) || !isAmount(value.monthlyCredits)) return null
  if (value.nextGrantAt !== null && typeof value.nextGrantAt !== 'string') return null
  if (value.trialExportsLeft !== null && !isAmount(value.trialExportsLeft)) return null
  return {
    tier: value.tier as SubscriptionTier,
    planCredits: value.planCredits,
    packCredits: value.packCredits,
    available: value.available,
    monthlyCredits: value.monthlyCredits,
    nextGrantAt: value.nextGrantAt as string | null,
    trialExportsLeft: value.trialExportsLeft as number | null,
    watermark: value.watermark === true,
    interval: value.interval === 'year' || value.interval === 'month' ? value.interval : null,
    yearlyAvailable: value.yearlyAvailable === true,
  }
}

/** Ob die Vorschau das Wasserzeichen zeigt — wie der Export dieses Kontos. */
export function usePreviewWatermark(): boolean {
  return useBillingUsage((state) => state.usage?.watermark ?? false)
}

interface BillingUsageState {
  usage: BillingUsage | null
  loading: boolean
  error: string | null
}

// Shared by the header and billing page; account balances are never persisted
// in the local workspace or replaced with example data.
export const useBillingUsage = create<BillingUsageState>(() => ({
  usage: null,
  loading: true,
  error: null,
}))

let pending: Promise<void> | null = null
let refreshAgain = false

export function refreshBillingUsage(afterChange = false): Promise<void> {
  if (pending) {
    // A request started before a completed job may contain the old balance.
    if (afterChange) refreshAgain = true
    return pending
  }

  useBillingUsage.setState({ loading: true })
  pending = Promise.resolve().then(async () => {
    try {
      const response = await fetch('/api/billing/usage', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Guthaben konnte nicht geladen werden.')
      }
      const usage = parseUsage(data)
      if (!usage) throw new Error('Guthaben konnte nicht geladen werden.')
      useBillingUsage.setState({ usage, error: null })
    } catch (error) {
      useBillingUsage.setState({
        usage: null,
        error: error instanceof Error && error.name === 'Error'
          ? error.message
          : 'Guthaben konnte nicht geladen werden. Bitte erneut versuchen.',
      })
    }
  }).finally(() => {
    pending = null
    useBillingUsage.setState({ loading: false })
    if (refreshAgain) {
      refreshAgain = false
      void refreshBillingUsage()
    }
  })
  return pending
}

/** Mounted once by the dashboard header, including while navigating pages. */
export function useBillingUsageSync() {
  useEffect(() => {
    void refreshBillingUsage()
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refreshBillingUsage()
    }
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const timer = window.setInterval(refreshVisible, 30_000)
    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      const completedProject = state.projects.some((project) => {
        if (project.status !== 'ready' && project.status !== 'error') return false
        const before = previous.projects.find((item) => item.id === project.id)
        return before && (before.status !== project.status || before.trigger_run_id !== project.trigger_run_id)
      })
      const changedRender = state.clips.some((clip) => {
        const before = previous.clips.find((item) => item.id === clip.id)
        return before && before.render_status !== clip.render_status
      })
      if (completedProject || changedRender) void refreshBillingUsage(true)
    })
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
      unsubscribe()
    }
  }, [])
}
