/**
 * Richtet den Versand der Anmelde-Mails ein: Resend als SMTP-Server für
 * Supabase Auth, die deutschen Vorlagen aus `supabase/templates/` und ein
 * Limit pro Stunde.
 *
 *   npm run auth:mail              # zeigt nur, was sich ändern würde
 *   npm run auth:mail -- --apply   # legt die Domain bei Resend an, stellt Supabase um
 *
 * Liest `.env.production`: RESEND_API_KEY (Resend → API Keys, „Full access“),
 * MAIL_FROM (Absender, z. B. login@deine-domain.de), SUPABASE_ACCESS_TOKEN und
 * NEXT_PUBLIC_SUPABASE_URL. Supabase wird erst umgestellt, wenn Resend die
 * Absender-Domain bestätigt hat — vorher scheiterte jeder Magic Link.
 *
 * Dev und Produktion teilen sich ein Supabase-Projekt. Die Vorlagen bauen den
 * Link deshalb aus der Adresse, von der er angefordert wurde (`RedirectTo`),
 * nicht aus der Site URL. Das Logo in den Mails schneidet das Skript bei jedem
 * Lauf aus `public/Logo.png` zu und legt es öffentlich in Supabase Storage
 * (Bucket `brand`) — Mails brauchen eine feste Bild-Adresse, und eine eigene
 * Domain gibt es noch nicht. Gibt nie Schlüssel aus.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import sharp from 'sharp'

const apply = process.argv.includes('--apply')
const file = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? '.env.production'
if (!existsSync(file)) {
  console.error(`${file} fehlt. Vorlage: .env.example, Anleitung: docs/production-setup.md`)
  process.exit(1)
}
const env = parseEnv(readFileSync(file, 'utf8')) as Record<string, string | undefined>
const value = (name: string) => env[name]?.trim() || process.env[name]?.trim() || ''

const SMTP = { smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend' }

/** Deckt sich mit „Der Link gilt eine Stunde“ in den Vorlagen. */
const LINK_LIFETIME_SECONDS = 3600

/** `%%LOGO_URL%%` in den Vorlagen wird durch die Adresse des Mail-Logos ersetzt. */
function templates(logoUrl: string) {
  const read = (name: string) => readFileSync(`supabase/templates/${name}.html`, 'utf8').replaceAll('%%LOGO_URL%%', logoUrl)
  return {
    mailer_subjects_magic_link: 'Dein Anmeldelink für Ocuris',
    mailer_templates_magic_link_content: read('magic-link'),
    mailer_subjects_confirmation: 'Bestätige deine E-Mail für Ocuris',
    mailer_templates_confirmation_content: read('confirmation'),
  }
}

/**
 * Das Mail-Logo: das Zeichen aus `public/Logo.png` ohne Rand, 52 px hoch (in
 * der Mail 26 px). Pixel unter 3 % Deckkraft zählen nicht zum Zeichen — in der
 * Datei stecken fast unsichtbare Reste einer früheren Fassung. Die Adresse
 * trägt einen Hash des Bildes, damit Mail-Programme ein neues Logo nicht aus
 * ihrem Cache überspringen.
 */
async function emailLogo(): Promise<{ png: Buffer; url: string }> {
  const { data, info } = await sharp('public/Logo.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let [left, top, right, bottom] = [info.width, info.height, -1, -1]
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 8) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) fail('public/Logo.png enthält kein sichtbares Zeichen')
  const png = await sharp('public/Logo.png')
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize({ height: 52 })
    .png()
    .toBuffer()
  const version = createHash('sha256').update(png).digest('hex').slice(0, 10)
  const base = value('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
  return { png, url: `${base}/storage/v1/object/public/brand/email-logo.png?v=${version}` }
}

async function uploadEmailLogo(png: Buffer): Promise<void> {
  const base = value('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
  const key = value('SUPABASE_SERVICE_ROLE_KEY')
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  // Gibt es den Bucket schon, lehnt Storage das Anlegen ab — das ist gewollt.
  await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'brand', name: 'brand', public: true }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null)
  const upload = await fetch(`${base}/storage/v1/object/brand/email-logo.png`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: new Uint8Array(png),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => fail('Supabase Storage ist nicht erreichbar'))
  if (!upload.ok) fail(`Mail-Logo nach Supabase Storage hochladen: HTTP ${upload.status}`)
  console.log('✓ Mail-Logo in Supabase Storage (Bucket „brand“)')
}

const LABELS: Record<string, string> = {
  smtp_admin_email: 'Absender',
  smtp_sender_name: 'Absendername',
  smtp_host: 'SMTP-Server',
  smtp_port: 'SMTP-Port',
  smtp_user: 'SMTP-Nutzer',
  rate_limit_email_sent: 'Limit (Mails pro Stunde)',
  mailer_otp_exp: 'Gültigkeit des Links (Sekunden)',
  site_url: 'Site URL',
  uri_allow_list: 'Redirect URLs',
}

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

type ResendDomain = {
  id: string
  name: string
  status: string
  records?: Array<{ name: string; type: string; value: string; priority?: number; status: string }>
}

