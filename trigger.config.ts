import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import type { BuildExtension } from '@trigger.dev/build'
import { esbuildPlugin } from '@trigger.dev/build/extensions'
import { additionalFiles, ffmpeg, syncEnvVars } from '@trigger.dev/build/extensions/core'
import { defineConfig } from '@trigger.dev/sdk'
import { checkProductionEnv, formatIssues } from './src/lib/production-env'

/**
 * Trigger.dev-Worker für Link-Pipeline und MP4-Render (Cloud-Modus).
 *
 * Deploy: `npx trigger.dev@4.6.3 deploy` (siehe README). Der Worker braucht
 * dieselben Werkzeuge wie der lokale Modus — ffmpeg, yt-dlp, Chrome für
 * Remotion — und die Quellen der Composition, die Remotion zur Laufzeit
 * bündelt.
 */

const readEnvFile = (file: string): Record<string, string | undefined> =>
  existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}

// Die CLI wertet diese Datei aus, bevor `--env-file` greift — ohne das
// fehlte `TRIGGER_PROJECT_ID`, und `trigger dev` scheiterte mit einer 404
// auf `/api/v1/projects//dev`. Nur die ID, nicht die ganze Datei: Deren
// Werte würden sonst jede später geladene Env-Datei überdecken.
const projectId = process.env.TRIGGER_PROJECT_ID ?? readEnvFile('.env.local').TRIGGER_PROJECT_ID ?? ''

/**
 * Werte für den deployten Worker: `.env.production` für prod, `.env.staging`
 * für staging — nie `.env.local`. Dort stehen Tunnel-URL und Platzhalter;
 * der Worker schickte Instagram und TikTok sonst Links, die sie nicht
 * abholen können.
 */
const deployEnvFile = (environment: string) => `.env.${environment === 'prod' ? 'production' : environment}`

/**
 * Bricht einen Deploy mit unbrauchbarer Umgebung ab, bevor gebaut wird.
 * Hier und nicht in `syncEnvVars`: Fehler in Build-Extensions protokolliert
 * die CLI nur und deployt trotzdem.
 */
function assertDeployEnv(): void {
  const args = process.argv.slice(2)
  if (!args.includes('deploy')) return
  const flag = args.findIndex((arg) => arg === '--env' || arg === '-e')
  const inline = args.find((arg) => arg.startsWith('--env='))?.slice('--env='.length)
  const raw = inline ?? (flag >= 0 ? args[flag + 1] : 'prod')
  const environment = raw === 'production' ? 'prod' : raw
  // Preview-Branches teilen sich eine Umgebung; dort gibt es keine eigene Datei.
  if (environment === 'preview') return
  const file = deployEnvFile(environment)
  if (!existsSync(file)) throw new Error(`${file} fehlt. Vorlage: .env.example, Anleitung: docs/production-setup.md`)
  const issues = checkProductionEnv(readEnvFile(file), ['worker'])
  const errors = issues.filter((issue) => issue.level === 'error')
  if (issues.length) console.warn(`\n${file}:\n${formatIssues(issues)}\n`)
  if (errors.length) throw new Error(`Deploy abgebrochen: ${errors.length} Problem(e) in ${file}, siehe oben. Prüfen mit \`npm run prod:check\`.`)
}
assertDeployEnv()

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  dependencies: Record<string, string>
}

/** Bibliotheken, die Chrome Headless Shell unter Debian braucht (laut Remotion-Doku). */
const CHROME_LIBRARIES = [
  'libnss3', 'libdbus-1-3', 'libatk1.0-0', 'libgbm-dev', 'libasound2', 'libxrandr2', 'libxkbcommon-dev',
  'libxfixes3', 'libxcomposite1', 'libxdamage1', 'libpango-1.0-0', 'libcairo2', 'libcups2', 'libatk-bridge2.0-0',
]

/**
 * yt-dlp als eigenständiges Linux-Binary (kein Python nötig) und Chromes
 * Systembibliotheken. Außerdem Pakete, die erst zur Laufzeit aufgelöst
 * werden — von Remotions webpack beim Bündeln der Composition bzw. von
 * face-api. Der Task-Code importiert sie nicht selbst, deshalb installiert
 * Trigger.dev sie sonst nicht mit.
 */
const mediaTools: BuildExtension = {
  name: 'omegaclip-media-tools',
  onBuildComplete(context) {
    if (context.target === 'dev') return
    const pick = (name: string) => packageJson.dependencies[name]
    context.addLayer({
      id: 'omegaclip-media-tools',
      image: {
        pkgs: ['ca-certificates', 'curl', ...CHROME_LIBRARIES],
        instructions: [
          'RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp',
        ],
      },
      dependencies: {
        remotion: pick('remotion'),
        react: pick('react'),
        'react-dom': pick('react-dom'),
        '@remotion/google-fonts': pick('@remotion/google-fonts'),
        // face-api lädt tfjs erst zur Laufzeit per `require`.
        '@tensorflow/tfjs': pick('@tensorflow/tfjs'),
        '@tensorflow/tfjs-backend-wasm': pick('@tensorflow/tfjs-backend-wasm'),
      },
    })
  },
}

/**
 * `import 'server-only'` wirft außerhalb von React Server Components. Die
 * Services tragen den Import als Schutz vor versehentlichem Client-Bundling;
 * im Worker gibt es keinen Client, der Import wird hier zu einem leeren Modul.
 */
const serverOnlyShim = esbuildPlugin({
  name: 'server-only-shim',
  setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'server-only-shim' }))
    build.onLoad({ filter: /.*/, namespace: 'server-only-shim' }, () => ({ contents: '', loader: 'js' }))
  },
})

/** Schlüssel, die der Worker braucht — beim Deploy aus der lokalen Umgebung übernommen. */
const WORKER_ENV = [
  'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_FALLBACK_MODEL', 'DEEPGRAM_API_KEY',
  'AI_FALLBACK_BASE_URL', 'AI_FALLBACK_API_KEY', 'AI_FALLBACK_MODEL',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT',
  'R2_PUBLIC_BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'TOKEN_ENCRYPTION_KEY', 'NEXT_PUBLIC_APP_URL',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'YOUTUBE_AUDIT_PASSED',
  'META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'META_APP_REVIEW_PASSED',
  'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET',
  'TIKTOK_AUDIT_PASSED',
  // YouTube sperrt Rechenzentrums-IPs; siehe `youtubeAccessArgs` in services/video/source.ts.
  'YTDLP_PROXY', 'YTDLP_COOKIES_BASE64',
  // Konten ohne Credit- und Export-Grenzen; siehe `isAdmin` in services/billing/credits.ts.
  'ADMIN_EMAILS',
]

export default defineConfig({
  project: projectId,
  dirs: ['./src/trigger'],
  runtime: 'node-22',
  maxDuration: 60 * 60,
  build: {
    // Laden WebAssembly, Modelle, webpack und Plattform-Binaries relativ zum
    // eigenen Paket — gebündelt stimmen diese Pfade nicht mehr.
    external: [
      '@vladmandic/face-api',
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-backend-wasm',
      '@remotion/bundler',
      '@remotion/renderer',
    ],
    extensions: [
      ffmpeg(),
      additionalFiles({ files: ['./remotion/**', './src/types/**', './src/lib/mock-data.ts'] }),
      mediaTools,
      serverOnlyShim,
      syncEnvVars(({ environment }) => {
        const env = readEnvFile(deployEnvFile(environment))
        return WORKER_ENV.flatMap((name) => (env[name] ? [{ name, value: env[name], isSecret: true }] : []))
      }),
    ],
  },
})
