import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { normalizePartnerCode, PARTNER, REFERRAL_COOKIE, REFERRAL_PARAM } from '@/lib/partner'

/**
 * Partnerlinks im Proxy.
 *
 * Ein Aufruf mit `?ref=<code>` merkt sich den Code in einem eigenen Cookie
 * und leitet auf dieselbe Adresse ohne Parameter um — geteilte und
 * gespeicherte Links tragen den Code so nicht weiter, und Suchmaschinen sehen
 * keine Doppelseiten. Der letzte Link gewinnt.
 *
 * Sobald jemand angemeldet ist, ordnet `claim_referral` das Konto dem
 * Partner zu — bei einer neuen Registrierung also auf der ersten Seite danach.
 * Die Datenbank entscheidet, ob das Konto noch zugeordnet werden darf; das
 * Cookie ist danach in jedem Fall weg, damit nicht jede Anfrage nachfragt.
 */
export function rememberReferral(request: NextRequest): NextResponse | null {
  const { nextUrl } = request
  if (request.method !== 'GET' || !nextUrl.searchParams.has(REFERRAL_PARAM) || nextUrl.pathname.startsWith('/api/')) return null
  const url = nextUrl.clone()
  url.searchParams.delete(REFERRAL_PARAM)
  const response = NextResponse.redirect(url)
  const code = normalizePartnerCode(nextUrl.searchParams.get(REFERRAL_PARAM))
  if (code) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      maxAge: PARTNER.cookieDays * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }
  return response
}

export async function claimReferral(supabase: SupabaseClient, request: NextRequest, response: NextResponse) {
  if (!request.cookies.has(REFERRAL_COOKIE)) return
  const code = normalizePartnerCode(request.cookies.get(REFERRAL_COOKIE)?.value)
  if (code) {
    const { data, error } = await supabase.rpc('claim_referral', { p_code: code })
    if (error) console.warn('[partner] Zuordnung fehlgeschlagen', { code: error.code, message: error.message })
    else if (data === true) console.log(`[partner] Konto über Partnercode ${code} zugeordnet`)
  }
  response.cookies.delete(REFERRAL_COOKIE)
}
