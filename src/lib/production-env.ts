/**
 * Prüft die Umgebung für Produktion — ohne Netzwerk, ohne Next-Imports.
 *
 * Läuft an zwei Stellen: beim Laden von `trigger.config.ts` für einen
 * Deploy (ein Fehler bricht ihn ab) und in `npm run prod:check`. Der Grund
 * ist immer derselbe: Mit Tunnel-URL oder Platzhalter-Domain läuft alles an,
 * und erst Instagram, TikTok oder der Magic Link scheitern — beim Kunden.
 */

export type ProductionTarget = 'worker' | 'app'

export interface EnvIssue {
  level: 'error' | 'warning'
  variable: string
  message: string
}

type Env = Record<string, string | undefined>

/** Hosts, die von außen nicht (dauerhaft) erreichbar sind. */
const NON_PUBLIC_HOSTS: Array<[RegExp, string]> = [
  [/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/, 'zeigt auf den eigenen Rechner'],
  [/\.localhost$|\.test$|\.local$/, 'ist eine lokale Entwicklungs-Domain'],
  [/\.trycloudflare\.com$/, 'ist ein Cloudflare Quick Tunnel — die Adresse wechselt bei jedem Start'],
  [/\.ngrok(-free)?\.(app|io|dev)$|\.loca\.lt$/, 'ist ein Entwicklungs-Tunnel'],
  [/(^|\.)example\.(com|org|net)$/, 'ist ein Platzhalter'],
]

const REQUIRED: Record<ProductionTarget, string[]> = {
  worker: [
    'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL',
    'NEXT_PUBLIC_APP_URL', 'TOKEN_ENCRYPTION_KEY',
  ],
  app: [
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL',
    'NEXT_PUBLIC_APP_URL', 'TOKEN_ENCRYPTION_KEY', 'TRIGGER_SECRET_KEY',
  ],
}

const PROXY_PROTOCOLS = new Set(['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'])

export function checkProductionEnv(env: Env, targets: ProductionTarget[]): EnvIssue[] {
  const issues: EnvIssue[] = []
  const error = (variable: string, message: string) => { issues.push({ level: 'error', variable, message }) }
  const warning = (variable: string, message: string) => { issues.push({ level: 'warning', variable, message }) }
  const value = (name: string) => env[name]?.trim() || ''

  const required = new Set(targets.flatMap((target) => REQUIRED[target]))
  for (const name of required) if (!value(name)) error(name, 'fehlt')

  const publicUrl = (name: string, { originOnly }: { originOnly: boolean }): URL | null => {
    if (!value(name)) return null
    let url: URL
    try {
      url = new URL(value(name))
    } catch {
      error(name, 'ist keine gültige URL')
      return null
    }
    if (url.protocol !== 'https:') error(name, 'muss mit https:// beginnen')
    const host = url.hostname.toLowerCase()
    for (const [pattern, reason] of NON_PUBLIC_HOSTS) if (pattern.test(host)) error(name, `${host} ${reason}`)
    if (originOnly && url.pathname !== '/') error(name, 'darf nur die Domain enthalten, ohne Pfad')
    return url
  }

  publicUrl('NEXT_PUBLIC_APP_URL', { originOnly: true })
  const r2Public = publicUrl('R2_PUBLIC_BASE_URL', { originOnly: false })
  if (r2Public?.hostname.endsWith('.r2.dev')) {
    warning('R2_PUBLIC_BASE_URL', 'r2.dev ist von Cloudflare gedrosselt und nur zum Testen gedacht. Für Instagram und TikTok eine eigene Domain am Bucket verbinden.')
  }

  const encryption = value('TOKEN_ENCRYPTION_KEY')
  if (encryption) {
    const key = /^[a-f\d]{64}$/i.test(encryption) ? Buffer.from(encryption, 'hex') : Buffer.from(encryption, 'base64')
    if (key.length !== 32) error('TOKEN_ENCRYPTION_KEY', 'muss ein 32-Byte-Schlüssel in Hex oder Base64 sein')
  }

  if (targets.includes('app')) {
    const trigger = value('TRIGGER_SECRET_KEY')
    if (trigger.startsWith('tr_dev_')) {
      error('TRIGGER_SECRET_KEY', 'ist der Dev-Schlüssel — Runs landen in der Dev-Umgebung, die nur mit `trigger dev` abgearbeitet wird. Den Prod-Schlüssel (tr_prod_…) aus dem Trigger.dev-Dashboard nehmen.')
    }
    const stripe = value('STRIPE_SECRET_KEY')
    if (!stripe) warning('STRIPE_SECRET_KEY', 'fehlt — Abos und Credit-Pakete lassen sich nicht kaufen')
    else if (stripe.startsWith('sk_test_')) warning('STRIPE_SECRET_KEY', 'ist ein Test-Schlüssel — es wird kein echtes Geld abgebucht')
    if (stripe && !value('STRIPE_WEBHOOK_SECRET')) error('STRIPE_WEBHOOK_SECRET', 'fehlt — ohne Webhook werden bezahlte Abos nie freigeschaltet')
    if (!value('NEXT_PUBLIC_SENTRY_DSN')) warning('NEXT_PUBLIC_SENTRY_DSN', 'fehlt — Fehler bei Kunden landen nur im Server-Log, niemand wird benachrichtigt')
  }

  if (targets.includes('worker')) {
    if (!value('GEMINI_API_KEY') && !value('OPENAI_API_KEY') && !value('AI_FALLBACK_API_KEY')) {
      warning('GEMINI_API_KEY', 'fehlt (und weder OPENAI_API_KEY noch AI_FALLBACK_API_KEY) — Clips werden nur heuristisch ausgewählt')
    }
    if (!value('DEEPGRAM_API_KEY')) warning('DEEPGRAM_API_KEY', 'fehlt — ohne YouTube-Untertitel gibt es kein Transkript')
    issues.push(...checkYoutubeAccess(env))
  }

  return issues
}

