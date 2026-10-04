/**
 * Prüft `.env.production` vor dem ersten Produktions-Deploy.
 *
 *   npm run prod:check                 # .env.production
 *   npm run prod:check -- .env.staging # andere Datei
 *
 * Offline: dieselben Regeln, die `trigger.config.ts` vor jedem Deploy
 * anwendet. Online: ein Probe-Objekt über die öffentliche R2-Domain
 * zurücklesen (genau das tun Instagram und TikTok), die App-URL aufrufen und —
 * mit SUPABASE_ACCESS_TOKEN — SMTP und Redirect-URLs von Supabase Auth lesen.
 * Gibt nie Werte aus, nur Variablennamen.
 */
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { checkProductionEnv, formatIssues, type EnvIssue } from '../src/lib/production-env'
import { legalPlaceholders } from '../src/lib/legal'

const file = process.argv[2] ?? '.env.production'
if (!existsSync(file)) {
  console.error(`${file} fehlt. Vorlage: .env.example, Anleitung: docs/production-setup.md`)
  process.exit(1)
}
const env = parseEnv(readFileSync(file, 'utf8')) as Record<string, string | undefined>
const value = (name: string) => env[name]?.trim() || ''

const issues: EnvIssue[] = checkProductionEnv(env, ['app', 'worker'])
const hasError = (variable: string) => issues.some((issue) => issue.level === 'error' && issue.variable === variable)
const report = (level: EnvIssue['level'], variable: string, message: string) => { issues.push({ level, variable, message }) }

// Kein Env-Wert, aber genauso Pflicht vor dem Livegang: Ohne echte Angaben
// sind Impressum und Datenschutzerklärung unvollständig.
for (const field of legalPlaceholders()) {
  report('error', `OPERATOR.${field}`, 'in src/lib/legal.ts ist noch ein Platzhalter — Impressum und Datenschutzerklärung brauchen echte Angaben')
}

async function checkR2PublicUrl(): Promise<void> {
  const base = value('R2_PUBLIC_BASE_URL').replace(/\/$/, '')
  if (!base || !value('R2_ACCESS_KEY_ID') || hasError('R2_PUBLIC_BASE_URL')) return
  const client = new S3Client({
    region: 'auto',
    endpoint: value('R2_ENDPOINT') || `https://${value('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: value('R2_ACCESS_KEY_ID'), secretAccessKey: value('R2_SECRET_ACCESS_KEY') },
  })
  const Bucket = value('R2_BUCKET')
  const Key = `healthchecks/public-url-${randomUUID()}.txt`
  const body = `omegaclip ${Key}`
  try {
    await client.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType: 'text/plain' }))
  } catch (error) {
    return report('error', 'R2_ACCESS_KEY_ID', `Probe-Upload nach „${Bucket}“ fehlgeschlagen (${(error as Error).name}) — Token braucht Lese- und Schreibrechte`)
  }
  try {
    const response = await fetch(`${base}/${Key}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null)
    if (!response) report('error', 'R2_PUBLIC_BASE_URL', 'ist nicht erreichbar (DNS oder TLS) — ist die Domain am Bucket verbunden?')
    else if (!response.ok) report('error', 'R2_PUBLIC_BASE_URL', `liefert HTTP ${response.status} für ein frisch hochgeladenes Objekt — Domain gehört nicht zu Bucket „${Bucket}“ oder ist nicht öffentlich`)
    else if ((await response.text()) !== body) report('error', 'R2_PUBLIC_BASE_URL', 'liefert einen anderen Inhalt — die Domain zeigt auf einen anderen Bucket')
    else console.log('✓ R2: öffentliche Domain liefert hochgeladene Objekte aus')
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => {})
  }
}

async function checkAppUrl(): Promise<void> {
  const origin = value('NEXT_PUBLIC_APP_URL')
  if (!origin || hasError('NEXT_PUBLIC_APP_URL')) return
  const response = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!response) report('warning', 'NEXT_PUBLIC_APP_URL', 'ist noch nicht erreichbar — vor dem Go-live Hosting und Domain einrichten')
  else console.log(`✓ App: ${origin} antwortet (HTTP ${response.status})`)
}

