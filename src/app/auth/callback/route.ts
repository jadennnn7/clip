import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requestOrigin } from '@/lib/request-origin'

export async function GET(request: NextRequest) {
  const origin = requestOrigin(request)

  // Die eigenen Mail-Vorlagen (`supabase/templates/`) hängen `token_hash` an
  // die Redirect-Adresse statt eines PKCE-Codes. Eingelöst wird er in
  // `/auth/confirm` — dort klappt es auch in einem anderen Browser als dem,
  // in dem der Link angefordert wurde.
  if (request.nextUrl.searchParams.has('token_hash')) {
    return NextResponse.redirect(new URL(`/auth/confirm${request.nextUrl.search}`, origin))
  }

  // Google meldet Abbruch oder Fehler als `error` statt eines Codes.
  if (request.nextUrl.searchParams.has('error')) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin))
  }

  const code = request.nextUrl.searchParams.get('code')

  if (code && code.length <= 4096) {
    // Die Redirect-Response wird zuerst erstellt, damit der Supabase-Client
    // die Session-Cookies direkt darauf schreiben kann. Würde man stattdessen
    // createClient() (cookies() aus next/headers) verwenden, landen die Cookies
    // auf einem internen Store — aber NICHT auf dem NextResponse.redirect(),
    // das zurückgesendet wird. Der Browser sähe dann keine Session.
    const successResponse = NextResponse.redirect(new URL('/dashboard', origin))
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
    return failResponse
  }

  return NextResponse.redirect(new URL('/login?error=invalid_link', origin))
}
