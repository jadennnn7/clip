import type { Instrumentation } from 'next'
import { sentryOptions } from '@/lib/sentry-options'

/**
 * Fehler-Monitoring auf dem Server (Route Handlers, Server Components, Proxy).
 *
 * Sentry lädt nur, wenn `NEXT_PUBLIC_SENTRY_DSN` gesetzt ist — ohne DSN
 * bleibt alles wie bisher, und es entsteht keine Laufzeit. Aufgezeichnet
 * werden nur Fehler (siehe `sentryOptions`).
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

export async function register() {
  if (!dsn) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.init(sentryOptions(dsn))
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!dsn) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
