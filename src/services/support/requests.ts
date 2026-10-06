import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { OPERATOR } from '@/lib/legal'
import { mailConfigured, sendMail } from '@/lib/server/mail'
import { getPlan } from '@/lib/stripe/plans'
import type { AssistantMessage } from '@/lib/assistant'
import type { SubscriptionTier } from '@/types/database'

/**
 * Anfragen an das Team aus dem Hilfe-Widget.
 *
 * Erst speichern, dann mailen: Scheitert der Versand, steht die Anfrage
 * trotzdem in `support_requests` (mit `mail_error`) und geht nicht verloren.
 * Die Mail geht an die Support-Adresse; „Antworten“ schreibt direkt dem
 * Nutzer, weil `reply_to` seine Konto-Adresse ist.
 */

export class SupportError extends Error {}

/** Wohin Anfragen gehen: die Adresse aus dem Widget, sonst die aus dem Impressum. */
export function supportInbox(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || OPERATOR.email
}

export interface SupportRequestInput {
  userId: string
  email: string
  name: string | null
  message: string
  transcript: Pick<AssistantMessage, 'role' | 'text'>[]
  page: string | null
}

const when = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })

function compose(input: SupportRequestInput, id: string, account: { tier: SubscriptionTier; status: string; credits: number } | null) {
  const firstLine = input.message.split('\n').find((line) => line.trim())?.trim() ?? 'Anfrage'
  const subject = `Support: ${firstLine.length > 70 ? `${firstLine.slice(0, 69)}…` : firstLine}`
  const transcript = input.transcript.length
    ? input.transcript.map((entry) => `${entry.role === 'user' ? 'Nutzer' : 'Assistent'}: ${entry.text}`).join('\n\n')
    : '(nicht mitgeschickt)'
  const text = [
    `Von: ${input.name ? `${input.name} <${input.email}>` : input.email}`,
    `Konto: ${input.userId}`,
    account
      ? `Tarif: ${getPlan(account.tier).name} (${account.status}), ${account.credits.toLocaleString('de-DE')} Credits`
      : 'Tarif: unbekannt',
    `Seite: ${input.page ?? '–'}`,
    `Zeit: ${when.format(new Date())}`,
    `Anfrage: ${id}`,
    '',
    'Anliegen',
    '--------',
    input.message,
    '',
    'Chatverlauf mit dem Assistenten',
    '-------------------------------',
    transcript,
    '',
    `„Antworten“ schreibt direkt an ${input.email}.`,
  ].join('\n')
  return { subject, text }
}

export async function createSupportRequest(input: SupportRequestInput): Promise<{ id: string; mailed: boolean }> {
  const db = createAdminClient()
  const { data, error } = await db.from('support_requests').insert({
    user_id: input.userId,
    email: input.email,
    message: input.message,
    transcript: input.transcript,
    page: input.page,
  }).select('id').single()
  if (error || !data) {
    console.error('[support] Anfrage nicht gespeichert', { code: error?.code, message: error?.message })
    throw new SupportError('Deine Nachricht konnte nicht gespeichert werden. Bitte versuch es gleich noch einmal.')
  }
  const id = data.id as string

  if (!mailConfigured()) {
    console.warn(`[support] Anfrage ${id} gespeichert, aber nicht gemailt: RESEND_API_KEY oder MAIL_FROM fehlt`)
    await db.from('support_requests').update({ mail_error: 'Mailversand nicht eingerichtet' }).eq('id', id)
    return { id, mailed: false }
  }

  const { data: profile } = await db.from('profiles')
    .select('subscription_tier, subscription_status, plan_credits, pack_credits')
    .eq('id', input.userId).maybeSingle()
  const account = profile
    ? {
        tier: profile.subscription_tier as SubscriptionTier,
        status: String(profile.subscription_status),
        credits: Number(profile.plan_credits) + Number(profile.pack_credits),
      }
    : null

  try {
    await sendMail({ to: supportInbox(), replyTo: input.email, ...compose(input, id, account) })
    await db.from('support_requests').update({ mailed_at: new Date().toISOString(), mail_error: null }).eq('id', id)
    return { id, mailed: true }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    console.error(`[support] Anfrage ${id} nicht gemailt`, reason)
    await db.from('support_requests').update({ mail_error: reason.slice(0, 500) }).eq('id', id)
    return { id, mailed: false }
  }
}
