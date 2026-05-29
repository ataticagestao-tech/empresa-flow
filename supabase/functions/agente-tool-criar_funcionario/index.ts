// agente-tool-criar_funcionario — cria funcionário (employees).
// Só CLT/temporário/estágio (regra da folha). PJ/autônomo NÃO entram aqui.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agente-user-id, x-agente-acesso-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIPOS_VALIDOS = ["clt", "temporario", "estagio"];

interface Input {
    empresa_id: string;
    nome: string;
    cpf?: string;
    cargo?: string;
    salario?: number;
    tipo_contrato?: string;   // clt | temporario | estagio
    data_admissao?: string;   // YYYY-MM-DD
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);
        if (!input.nome) return j({ error: "nome obrigatório" }, 400);

        const tipo = (input.tipo_contrato || "clt").toLowerCase();
        if (!TIPOS_VALIDOS.includes(tipo)) {
            return j({ error: `tipo_contrato inválido. A folha só aceita: clt, temporario ou estagio. Pra PJ/autônomo, cadastre como fornecedor.` }, 400);
        }

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const payload: Record<string, unknown> = {
            company_id: input.empresa_id,
            name: toTitleCase(input.nome.trim()),
            nome_completo: toTitleCase(input.nome.trim()),
            tipo_contrato: tipo,
            status: "ativo",
        };
        if (input.cpf) payload.cpf = input.cpf;
        if (input.cargo) payload.role = input.cargo;
        if (input.salario && input.salario > 0) {
            payload.salary = input.salario;
            payload.salario_base = input.salario;
        }
        if (input.data_admissao) payload.hire_date = input.data_admissao;

        const { data, error } = await service
            .from("employees")
            .insert(payload)
            .select("id, name, nome_completo, cpf, role, tipo_contrato, salary")
            .single();

        if (error) return j({ error: error.message }, 500);

        return j({ ok: true, funcionario: data });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function toTitleCase(s: string): string {
    return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
