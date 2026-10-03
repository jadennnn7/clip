import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Supabase Connection String aus Umgebungsvariablen bauen
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Extrahiere Projekt-Ref aus URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error('❌ Konnte Projekt-Ref aus SUPABASE_URL nicht extrahieren');
  process.exit(1);
}

// Supabase verwendet JWT für die Authentifizierung, nicht das Password im Connection String
// Wir müssen die Connection-URL aus dem Dashboard verwenden oder über die API
console.log('⚠️  Für direkten DB-Zugriff wird die Connection-String aus dem Supabase Dashboard benötigt.');
console.log('   Bitte gehe zu: https://supabase.com/dashboard/project/' + projectRef + '/settings/database');
console.log('   und kopiere die "Connection string" unter "Connection pooling".\n');

// Verwende Environment Variable DATABASE_URL wenn gesetzt
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('❌ Keine DATABASE_URL gefunden.');
  console.error('   Setze DATABASE_URL in .env.local mit der Connection String aus dem Supabase Dashboard.');
  process.exit(1);
}

async function initDatabase() {
  let sql;

  try {
    console.log('🔌 Verbinde mit Datenbank...');
    sql = postgres(connectionString, {
      max: 1,
      ssl: 'require'
    });

    // Test connection
    await sql`SELECT 1`;
    console.log('✅ Verbindung erfolgreich\n');

    console.log('📖 Lese schema.sql...');
    const schemaPath = join(__dirname, '..', 'supabase', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('🚀 Spiele Schema ein...\n');

    // Führe das gesamte Schema als Transaction aus
    await sql.begin(async sql => {
      await sql.unsafe(schema);
    });

    console.log('✅ Schema erfolgreich eingespielt!');
    console.log('\n🎉 Token-System ist jetzt vollständig eingerichtet!');
    console.log('\nFolgende Tabellen wurden erstellt:');
    console.log('  • profiles (mit render_minutes_limit und render_minutes_used)');
    console.log('  • clip_token_charges (für Token-Buchungen)');
    console.log('  • token_credit_events (für Token-Pakete)');
    console.log('  • publishing_jobs (für Clip-Veröffentlichungen)');
    console.log('  • Alle weiteren Tabellen für Projects, Clips, etc.');

  } catch (error) {
    console.error('❌ Fehler:', error.message);

    // Zeige hilfreiche Hinweise bei häufigen Fehlern
    if (error.message.includes('already exists')) {
      console.log('\n⚠️  Einige Tabellen existieren bereits. Das ist normal bei einer Aktualisierung.');
      console.log('   Das Token-System sollte trotzdem funktionieren.');
    } else if (error.message.includes('connect')) {
      console.log('\n💡 Verbindungsfehler. Prüfe:');
      console.log('   1. Ist die SUPABASE_SERVICE_ROLE_KEY korrekt?');
      console.log('   2. Ist die Region korrekt? (aktuell: eu-central-1)');
      console.log('   3. Ist die Datenbank erreichbar?');
    }

    process.exit(1);
  } finally {
    if (sql) {
      await sql.end();
    }
  }
}

initDatabase();
