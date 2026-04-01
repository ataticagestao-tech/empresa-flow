
const SUPABASE_URL = "https://onobornmnzemgsduscug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ub2Jvcm5tbnplbWdzZHVzY3VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODI3MDE0MCwiZXhwIjoyMDgzODQ2MTQwfQ.KYjTNVPMzGz_aWsNiZiPOyM-KSIvIAlGq0_LBxJmUAo";

const sql = `
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'servico';
`;

async function run() {
    console.log("Aplicando migration: adicionar coluna 'tipo' na tabela vendas...");

    // Try via pg connection
    try {
        const pg = await import("pg");
        const configs = [
            "postgres://postgres.onobornmnzemgsduscug:TQHjl8jKrOVhgKga@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
            "postgres://postgres.onobornmnzemgsduscug:TQHjl8jKrOVhgKga@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
        ];

        for (const connStr of configs) {
            try {
                console.log("Tentando conexao...");
                const client = new pg.default.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
                await client.connect();
                const result = await client.query(sql);
                console.log("Migration aplicada com sucesso!", result);
                await client.end();
                return;
            } catch (e) {
                console.log("Falha nesta config, tentando proxima...", e.message);
            }
        }
    } catch (e) {
        console.log("pg nao disponivel, tentando via REST...");
    }

    // Fallback: REST API
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
    });

    if (response.ok) {
        console.log("Migration aplicada via REST API!");
    } else {
        const text = await response.text();
        console.error("Erro REST:", response.status, text);
    }
}

run().catch(console.error);
