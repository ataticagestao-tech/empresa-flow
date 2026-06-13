#!/usr/bin/env node
// ============================================================================
// Helper de admin do banco (Supabase Postgres) — para aplicar migrations e
// rodar queries direto, sem depender do SQL Editor.
//
// Lê a connection string de SUPABASE_DB_URL (env) ou de .env.local / .env.
// O .env.local é gitignored — o segredo NÃO vai pro git nem pro chat.
//
// Pegue a string em: Supabase → Project Settings → Database →
//   "Connection string" → aba "Session pooler" (URI). Algo como:
//   postgresql://postgres.onobornmnzemgsduscug:SENHA@aws-0-<region>.pooler.supabase.com:5432/postgres
// e coloque em empresa-flow/.env.local:
//   SUPABASE_DB_URL=postgresql://...
//
// Uso:
//   node scripts/db.mjs file supabase/migrations/20260613120000_repasses_comissao.sql
//   node scripts/db.mjs query "select count(*) from repasses_comissao"
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { Client } from "pg";

function readEnv(key) {
  if (process.env[key]) return process.env[key];
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const txt = readFileSync(f, "utf8");
    const m = txt.match(new RegExp("^\\s*" + key + "\\s*=\\s*(.+?)\\s*$", "m"));
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

// Config do banco. Preferimos a SENHA numa var separada (SUPABASE_DB_PASSWORD)
// para não depender de URL-encoding — senhas com @ : / # quebram a URI.
function buildClientConfig() {
  const url = readEnv("SUPABASE_DB_URL");
  const pwd = readEnv("SUPABASE_DB_PASSWORD");
  if (pwd) {
    return {
      host: readEnv("SUPABASE_DB_HOST") || "aws-1-us-east-2.pooler.supabase.com",
      port: Number(readEnv("SUPABASE_DB_PORT") || 5432),
      user: readEnv("SUPABASE_DB_USER") || "postgres.onobornmnzemgsduscug",
      database: readEnv("SUPABASE_DB_NAME") || "postgres",
      password: pwd,
      ssl: { rejectUnauthorized: false },
    };
  }
  if (url) return { connectionString: url, ssl: { rejectUnauthorized: false } };
  return null;
}

const [, , mode, arg] = process.argv;
const config = buildClientConfig();

if (!config) {
  console.error("✗ Credencial não encontrada. Crie empresa-flow/.env.local com a SENHA do banco:\n  SUPABASE_DB_PASSWORD=suaSenhaAqui\n(ou a URI completa em SUPABASE_DB_URL)");
  process.exit(1);
}
if (!mode || !["file", "query"].includes(mode) || !arg) {
  console.error("Uso: node scripts/db.mjs file <caminho.sql>   |   node scripts/db.mjs query \"<SQL>\"");
  process.exit(1);
}

const sql = mode === "file" ? readFileSync(arg, "utf8") : arg;

const client = new Client(config);
try {
  await client.connect();
  const res = await client.query(sql);
  const list = Array.isArray(res) ? res : [res];
  list.forEach((r, i) => {
    console.log(`-- statement ${i + 1}: ${r.command} ${r.rowCount ?? ""}`);
    if (r.rows?.length) console.table(r.rows);
  });
  console.log("✓ ok");
} catch (e) {
  console.error("✗ erro:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
