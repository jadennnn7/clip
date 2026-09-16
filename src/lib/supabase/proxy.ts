import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Routen, die ohne Session erreichbar sind. */
const PUBLIC_ROUTES = ['/', '/login', '/signup', '/auth', '/api/stripe/webhook']

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
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
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
