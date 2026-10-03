import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Das, was die Oberfläche über das angemeldete Konto zeigt. */
export interface Account {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Das angemeldete Konto, einmal pro Request gelesen.
 *
 * `null` gibt es nur im Demo-Modus ohne Supabase — dort existiert kein Konto,
 * also auch kein Beispielprofil. Fehlt die Session, obwohl die Anmeldung
 * eingerichtet ist, geht es zur Anmeldung: Der Proxy leitet normalerweise
 * schon vorher um, das hier fängt eine Session ab, die dazwischen verfällt.
 */
export const getAccount = cache(async (): Promise<Account | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Das Profil trägt den Namen, den man in der App pflegt; die Metadaten nur
  // den aus der Registrierung. Fehlt die Zeile (Schema noch nicht eingespielt),
  // reicht die Session allein.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: text(profile?.full_name) ?? text(user.user_metadata?.full_name),
    avatarUrl: text(profile?.avatar_url) ?? text(user.user_metadata?.avatar_url),
  }
})
