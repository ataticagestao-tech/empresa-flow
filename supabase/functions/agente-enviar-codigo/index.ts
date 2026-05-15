// agente-enviar-codigo — gera código de 6 dígitos e envia via WhatsApp pra o número
// Chamada do frontend quando admin cadastra um novo acesso ou clica em "reenviar código".
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

interface Input {
    acesso_id: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return j({ error: "Authorization obrigatória" }, 401);
        const jwt = authHeader.replace("Bearer ", "").trim();
        if (!jwt) return j({ error: "Token vazio" }, 401);

        // Valida o JWT do usuário usando service_key (pode validar JWTs de qualquer user)
        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: userData, error: errUser } = await service.auth.getUser(jwt);
        if (errUser || !userData?.user) return j({ error: "Não autenticado: " + (errUser?.message || "JWT inválido") }, 401);
        const userId = userData.user.id;

        const { acesso_id } = (await req.json()) as Input;
        if (!acesso_id) return j({ error: "acesso_id obrigatório" }, 400);

        // Busca o acesso e valida que o user tem permissão na empresa
        const { data: acesso, error: errAc } = await service
            .from("whatsapp_acesso")
            .select("id, phone, nome, status, company_id")
            .eq("id", acesso_id)
            .maybeSingle();

        if (errAc || !acesso) return j({ error: "Acesso não encontrado" }, 404);

        const { data: vinc } = await service
            .from("user_companies")
            .select("id")
            .eq("user_id", userId)
            .eq("company_id", acesso.company_id)
            .maybeSingle();
        if (!vinc) return j({ error: "Você não tem permissão nessa empresa" }, 403);

        if (acesso.status === "verificado") return j({ error: "Esse acesso já está verificado" }, 400);
        if (acesso.status === "revogado") return j({ error: "Acesso revogado — não dá pra reenviar código" }, 400);

        // Gera código novo via RPC (também reseta tentativas)
        const { data: codigo, error: errCod } = await service.rpc("agente_gerar_codigo_verificacao", {
            p_acesso_id: acesso.id,
        });
        if (errCod) return j({ error: errCod.message }, 500);

        // Reseta status pra pendente caso esteja bloqueado
        await service.from("whatsapp_acesso").update({ status: "pendente" }).eq("id", acesso.id);

        // Envia mensagem via Evolution
        const evoUrl = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;
        const texto = `Oi, ${acesso.nome}! Seu código de acesso pra usar o Assistente Tatica é:\n\n*${codigo}*\n\nResponde só esse número aqui pra confirmar. Expira em 10 minutos.`;

        const evoResp = await fetch(evoUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ number: acesso.phone, text: texto }),
        });

        if (!evoResp.ok) {
            const errBody = await evoResp.text();
            return j({ error: `Evolution falhou: ${errBody.slice(0, 200)}` }, 500);
        }

        return j({ ok: true, mensagem: "Código enviado pelo WhatsApp. Expira em 10 minutos." });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
