import { NextResponse, type NextRequest } from 'next/server'
import { EDITOR_ENABLED, editorRedirect } from '@/lib/features'
import { rememberReferral } from '@/lib/referral'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Ab Next.js 16 heißt Middleware "Proxy" (`proxy.ts`, Named Export `proxy`).
 * Die Edge-Runtime wird hier nicht mehr unterstützt — Proxy läuft auf Node.
 */
export async function proxy(request: NextRequest) {
  // Editor abgeschaltet (siehe `lib/features.ts`): auch direkt aufgerufene
  // oder gemerkte Editor-Adressen kommen nicht mehr hinein.
  const editorTarget = EDITOR_ENABLED ? null : editorRedirect(request.nextUrl.pathname)
  if (editorTarget) return NextResponse.redirect(new URL(editorTarget, request.url))
  // Partnerlink (`?ref=`): Code merken, dann zur Adresse ohne Parameter.
  return rememberReferral(request) ?? updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Alles außer statischen Assets. Bilder, Videos, Fonts, robots.txt und
     * sitemap.xml brauchen keinen Session-Refresh — und müssen ohne Konto
     * erreichbar sein (das Demo-Video der Landingpage, Suchmaschinen).
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|mp4|webm|mp3|txt|xml|pdf)$).*)',
  ],
}
