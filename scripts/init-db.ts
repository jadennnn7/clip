import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Fehlende Umgebungsvariablen');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function initDatabase() {
  try {
    console.log('📖 Lese schema.sql...');
    const schemaPath = join(process.cwd(), 'supabase', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('🚀 Spiele Schema ein...');

    // Schema in kleinere Chunks aufteilen für bessere Fehlerbehandlung
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ';';

      // Skip Kommentare und leere Zeilen
      if (stmt.match(/^\s*--/) || stmt.match(/^\s*$/)) {
        continue;
      }

      try {
        const { error } = await supabase.rpc('exec_sql', { sql: stmt });

        if (error) {
          // Ignoriere "already exists" Fehler
          if (error.message?.includes('already exists') ||
              error.message?.includes('duplicate key')) {
            console.log(`⚠️  Überspringe (existiert bereits): ${stmt.substring(0, 60)}...`);
          } else {
            console.error(`❌ Fehler bei Statement ${i + 1}:`, error.message);
            console.error(`   SQL: ${stmt.substring(0, 100)}...`);
            errorCount++;
          }
        } else {
          successCount++;
          if (successCount % 10 === 0) {
            console.log(`✅ ${successCount} Statements erfolgreich`);
          }
        }
      } catch (err: any) {
        console.error(`❌ Exception bei Statement ${i + 1}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📊 Zusammenfassung:');
    console.log(`   ✅ Erfolgreich: ${successCount}`);
    console.log(`   ❌ Fehler: ${errorCount}`);

    if (errorCount === 0) {
      console.log('\n🎉 Datenbankschema erfolgreich eingespielt!');
    } else {
      console.log('\n⚠️  Schema teilweise eingespielt. Prüfe die Fehler oben.');
    }

  } catch (error: any) {
    console.error('❌ Fataler Fehler:', error.message);
    process.exit(1);
  }
}

initDatabase();
