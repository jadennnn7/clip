import Link from 'next/link'
import { Clapperboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Clapperboard className="size-5" />
          <span className="text-sm font-semibold tracking-tight">OmegaClip</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Anmelden</CardTitle>
            <CardDescription>
              {/* Phase 2: supabase.auth.signInWithOtp() bzw. signInWithOAuth() */}
              Melde dich an, um deine Projekte zu sehen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input id="email" type="email" placeholder="du@beispiel.de" autoComplete="email" />
            </div>
            <Button className="w-full">Magic Link senden</Button>
            <p className="text-center text-xs text-muted-foreground">
              Noch kein Konto?{' '}
              <Link href="/signup" className="underline underline-offset-2">
                Registrieren
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
