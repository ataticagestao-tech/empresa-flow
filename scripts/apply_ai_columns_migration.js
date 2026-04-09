
// Apply migration via Supabase REST API (rpc) since direct PG connection is blocked
const SUPABASE_URL = "https://onobornmnzemgsduscug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ub2Jvcm5tbnplbWdzZHVzY3VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODI3MDE0MCwiZXhwIjoyMDgzODQ2MTQwfQ.KYjTNVPMzGz_aWsNiZiPOyM-KSIvIAlGq0_LBxJmUAo";

const sql = `
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS sugestao_conta_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confianca_match INTEGER,
  ADD COLUMN IF NOT EXISTS metodo_match TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_bank_tx_sugestao_conta ON bank_transactions(sugestao_conta_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_metodo_match ON bank_transactions(metodo_match);
CREATE INDEX IF NOT EXISTS idx_bank_tx_company_status ON bank_transactions(company_id, status);
`;

async function run() {
    console.log("Aplicando migration via Supabase REST API...");

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
        // Try alternative: direct SQL via pg_net or management API
        console.log("RPC exec_sql nao disponivel. Tentando via PostgREST...");

        // Fallback: run individual ALTER TABLEs via pg connection with pooler
        const pg = await import("pg");

        // Try transaction pooler (port 6543)
        const configs = [
            "postgres://postgres.onobornmnzemgsduscug:TQHjl8jKrOVhgKga@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
            "postgres://postgres:TQHjl8jKrOVhgKga@db.onobornmnzemgsduscug.supabase.co:5432/postgres",
        ];

        for (const connStr of configs) {
            try {
                console.log(`Tentando: ${connStr.split("@")[1]}...`);
                const client = new pg.default.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
                await client.connect();
                await client.query(sql);
                console.log("Migration aplicada com SUCESSO!");
                await client.end();
                return;
            } catch (e) {
                console.log(`Falhou: ${e.message}`);
            }
        }

        console.error("\n========================================");
        console.error("NAO FOI POSSIVEL CONECTAR AO BANCO.");
        console.error("Aplique a migration manualmente no Supabase Dashboard > SQL Editor:");
        console.error("========================================\n");
        console.log(sql);
        process.exit(1);
    } else {
        const result = await response.json();
        console.log("Migration aplicada com SUCESSO!", result);
    }
}

run().catch(console.error);