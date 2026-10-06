import type { NextRequest } from 'next/server'
import { NEW_PASSWORD_PATH } from '@/lib/auth-password'
import { handleAuthCallback } from '@/lib/server/auth-callback'

/** Rückkehr aus der Mail „Passwort vergessen?" — weiter zum neuen Passwort. */
export function GET(request: NextRequest) {
  return handleAuthCallback(request, NEW_PASSWORD_PATH)
}
