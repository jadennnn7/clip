#!/usr/bin/env tsx

/**
 * Setzt das Passwort eines bestehenden Kontos — etwa für das eigene
 * Admin-Konto, das noch aus der Zeit des Anmeldelinks kein Passwort hat.
 *
 * Das Passwort wird verdeckt abgefragt und steht damit weder in der
 * Shell-History noch in einer Datei. Die Adresse gilt danach als bestätigt,
 * sonst ließe Supabase die Anmeldung nicht zu.
 *
 *   npm run auth:set-password <email>
 */

import { createClient } from '@supabase/supabase-js'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../src/lib/auth-password'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Fehlende Umgebungsvariablen NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.log('Verwendung: npm run auth:set-password <email>')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Liest eine Zeile, ohne sie anzuzeigen. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process
  if (!stdin.isTTY) {
    console.error('❌ Bitte in einem Terminal ausführen — das Passwort wird verdeckt abgefragt.')
    process.exit(1)
  }
  stdout.write(question)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  let value = ''
  return new Promise((resolve) => {
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          resolve(value)
          return
        }
        if (char === '\u0003') {
          stdout.write('\n')
          process.exit(130)
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else value += char
      }
    }
    stdin.on('data', onData)
  })
}

async function findUserId(address: string): Promise<string | null> {
  const { data: profile } = await supabase.from('profiles').select('id').ilike('email', address).maybeSingle()
  if (profile?.id) return profile.id as string
  // Kein Profil (etwa ein unbestätigtes Konto): die Nutzerliste durchgehen.
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === address)
    if (user) return user.id
    if (data.users.length < 1000) return null
  }
}

async function main() {
  const userId = await findUserId(email)
  if (!userId) {
    console.error(`❌ Kein Konto mit der Adresse ${email} gefunden.`)
    process.exit(1)
  }

  const password = await promptHidden('Neues Passwort: ')
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    console.error(`❌ Das Passwort braucht ${MIN_PASSWORD_LENGTH} bis ${MAX_PASSWORD_LENGTH} Zeichen.`)
    process.exit(1)
  }
  if ((await promptHidden('Wiederholen:    ')) !== password) {
    console.error('❌ Die beiden Eingaben stimmen nicht überein.')
    process.exit(1)
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true })
  if (error) {
    console.error('❌ Passwort nicht gesetzt:', error.message)
    process.exit(1)
  }
  console.log(`✅ Passwort für ${email} gesetzt. Du kannst dich jetzt mit E-Mail und Passwort anmelden.`)
}

main().catch((error) => {
  console.error('❌', error instanceof Error ? error.message : error)
  process.exit(1)
})
