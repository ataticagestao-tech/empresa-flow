// Apply employees status constraint fix via Supabase REST API
const SUPABASE_URL = "https://onobornmnzemgsduscug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ub2Jvcm5tbnplbWdzZHVzY3VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODI3MDE0MCwiZXhwIjoyMDgzODQ2MTQwfQ.KYjTNVPMzGz_aWsNiZiPOyM-KSIvIAlGq0_LBxJmUAo";

const sql = `
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_status_check;

UPDATE public.employees SET status = lower(trim(status))
  WHERE status IS DISTINCT FROM lower(trim(status));

ALTER TABLE public.employees
  ADD CONSTRAINT employees_status_check
  CHECK (lower(status) IN ('ativo', 'inativo', 'ferias', 'afastado', 'demitido'));

ALTER TABLE public.employees ALTER COLUMN status SET DEFAULT 'ativo';
`;

async function run() {
    console.log("Aplicando fix employees_status_check...");

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
    });

    const text = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", text);

    if (response.ok) {
        console.log("Migration aplicada com sucesso!");
    } else {
        console.error("Erro ao aplicar migration");
    }
}

run();
