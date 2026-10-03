import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Fehlende Umgebungsvariablen');
  process.exit(1);
}

async function executeSql(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SQL execution failed: ${response.status} ${error}`);
  }

  return response.json();
}

async function initDatabase() {
  try {
    console.log('📖 Lese schema.sql...');
    const schemaPath = join(__dirname, '..', 'supabase', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('🚀 Spiele Schema über Supabase API ein...\n');

    // Versuche, das Schema auszuführen
    try {
      await executeSql(schema);
      console.log('✅ Schema erfolgreich eingespielt!');
    } catch (err) {
      // Falls die exec_sql Funktion nicht existiert, müssen wir einen anderen Weg gehen
      if (err.message.includes('not found') || err.message.includes('does not exist')) {
        console.log('\n⚠️  Die exec_sql RPC-Funktion existiert nicht.');
        console.log('\n📋 Bitte führe das Schema manuell über das Supabase Dashboard aus:');
        console.log('\n1. Gehe zu: https://supabase.com/dashboard/project/' + SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] + '/sql');
        console.log('2. Öffne die Datei: supabase/schema.sql');
        console.log('3. Kopiere den gesamten Inhalt');
        console.log('4. Füge ihn in den SQL Editor ein und klicke auf "Run"');
        console.log('\nAlternativ: Setze DATABASE_URL in .env.local und führe dieses Script aus.');
      } else {
        throw err;
      }
    }

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  }
}

initDatabase();