/** Der Worker hat keinen Browser und nur die Dateien aus dem Image. */
function checkYoutubeAccess(env: Env): EnvIssue[] {
  const issues: EnvIssue[] = []
  const proxy = env.YTDLP_PROXY?.trim()
  const cookies = env.YTDLP_COOKIES_BASE64?.trim()

  if (env.YTDLP_COOKIES_FROM_BROWSER?.trim()) {
    issues.push({ level: 'error', variable: 'YTDLP_COOKIES_FROM_BROWSER', message: 'geht nur lokal — auf dem Worker gibt es keinen Browser. Stattdessen YTDLP_COOKIES_BASE64 setzen.' })
  }
  if (env.YTDLP_COOKIES?.trim()) {
    issues.push({ level: 'error', variable: 'YTDLP_COOKIES', message: 'ist ein Dateipfad, den es auf dem Worker nicht gibt. Stattdessen YTDLP_COOKIES_BASE64 setzen.' })
  }
  if (proxy) {
    let protocol = ''
    try { protocol = new URL(proxy).protocol } catch { /* bleibt leer */ }
    if (!PROXY_PROTOCOLS.has(protocol)) {
      issues.push({ level: 'error', variable: 'YTDLP_PROXY', message: 'muss eine Proxy-URL sein, z. B. http://nutzer:passwort@host:port oder socks5://…' })
    }
  }
  if (cookies) {
    const text = Buffer.from(cookies, 'base64').toString('utf8')
    const lines = text.split('\n').filter((line) => line.split('\t').length >= 7)
    if (!lines.length) {
      issues.push({ level: 'error', variable: 'YTDLP_COOKIES_BASE64', message: 'ist keine Base64-kodierte cookies.txt im Netscape-Format' })
    } else if (!lines.some((line) => /(^|\.)youtube\.com\t/.test(line))) {
      issues.push({ level: 'error', variable: 'YTDLP_COOKIES_BASE64', message: 'enthält keine youtube.com-Cookies' })
    }
  }
  if (!proxy && !cookies) {
    issues.push({
      level: 'warning',
      variable: 'YTDLP_PROXY',
      message: 'weder YTDLP_PROXY noch YTDLP_COOKIES_BASE64 gesetzt — YouTube sperrt Rechenzentrums-IPs meist als Bot. Nach dem Deploy mit dem Task `youtube-access-check` prüfen.',
    })
  }
  return issues
}

export function formatIssues(issues: EnvIssue[]): string {
  return issues.map((issue) => `  ${issue.level === 'error' ? '✗' : '!'} ${issue.variable} ${issue.message}`).join('\n')
}
