/**
 * Fehler-Monitoring im Browser. Wie auf dem Server lädt Sentry nur mit
 * `NEXT_PUBLIC_SENTRY_DSN` — ohne DSN kommt das SDK gar nicht erst ins Bundle
 * des ersten Seitenaufrufs.
 */

import { sentryOptions } from '@/lib/sentry-options'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init(sentryOptions(dsn))
  }).catch(() => {
    // Monitoring darf die App nie aufhalten.
  })
}
