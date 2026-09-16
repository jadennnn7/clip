import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-Role-Client — UMGEHT RLS VOLLSTÄNDIG.
 *
 * Ausschließlich in Route Handlers und Trigger.dev-Tasks verwenden, niemals in
 * Code, der im Browser landet. Jeder Aufrufer muss den Nutzerbezug selbst
 * prüfen; die Datenbank tut es hier nicht mehr für ihn.
 *
 * Das ist der einzige Weg, an `private.social_account_tokens` zu kommen.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'createAdminClient: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.',
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