/** Nur mit persönlichem Supabase-Token (supabase.com/dashboard/account/tokens) — liest, ändert nichts. */
async function checkSupabaseAuth(): Promise<void> {
  const token = value('SUPABASE_ACCESS_TOKEN') || process.env.SUPABASE_ACCESS_TOKEN?.trim()
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(value('NEXT_PUBLIC_SUPABASE_URL'))?.[1]
  if (!token || !ref) {
    console.log('· Supabase Auth: ohne SUPABASE_ACCESS_TOKEN nicht prüfbar — SMTP und URLs im Dashboard kontrollieren (docs/production-setup.md, Schritt 5)')
    return
  }
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null)
  if (!response?.ok) return report('warning', 'SUPABASE_ACCESS_TOKEN', `Supabase-Management-API antwortet nicht (HTTP ${response?.status ?? '—'})`)
  const auth = (await response.json()) as { smtp_host?: string | null; site_url?: string | null; uri_allow_list?: string | null; rate_limit_email_sent?: number | null; mailer_templates_magic_link_content?: string | null }
  const origin = value('NEXT_PUBLIC_APP_URL').replace(/\/$/, '')
  if (!auth.smtp_host) report('error', 'Supabase SMTP', 'nicht eingerichtet — der eingebaute Versand schafft nur wenige Magic Links pro Stunde (npm run auth:mail)')
  else console.log(`✓ Supabase SMTP: ${auth.smtp_host}${auth.rate_limit_email_sent ? `, Limit ${auth.rate_limit_email_sent} Mails/h` : ''}`)
  if (auth.smtp_host && !auth.mailer_templates_magic_link_content?.includes('token_hash')) {
    report('warning', 'Supabase Mail-Vorlage', 'ist noch die englische Standardvorlage — npm run auth:mail -- --apply')
  }
  if (origin && auth.site_url?.replace(/\/$/, '') !== origin) report('error', 'Supabase Site URL', `ist ${auth.site_url || 'leer'}, erwartet ${origin}`)
  const allowed = (auth.uri_allow_list ?? '').split(',').map((entry) => entry.trim())
  const callback = `${origin}/auth/callback`
  const matches = allowed.some((entry) => entry === callback || (entry.endsWith('/**') && callback.startsWith(entry.slice(0, -2))))
  if (origin && !matches) report('error', 'Supabase Redirect URLs', `${callback} fehlt — Magic Links landen sonst auf der Site URL ohne Anmeldung`)
}

async function main(): Promise<void> {
  await Promise.all([checkR2PublicUrl(), checkAppUrl(), checkSupabaseAuth()])

  const origin = value('NEXT_PUBLIC_APP_URL').replace(/\/$/, '')
  if (origin && !hasError('NEXT_PUBLIC_APP_URL')) printRedirects(origin)

  const errors = issues.filter((issue) => issue.level === 'error')
  console.log(issues.length ? `\n${file}:\n${formatIssues(issues)}` : `\n✓ ${file}: keine Probleme gefunden`)
  console.log(`\n${errors.length} Fehler, ${issues.length - errors.length} Warnungen`)
  process.exitCode = errors.length ? 1 : 0
}

function printRedirects(origin: string): void {
  const platforms = [
    ['YouTube (Google Cloud → OAuth-Client → Autorisierte Weiterleitungs-URIs)', 'youtube', 'GOOGLE_CLIENT_ID'],
    ['Instagram (Meta → Facebook Login → Gültige OAuth-Redirect-URIs)', 'instagram', 'META_APP_ID'],
    ['TikTok (Developer Portal → Login Kit → Redirect URI)', 'tiktok', 'TIKTOK_CLIENT_KEY'],
  ] as const
  console.log('\nOAuth-Redirects, die in den Entwicklerkonsolen eingetragen sein müssen:')
  for (const [label, platform, key] of platforms) {
    if (value(key)) console.log(`  ${label}\n    ${origin}/api/oauth/${platform}/callback`)
  }
  console.log(`  Supabase (Authentication → URL Configuration → Redirect URLs)\n    ${origin}/auth/callback`)
}

void main()
