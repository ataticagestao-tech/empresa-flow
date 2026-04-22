import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
    if (!normalized) return false;
    return SUPER_ADMIN_EXACT_EMAILS.includes(normalized);
}

interface RequestBody {
    userId?: string;
    password?: string;
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

        // Cliente com o JWT do chamador para identificar quem esta pedindo
        const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: callerData, error: callerError } = await callerClient.auth.getUser();
        if (callerError || !callerData?.user) {
            return jsonResponse({ ok: false, erro: "Sessao invalida" }, 401);
        }
        const caller = callerData.user;

        // Cliente admin para operacoes privilegiadas
        const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        // Verifica se o chamador e super admin (email whitelist ou admin_users)
        let isSuperAdmin = isSuperAdminEmail(caller.email);
        if (!isSuperAdmin) {
            const { data: adminRow } = await adminClient
                .from("admin_users")
                .select("is_super_admin")
                .eq("user_id", caller.id)
                .single();
            isSuperAdmin = Boolean(adminRow?.is_super_admin);
        }

        if (!isSuperAdmin) {
            return jsonResponse({ ok: false, erro: "Permissao negada" }, 403);
        }

        const body = (await req.json()) as RequestBody;
        const userId = String(body.userId || "").trim();
        const password = String(body.password || "");

        if (!userId) {
            return jsonResponse({ ok: false, erro: "userId obrigatorio" }, 400);
        }
        if (!password || password.length < 6) {
            return jsonResponse({ ok: false, erro: "Senha deve ter no minimo 6 caracteres" }, 400);
        }

        const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
            password,
        });

        if (updateError) {
            return jsonResponse({ ok: false, erro: updateError.message }, 400);
        }

        // Auditoria leve: registra quem alterou a senha (best-effort, nao falha se tabela nao existir)
        try {
            await adminClient.from("profiles").update({
                updated_at: new Date().toISOString(),
            }).eq("id", userId);
        } catch {
            // ignore
        }

        return jsonResponse({ ok: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        return jsonResponse({ ok: false, erro: msg }, 500);
    }
});
