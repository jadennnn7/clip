import { redirect } from 'next/navigation'
import { NewPasswordForm } from '@/components/auth/AuthForm'
import { createClient } from '@/lib/supabase/server'

/**
 * Ziel des Links nach „Passwort vergessen?" (über `/auth/callback`).
 *
 * Ohne Session leitet schon der Proxy auf die Anmeldung um; die Prüfung hier
 * deckt den Fall ab, dass der Link abgelaufen ist und die Session fehlt.
 * Immer dunkel wie Anmelden und Registrieren.
 */
export default async function NewPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=invalid_link')

  return (
    <main className="auth-root dark ambient grid min-h-dvh place-items-center bg-none px-6 py-12 text-white [color-scheme:dark]">
      <NewPasswordForm email={user.email ?? ''} />
    </main>
  )
}
