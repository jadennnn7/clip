'use client'

import { AnalyticsView } from '@/components/analytics/AnalyticsView'
import { useAnalytics } from '@/lib/analytics-client'

export default function AnalyticsPage() {
  return <AnalyticsView {...useAnalytics()} />
}
