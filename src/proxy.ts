import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Ab Next.js 16 heißt Middleware "Proxy" (`proxy.ts`, Named Export `proxy`).
 * Die Edge-Runtime wird hier nicht mehr unterstützt — Proxy läuft auf Node.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Alles außer statischen Assets. Bilder, Videos, Fonts, robots.txt und
     * sitemap.xml brauchen keinen Session-Refresh — und müssen ohne Konto
     * erreichbar sein (das Demo-Video der Landingpage, Suchmaschinen).
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|mp4|webm|mp3|txt|xml)$).*)',
  ],
}
