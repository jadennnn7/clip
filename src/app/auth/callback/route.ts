import type { NextRequest } from 'next/server'
import { handleAuthCallback } from '@/lib/server/auth-callback'

/** Rückkehr von Google und aus der Bestätigungsmail — weiter ins Dashboard. */
export function GET(request: NextRequest) {
  return handleAuthCallback(request, '/dashboard')
}
