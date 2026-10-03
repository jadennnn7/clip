/**
 * Meldet einen abgefangenen Fehler an Sentry — aus Error Boundaries, die ihn
 * sonst still schlucken. Ohne `NEXT_PUBLIC_SENTRY_DSN` passiert nichts.
 */
export function reportError(error: unknown): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  void import('@sentry/nextjs').then((Sentry) => { Sentry.captureException(error) }).catch(() => {})
}
