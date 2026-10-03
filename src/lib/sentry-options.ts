/**
 * Was Sentry mitschicken darf: nur der Fehler selbst mit Stacktrace.
 *
 * Seit SDK 11 sammelt Sentry standardmäßig Cookies, Header, Request-Bodies,
 * Nutzerdaten und lokale Variablen — bei Clyp wären das Session-Cookies,
 * OAuth-Tokens und Transkripte. Alles davon bleibt aus, ebenso
 * Performance-Traces.
 */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
    },
  }
}
