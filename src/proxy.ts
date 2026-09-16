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
     * Alles außer statischen Assets. Bilder und Fonts brauchen keinen
     * Session-Refresh und würden den Proxy nur unnötig aufrufen.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
}
