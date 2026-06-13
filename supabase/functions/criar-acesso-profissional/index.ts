import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// =============================================================================
// criar-acesso-profissional
// -----------------------------------------------------------------------------
// Cria um login (auth user) para um FUNCIONÁRIO ver só as comissões dele e
// liga employees.user_id ao usuário criado.
//
// SEGURANÇA: o trigger handle_new_user() vincula todo novo usuário a TODAS as
// empresas (user_companies). Para o profissional NÃO enxergar dados da empresa,
// apagamos esses vínculos logo após criar — assim o RLS por empresa (permissivo)
// devolve vazio em todas as tabelas, e o acesso dele fica restrito à tabela
// `comissoes` + à própria linha de `employees` (policies dedicadas).
// =============================================================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPER_ADMIN_EXACT_EMAILS = [
    "izabelvier@outlook.com",
    "isabelvier@outlook.com",
    "yuriallmeida@gmail.com",
];

function isSuperAdminEmail(email?: string | null) {
    const normalized = String(email || "").trim().toLowerCase();
    return normalized ? SUPER_ADMIN_EXACT_EMAILS.includes(normalized) : false;
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

interface RequestBody {
    employee_id?: string;
    email?: string;
    password?: string;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

        if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
            return jsonResponse({ ok: false, erro: "Variaveis de ambiente nao configuradas" }, 500);
        }

        const authHeader = req.headers.get("Authorization") || "";
        if (!authHeader.startsWith("Bearer ")) {
            return jsonResponse({ ok: false, erro: "Nao autenticado" }, 401);
        }

        const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: callerData, error: callerError } = await callerClient.auth.getUser();
        if (callerError || !callerData?.user) {
            return jsonResponse({ ok: false, erro: "Sessao invalida" }, 401);
        }
        const caller = callerData.user;

        const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        const body = (await req.json()) as RequestBody;
        const employeeId = String(body.employee_id || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!employeeId) return jsonResponse({ ok: false, erro: "employee_id obrigatorio" }, 400);
        if (!email) return jsonResponse({ ok: false, erro: "email obrigatorio" }, 400);
        if (!password || password.length < 6) {
            return jsonResponse({ ok: false, erro: "Senha deve ter no minimo 6 caracteres" }, 400);
        }

        // Carrega o funcionário (service role ignora RLS) para saber a empresa.
        const { data: emp, error: empErr } = await adminClient
            .from("employees")
            .select("id, company_id, name, nome_completo, user_id")
            .eq("id", employeeId)
            .single();
        if (empErr || !emp) {
            return jsonResponse({ ok: false, erro: "Funcionario nao encontrado" }, 404);
        }

        // Autorização: super-admin OU dono/owner da empresa do funcionário.
        let autorizado = isSuperAdminEmail(caller.email);
        if (!autorizado) {
            const { data: comp } = await adminClient
                .from("companies").select("owner_id").eq("id", emp.company_id).maybeSingle();
            if (comp?.owner_id === caller.id) autorizado = true;
        }
        if (!autorizado) {
            const { data: link } = await adminClient
                .from("user_companies").select("role")
                .eq("user_id", caller.id).eq("company_id", emp.company_id).maybeSingle();
            if (link?.role === "owner") autorizado = true;
        }
        if (!autorizado) return jsonResponse({ ok: false, erro: "Permissao negada" }, 403);

        if (emp.user_id) {
            return jsonResponse({ ok: false, erro: "Este funcionario ja possui acesso" }, 400);
        }

        const fullName = String(emp.nome_completo || emp.name || email);

        // 1. Cria o usuário (Admin API ignora "Enable Signups" desligado).
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, is_profissional: true },
        });
        if (createErr || !created?.user) {
            return jsonResponse({ ok: false, erro: createErr?.message || "Falha ao criar usuario" }, 400);
        }
        const newUserId = created.user.id;

        // 2. Neutraliza o autolink: remove TODOS os vínculos com empresas.
        await adminClient.from("user_companies").delete().eq("user_id", newUserId);

        // 3. Liga o funcionário ao usuário.
        const { error: updErr } = await adminClient
            .from("employees").update({ user_id: newUserId }).eq("id", employeeId);
        if (updErr) {
            // rollback: remove o usuário criado para não deixar lixo
            await adminClient.auth.admin.deleteUser(newUserId);
            return jsonResponse({ ok: false, erro: "Falha ao vincular: " + updErr.message }, 400);
        }

        return jsonResponse({ ok: true, userId: newUserId, email });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        return jsonResponse({ ok: false, erro: msg }, 500);
    }
});
