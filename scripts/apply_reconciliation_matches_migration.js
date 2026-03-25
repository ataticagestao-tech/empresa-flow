
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectionString = "postgres://postgres:TQHjl8jKrOVhgKga@db.onobornmnzemgsduscug.supabase.co:5432/postgres";

console.log(`🔌 Conectando ao Supabase para criar tabelas de conciliação...`);

const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    try {
        await client.connect();
        console.log('✅ Conexão estabelecida.');

        const migrationFile = path.join(__dirname, '../supabase/migrations/20260325120000_bank_reconciliation_matches.sql');

        if (!fs.existsSync(migrationFile)) {
            throw new Error(`Arquivo não encontrado: ${migrationFile}`);
        }

        const sql = fs.readFileSync(migrationFile, 'utf8');
        console.log(`📄 Aplicando: ${path.basename(migrationFile)}`);

        await client.query(sql);
        console.log('🎉 Tabelas bank_reconciliation_matches e adjustments criadas com SUCESSO!');

    } catch (err) {
        console.error('❌ Erro:', err);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Conexão encerrada.');
    }
}

runMigration();
