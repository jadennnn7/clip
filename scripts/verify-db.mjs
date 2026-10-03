#!/usr/bin/env node

/**
 * Verifiziert das Token-System in der Datenbank
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY');
  console.log('\n💡 Führe das Script so aus:');
  console.log('   node --env-file=.env.local scripts/verify-db.mjs\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkDatabase() {
  console.log('🔍 Prüfe Datenbankstatus...\n');

  let allOk = true;

  try {
    // 1. Prüfe profiles
    console.log('1️⃣  Prüfe profiles-Tabelle...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, render_minutes_limit, render_minutes_used')
      .limit(1);

    if (profilesError) {
      console.log('   ❌ Fehler:', profilesError.message);
      allOk = false;
    } else {
      console.log('   ✅ profiles OK');
    }

    // 2. Prüfe clip_token_charges
    console.log('\n2️⃣  Prüfe clip_token_charges-Tabelle...');
    const { data: charges, error: chargesError } = await supabase
      .from('clip_token_charges')
      .select('id')
      .limit(1);

    if (chargesError) {
      console.log('   ❌ Fehler:', chargesError.message);
      allOk = false;
    } else {
      console.log('   ✅ clip_token_charges OK');
    }

    // 3. Prüfe token_credit_events
    console.log('\n3️⃣  Prüfe token_credit_events-Tabelle...');
    const { data: credits, error: creditsError } = await supabase
      .from('token_credit_events')
      .select('id')
      .limit(1);

    if (creditsError) {
      console.log('   ❌ Fehler:', creditsError.message);
      allOk = false;
    } else {
      console.log('   ✅ token_credit_events OK');
    }

    // 4. Prüfe publishing_jobs
    console.log('\n4️⃣  Prüfe publishing_jobs-Tabelle...');
    const { data: jobs, error: jobsError } = await supabase
      .from('publishing_jobs')
      .select('id')
      .limit(1);

    if (jobsError) {
      console.log('   ❌ Fehler:', jobsError.message);
      allOk = false;
    } else {
      console.log('   ✅ publishing_jobs OK');
    }

    console.log('\n' + '━'.repeat(70));

    if (allOk) {
      console.log('\n🎉 Datenbank ist vollständig eingerichtet!\n');
      console.log('Das Token-System ist einsatzbereit:');
      console.log('  ✅ profiles mit render_minutes_limit und render_minutes_used');
      console.log('  ✅ clip_token_charges für Token-Buchungen');
      console.log('  ✅ token_credit_events für Token-Pakete');
      console.log('  ✅ publishing_jobs für Clip-Veröffentlichungen\n');
    } else {
      console.log('\n⚠️  Datenbank ist NICHT vollständig eingerichtet!\n');
      printManualInstructions();
    }

  } catch (error) {
    console.error('\n❌ Unerwarteter Fehler:', error.message);
    printManualInstructions();
  }
}

function printManualInstructions() {
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1];

  console.log('━'.repeat(70));
  console.log('📋 MANUELLE EINRICHTUNG ERFORDERLICH');
  console.log('━'.repeat(70) + '\n');
  console.log('So richtest du die Datenbank ein:\n');
  console.log('1. Öffne das Supabase SQL Dashboard:');
  console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);
  console.log('2. Öffne die Datei: supabase/schema.sql');
  console.log('   im Code-Editor und kopiere den GESAMTEN Inhalt\n');
  console.log('3. Füge den SQL-Code in den Supabase SQL Editor ein\n');
  console.log('4. Klicke auf "RUN" (oder drücke Cmd/Ctrl+Enter)\n');
  console.log('5. Warte, bis alle Statements ausgeführt wurden\n');
  console.log('6. Führe dieses Script erneut aus, um zu prüfen:\n');
  console.log('   node --env-file=.env.local scripts/verify-db.mjs\n');
  console.log('━'.repeat(70) + '\n');
}

checkDatabase();
