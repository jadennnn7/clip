import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requestOrigin } from '@/lib/request-origin'

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']

/**
 * Anmeldung per `token_hash` statt PKCE-Code.
 *
 * Der Magic Link über `/auth/callback` gilt nur im Browser, in dem er
 * angefordert wurde (PKCE). Links mit `token_hash` — aus einer angepassten
 * E-Mail-Vorlage oder serverseitig per `auth.admin.generateLink` erzeugt —
 * brauchen das nicht und werden hier eingelöst.
 */
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request)
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null
  const failResponse = NextResponse.redirect(new URL('/login?error=invalid_link', origin))
  if (!tokenHash || tokenHash.length > 4096 || !type || !OTP_TYPES.includes(type)) return failResponse

  // Nur Ziele auf dieser Adresse — kein offener Redirect über `next`.
  const next = new URL(request.nextUrl.searchParams.get('next') ?? '/dashboard', origin)
  const target = next.origin === origin ? `${next.pathname}${next.search}` : '/dashboard'
  const successResponse = NextResponse.redirect(new URL(target, origin))

  // Cookies direkt auf die Redirects schreiben — siehe `/auth/callback`.
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

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  return error ? failResponse : successResponse
}