async function resend(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${value('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => fail('Resend ist nicht erreichbar'))
  const body = (await response.json().catch(() => ({}))) as { message?: string }
  if (response.status === 401 || response.status === 403) {
    fail('Resend lehnt RESEND_API_KEY ab. Dieses Skript braucht einen Schlüssel mit „Full access“ (Resend → API Keys).')
  }
  if (!response.ok) fail(`Resend: HTTP ${response.status} ${body.message ?? ''}`)
  return body
}

/** true, sobald Resend die Absender-Domain bestätigt hat. */
async function checkResendDomain(domain: string): Promise<boolean> {
  const list = (await resend('/domains')) as { data?: ResendDomain[] }
  let found = list.data?.find((entry) => entry.name === domain)
  if (!found) {
    if (!apply) {
      console.log(`· Resend: Domain ${domain} ist noch nicht angelegt — mit --apply anlegen`)
      return false
    }
    found = (await resend('/domains', { method: 'POST', body: JSON.stringify({ name: domain }) })) as ResendDomain
    console.log(`✓ Resend: Domain ${domain} angelegt`)
  }
  if (found.status === 'verified') {
    console.log(`✓ Resend: ${domain} ist bestätigt`)
    return true
  }

  const details = (await resend(`/domains/${found.id}`)) as ResendDomain
  console.log(`· Resend: ${domain} ist noch nicht bestätigt (${details.status}). Diese DNS-Einträge beim Domain-Anbieter setzen:`)
  for (const record of details.records ?? []) {
    const priority = record.priority == null ? '' : `${record.priority} `
    console.log(`    ${record.type.padEnd(5)} ${record.name.padEnd(30)} ${priority}${record.value}   [${record.status}]`)
  }
  if (apply) {
    await resend(`/domains/${found.id}/verify`, { method: 'POST' })
    console.log('  Prüfung bei Resend angestoßen. Sobald die Einträge stehen, das Skript erneut ausführen.')
  }
  return false
}

async function supabaseAuth(ref: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    ...init,
    headers: { Authorization: `Bearer ${value('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => fail('Supabase-Management-API ist nicht erreichbar'))
  if (!response.ok) fail(`Supabase-Management-API: HTTP ${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}`)
  return (await response.json()) as Record<string, unknown>
}

async function main(): Promise<void> {
  const from = value('MAIL_FROM')
  const domain = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/.exec(from)?.[1]?.toLowerCase()
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(value('NEXT_PUBLIC_SUPABASE_URL'))?.[1]
  const missing = [
    !value('RESEND_API_KEY') && 'RESEND_API_KEY',
    !domain && 'MAIL_FROM (z. B. login@deine-domain.de)',
    !value('SUPABASE_ACCESS_TOKEN') && 'SUPABASE_ACCESS_TOKEN',
    !ref && 'NEXT_PUBLIC_SUPABASE_URL',
    !value('SUPABASE_SERVICE_ROLE_KEY') && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)
  if (missing.length) fail(`In ${file} fehlt: ${missing.join(', ')} — Anleitung: docs/production-setup.md, Schritt 5`)

  const verified = await checkResendDomain(domain!)
  const current = await supabaseAuth(ref!)

  const logo = await emailLogo()
  const desired: Record<string, unknown> = {}
  if (verified) {
    Object.assign(desired, SMTP, templates(logo.url), {
      smtp_admin_email: from,
      smtp_sender_name: value('MAIL_FROM_NAME') || 'Ocuris',
      rate_limit_email_sent: Number(value('MAIL_RATE_PER_HOUR')) || 100,
      mailer_otp_exp: LINK_LIFETIME_SECONDS,
    })
  } else {
    console.log('· Supabase bleibt beim eingebauten Versand, bis Resend die Domain bestätigt hat.')
  }
  const origin = value('NEXT_PUBLIC_APP_URL').replace(/\/$/, '')
  if (origin) {
    desired.site_url = origin
    const allowed = String(current.uri_allow_list ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
    const callback = `${origin}/auth/callback`
    if (!allowed.includes(callback)) desired.uri_allow_list = [...allowed, callback].join(',')
  }

  const changes = Object.entries(desired).filter(([key, next]) => String(current[key] ?? '') !== String(next))
  // Das Passwort liefert die API nicht zurück — gesetzt wird es, sobald
  // Resend der SMTP-Server ist oder wird.
  const setPassword = verified && (current.smtp_host !== SMTP.smtp_host || changes.length > 0)
  if (!changes.length && !setPassword) {
    console.log(verified ? '✓ Supabase Auth: Versand über Resend ist eingerichtet' : '· Supabase Auth: nichts zu ändern')
    process.exitCode = verified ? 0 : 1
    return
  }

  console.log(`\nSupabase Auth${apply ? '' : ' (Vorschau)'}:`)
  for (const [key, next] of changes) {
    if (key.startsWith('mailer_templates_')) console.log(`  ${key}: deutsche Vorlage aus supabase/templates/`)
    else console.log(`  ${LABELS[key] ?? key}: ${current[key] || '—'} → ${next}`)
  }
  if (setPassword) console.log('  SMTP-Passwort: RESEND_API_KEY')

  if (!apply) {
    console.log('\nMit `npm run auth:mail -- --apply` übernehmen.')
    process.exitCode = verified ? 0 : 1
    return
  }
  if (changes.some(([key]) => key.startsWith('mailer_templates_'))) await uploadEmailLogo(logo.png)
  await supabaseAuth(ref!, {
    method: 'PATCH',
    body: JSON.stringify({ ...Object.fromEntries(changes), ...(setPassword ? { smtp_pass: value('RESEND_API_KEY') } : {}) }),
  })
  console.log('\n✓ Supabase Auth aktualisiert. Jetzt auf /login einen Link an die eigene Adresse schicken und testen.')
  process.exitCode = verified ? 0 : 1
}

main().catch((error: unknown) => fail((error as Error).message))
