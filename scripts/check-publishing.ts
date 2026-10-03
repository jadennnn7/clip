import { loadEnvConfig } from '@next/env'
import { getPublishingCapabilities, getPublishingSetupIssues } from '../src/services/publishing/config'

// Match `next dev`'s env-file precedence without displaying secret values.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')

console.log('Publishing: lokale Konfigurationsprüfung (keine Verbindungstests)\n')
const issues = getPublishingSetupIssues()
if (!issues.length) console.log('OK: Grundkonfiguration eingetragen.')
for (const issue of issues) {
  console.log(`FEHLT/UNGÜLTIG: ${issue.service} — ${issue.variables.join(', ')}`)
}

if (!process.env.TRIGGER_PROJECT_ID?.trim()) {
  console.log('DEPLOYMENT: TRIGGER_PROJECT_ID fehlt für den Trigger.dev-Worker.')
}

const platforms = [
  { name: 'YouTube', variables: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  { name: 'Instagram', variables: ['META_APP_ID', 'META_APP_SECRET'] },
  { name: 'TikTok', variables: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'] },
]
let configuredPlatforms = 0
console.log('\nKanal-Verbindungen (mindestens eine Plattform einrichten):')
for (const platform of platforms) {
  const missing = platform.variables.filter((name) => !process.env[name]?.trim())
  if (missing.length) console.log(`FEHLT: ${platform.name} — ${missing.join(', ')}`)
  else {
    configuredPlatforms++
    console.log(`OK: ${platform.name}-Zugangsdaten eingetragen.`)
  }
}
console.log('\nInstagram und TikTok benötigen zusätzlich eine erreichbare R2_PUBLIC_BASE_URL.')
console.log('\nÖffentliche Vollautomatik:')
for (const [platform, capability] of Object.entries(getPublishingCapabilities())) {
  console.log(`${capability.canAutoPublish ? 'BEREIT' : 'NICHT BEREIT'}: ${platform}${capability.notice ? ` — ${capability.notice}` : ''}`)
}
console.log('Anleitung: docs/publishing-setup.md')
console.log('Datenbankschema, gültige Zugangsdaten, Worker und OAuth-Freigaben müssen separat geprüft werden.')
process.exitCode = issues.length || !configuredPlatforms ? 1 : 0
