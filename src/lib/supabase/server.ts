import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase-Client für Server Components, Server Actions und Route Handlers.
 *
 * `cookies()` ist ab Next.js 16 asynchron, deshalb ist diese Funktion async.
 * In Server Components schlägt das Schreiben von Cookies fehl — das ist
 * unkritisch, weil `proxy.ts` die Session ohnehin bei jedem Request auffrischt.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Aufruf aus einer Server Component: Cookies sind hier read-only.
            // Der Refresh passiert stattdessen im Proxy.
          }
        },
      },
    },
  )
}
