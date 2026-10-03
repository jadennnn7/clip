#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Fehlende Umgebungsvariablen NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const rawEmail = process.argv[2]
const tokensArg = process.argv[3]

if (!rawEmail || !tokensArg) {
  console.log('Verwendung: npm run tokens:grant <email> <credits>')
  console.log('Beispiel:   npm run tokens:grant dein-user@email.com 100')
  process.exit(1)
}

const email = rawEmail.trim().toLowerCase()
const tokens = parseInt(tokensArg, 10)
if (isNaN(tokens) || tokens <= 0) {
  console.error('❌ Ungültige Credit-Anzahl:', tokensArg)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. In profiles suchen (case-insensitive)
  let { data: profile, error: findError } = await supabase
    .from('profiles')
    .select('id, email, plan_credits, pack_credits')
    .ilike('email', email)
    .maybeSingle()

  if (findError) {
    console.error('❌ Fehler beim Suchen des Profils:', findError.message)
    process.exit(1)
  }

  // 2. Falls nicht in profiles, in Supabase Auth nachsehen
  if (!profile) {
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers()
    if (authError) {
      console.error('❌ Fehler beim Abfragen der Auth-Benutzer:', authError.message)
      process.exit(1)
    }

    const authUser = authData?.users?.find(
      (u) => u.email?.toLowerCase() === email
    )

    if (authUser) {
      console.log(`ℹ️ Benutzer in Auth gefunden (${authUser.email}), lege Profil an...`)
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: authUser.id,
          email: authUser.email ?? email,
          full_name: authUser.user_metadata?.full_name ?? '',
        })
        .select('id, email, plan_credits, pack_credits')
        .single()

      if (insertError) {
        console.error('❌ Konnte Profil nicht anlegen:', insertError.message)
        process.exit(1)
      }
      profile = newProfile
    } else {
      console.error(`❌ Kein Account mit der E-Mail "${rawEmail}" gefunden.`)
      if (authData?.users && authData.users.length > 0) {
        console.log('\nVorhandene registrierte Benutzer:')
        for (const u of authData.users) {
          console.log(`  • ${u.email} (ID: ${u.id})`)
        }
      } else {
        console.log('\nEs gibt noch keine registrierten Benutzer in deiner Supabase-Datenbank.')
        console.log('👉 Bitte registriere dich zuerst in der App im Browser (z. B. auf http://localhost:3000/login oder /signup).')
      }
      process.exit(1)
    }
  }

  // 3. Als Nachkauf gutschreiben: verfällt nicht, übersteht Tarifwechsel.
  // Kein Rückfall auf ein direktes Update — die Datenbank bucht atomar.
  const { error: rpcError } = await supabase.rpc('grant_token_pack', {
    p_user_id: profile.id,
    p_tokens: tokens,
    p_reference: `manual-${Date.now()}`,
  })
  if (rpcError) {
    console.error('❌ Gutschrift fehlgeschlagen:', rpcError.message)
    console.error('   Ist supabase/migrations/20260930000000_source_minute_credits.sql eingespielt?')
    process.exit(1)
  }

  const { data: after } = await supabase.from('profiles').select('plan_credits, pack_credits').eq('id', profile.id).single()
  const plan = Number(after?.plan_credits) || 0
  const pack = Number(after?.pack_credits) || 0
  console.log(`\n🎉 Erfolgreich ${tokens} Credits gutgeschrieben für ${profile.email}!`)
  console.log(`──────────────────────────────────────────`)
  console.log(`📊 Aus Tarif/Test:   ${plan} Credits`)
  console.log(`🧾 Nachgekauft:      ${pack} Credits`)
  console.log(`✨ Jetzt verfügbar:  ${plan + pack} Credits`)
  console.log(`──────────────────────────────────────────\n`)
}

main().catch((err) => {
  console.error('❌ Unerwarteter Fehler:', err)
  process.exit(1)
})
