import 'server-only'

/**
 * E-Mails aus der App, über die HTTP-API von Resend — dieselbe Domain wie die
 * Anmelde-Mails (`npm run auth:mail`). Ein Schlüssel mit „Sending access“
 * genügt; das Einrichtungs-Skript braucht „Full access“.
 */

export class MailError extends Error {}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim())
}

/** Zeilenumbrüche haben in einer Kopfzeile nichts verloren. */
const headerSafe = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()

export async function sendMail({ to, subject, text, replyTo }: {
  to: string
  subject: string
  text: string
  replyTo?: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim()
  const from = process.env.MAIL_FROM?.trim()
  if (!key || !from) throw new MailError('RESEND_API_KEY oder MAIL_FROM fehlt')
  const name = headerSafe(process.env.MAIL_FROM_NAME?.trim() || 'Ocuris')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${name} <${from}>`,
      to: [to],
      subject: headerSafe(subject),
      text,
      ...(replyTo ? { reply_to: headerSafe(replyTo) } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((cause: unknown) => {
    throw new MailError(`Resend nicht erreichbar: ${cause instanceof Error ? cause.message : String(cause)}`)
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new MailError(`Resend ${response.status}: ${body.slice(0, 300)}`)
  }
}
