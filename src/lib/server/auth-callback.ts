import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requestOrigin } from '@/lib/request-origin'

/**
 * Die Rückkehr aus einer Mail oder von Google: Code einlösen, Session-Cookies
 * setzen, weiter nach `target`.
 *
 * Zwei Einstiege teilen sich das: `/auth/callback` (Google, Bestätigung der
 * Registrierung → Dashboard) und `/auth/reset` (Passwort vergessen → neues
 * Passwort festlegen). Getrennte Pfade statt `?next=`, weil die eigenen
 * Mail-Vorlagen `?token_hash=…` direkt an die Rücksprung-Adresse hängen —
 * ein zweites Fragezeichen würde den Link zerbrechen.
 */
export async function handleAuthCallback(request: NextRequest, target: string): Promise<NextResponse> {
  const origin = requestOrigin(request)

  // Die eigenen Mail-Vorlagen (`supabase/templates/`) hängen `token_hash` an
  // die Redirect-Adresse statt eines PKCE-Codes. Eingelöst wird er in
  // `/auth/confirm` — dort klappt es auch in einem anderen Browser als dem,
  // in dem der Link angefordert wurde.
  if (request.nextUrl.searchParams.has('token_hash')) {
    const confirm = new URL('/auth/confirm', origin)
    confirm.search = request.nextUrl.search
    confirm.searchParams.set('next', target)
    return NextResponse.redirect(confirm)
  }

  // Google bzw. Supabase melden Abbruch oder Fehler als `error` statt eines
  // Codes. Nur `access_denied` ist ein echter Abbruch; alles andere (falsche
  // Zugangsdaten, nicht freigegebene Redirect-URL, Google-App im Testmodus …)
  // steht mit Beschreibung im Server-Log, damit es sich finden lässt.
  const oauthError = request.nextUrl.searchParams.get('error')
  if (oauthError) {
    const params = request.nextUrl.searchParams
    console.error('[auth] OAuth-Rückkehr mit Fehler', {
      error: oauthError.slice(0, 100),
      code: params.get('error_code')?.slice(0, 100),
      description: params.get('error_description')?.slice(0, 300),
    })
    const reason = oauthError === 'access_denied' ? 'oauth_cancelled' : 'oauth_failed'
    return NextResponse.redirect(new URL(`/login?error=${reason}`, origin))
  }

  const code = request.nextUrl.searchParams.get('code')

  if (code && code.length <= 4096) {
    // Die Redirect-Response wird zuerst erstellt, damit der Supabase-Client
    // die Session-Cookies direkt darauf schreiben kann. Würde man stattdessen
    // createClient() (cookies() aus next/headers) verwenden, landen die Cookies
    // auf einem internen Store — aber NICHT auf dem NextResponse.redirect(),
    // das zurückgesendet wird. Der Browser sähe dann keine Session.
    const successResponse = NextResponse.redirect(new URL(target, origin))
    const failResponse = NextResponse.redirect(new URL('/login?error=invalid_link', origin))

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              successResponse.cookies.set(name, value, options)
              failResponse.cookies.set(name, value, options)
            })
          },
        },
      },
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return successResponse
    // Häufigste Ursache: Start auf einer anderen Adresse als die Rückkehr (der
    // PKCE-Schlüssel liegt im Cookie der Start-Adresse).
    console.error('[auth] Code-Einlösung fehlgeschlagen', { code: error.code, status: error.status, message: error.message.slice(0, 200) })
    return failResponse
  }

  return NextResponse.redirect(new URL('/login?error=invalid_link', origin))
}
