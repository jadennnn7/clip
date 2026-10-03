import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasCompletedOnboarding, ONBOARDING_PATH, requiresOnboarding } from '@/lib/onboarding'

const PUBLIC_ROUTES = [
  '/', '/login', '/signup', '/auth', '/api/stripe/webhook', '/api/auth/login', '/api/oauth',
  // Editor-Demo der Landingpage und die Vorschaubilder für geteilte Links.
  '/demo', '/opengraph-image', '/twitter-image',
  // Rechtsseiten: müssen ohne Konto erreichbar sein, sobald es sie gibt.
  '/impressum', '/datenschutz', '/agb', '/widerruf',
  // Anleitung zur Datenlöschung — Meta verlangt sie als öffentliche URL.
  '/konto-loeschen',
]

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
}

/**
 * Frischt die Supabase-Session bei jedem Request auf und schützt das Dashboard.
 *
 * Wichtig für `@supabase/ssr`: `supabase.auth.getUser()` MUSS hier aufgerufen
 * werden. Der Aufruf triggert den Token-Refresh, und die dabei gesetzten
 * Cookies müssen auf der Response landen, die tatsächlich zurückgeht — deshalb
 * wird `response` neu aufgebaut statt kopiert.
 */
export async function updateSession(request: NextRequest) {
  // Abgelaufene oder schon benutzte Magic Links schickt Supabase mit
  // `error_code` auf die Startseite — dort sah niemand die Meldung, und der
  // Login scheiterte stumm. Die Login-Seite erklärt, was zu tun ist.
  if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.has('error_code')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '?error=invalid_link'
    return NextResponse.redirect(url)
  }

  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    // In der Entwicklung läuft Phase 1 auf Mock-Daten und braucht kein
    // Supabase-Projekt — ohne diesen Zweig würde jede Route eine 500 werfen.
    //
    // In Produktion ist dasselbe ein harter Fehler: Fehlende Credentials
    // dürfen niemals stillschweigend die Authentifizierung abschalten.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen — ' +
          'ohne sie gibt es keine Session-Prüfung.',
      )
    }

    warnOnceAboutMissingConfig()
    return response
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublicRoute(request.nextUrl.pathname)) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Bitte melde dich an.' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const connectionError = url.searchParams.get('error')
    url.search = ''
    if (request.nextUrl.pathname === '/dashboard/connections' && connectionError) {
      url.searchParams.set('error', connectionError === 'oauth_origin_mismatch' ? 'oauth_origin_mismatch' : 'oauth_session_expired')
    }
    url.searchParams.set('redirect', request.nextUrl.pathname)
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  // Erster Login: erst die Kanäle, dann die App. Das Ergebnis einer
  // Kanalverbindung (`connected`/`error`) wandert mit, falls der OAuth-Callback
  // ohne Rücksprungziel auf der Kanäle-Seite gelandet ist.
  if (user && !hasCompletedOnboarding(user) && requiresOnboarding(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = ONBOARDING_PATH
    url.search = ''
    for (const key of ['connected', 'error']) {
      const value = request.nextUrl.searchParams.get(key)
      if (value) url.searchParams.set(key, value)
    }
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  return response
}

let warnedAboutMissingConfig = false
function warnOnceAboutMissingConfig() {
  if (warnedAboutMissingConfig) return
  warnedAboutMissingConfig = true
  console.warn(
    '[omegaclip] Supabase ist nicht konfiguriert — die Session-Prüfung ist deaktiviert.\n' +
      '            Die App läuft auf Mock-Daten. Für echte Daten .env.example nach\n' +
      '            .env.local kopieren und die Supabase-Werte eintragen.',
  )
}
