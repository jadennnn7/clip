import type { Metadata } from 'next'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Willkommen bei Clyp',
}

/** Vorname aus der Registrierung — nur für die Begrüßung. */
async function firstName(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const fullName = user?.user_metadata?.full_name
  return typeof fullName === 'string' && fullName.trim() ? fullName.trim().split(/\s+/)[0] : null
}

/**
 * Erst-Einrichtung. Der Proxy schickt jeden Nutzer ohne abgeschlossenes
 * Onboarding hierher, bevor er das Dashboard sieht; danach bleibt die Seite
 * über die Adresse erreichbar, leitet aber nicht mehr um.
 */
export default async function OnboardingPage() {
  return <OnboardingFlow firstName={await firstName()} />
}
