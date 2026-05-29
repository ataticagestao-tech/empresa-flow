// ============================================================
// agente-tool-enviar_overnight — Edge Function (Deno)
// Tool chamada pelo agente-orquestrador. Dispara o Overnight
// (relatorio financeiro diario em PDF) na hora, enviando pros
// destinatarios ja configurados em overnight_config via WhatsApp.
// Encaminha pra disparar-overnight-agendado com forcar=true.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agente-user-id, x-agente-acesso-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Input {
    empresa_id: string;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) {
            return jsonResp({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);
        }

        const input = (await req.json()) as Input;
        if (!input.empresa_id) {
            return jsonResp({ error: "empresa_id obrigatório" }, 400);
        }

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId,
            p_acesso_id: acessoId,
            p_company_id: input.empresa_id,
        });
        if (!pode) return jsonResp({ error: "Sem acesso a essa empresa" }, 403);

        // dispara o overnight agora (ignora janela de horario e dedup do dia)
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/disparar-overnight-agendado`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
            },
            body: JSON.stringify({ empresa_id: input.empresa_id, forcar: true }),
        });
        const body: any = await resp.json().catch(() => ({}));

        if (!resp.ok || body?.ok === false) {
            return jsonResp({
                ok: true,
                enviado: false,
                motivo: body?.erro || `Falha ao disparar (HTTP ${resp.status})`,
            });
        }

        // Nenhuma config elegivel = WhatsApp do overnight nao ativado pra essa empresa
        if (!body?.resultados || body.disparados === 0) {
            return jsonResp({
                ok: true,
                enviado: false,
                motivo: "O envio do Overnight por WhatsApp não está ativado pra essa empresa. Pra ativar, vá em Configurações > Overnight, ligue o WhatsApp e cadastre os números de destino.",
            });
        }

        const r = (body.resultados as any[]).find((x) => x.company_id === input.empresa_id) ?? body.resultados[0];

        if (r?.status === "sucesso") {
            return jsonResp({ ok: true, enviado: true, destinos: r.destinos_ok ?? [] });
        }
        if (r?.status === "parcial") {
            return jsonResp({
                ok: true,
                enviado: true,
                parcial: true,
                destinos: r.destinos_ok ?? [],
                falhas: (r.destinos_erro ?? []).map((e: any) => `${e.phone}: ${e.erro}`),
            });
        }
        if (r?.status === "pulado") {
            return jsonResp({ ok: true, enviado: false, motivo: r.motivo || "Envio pulado" });
        }
        return jsonResp({
            ok: true,
            enviado: false,
            motivo: (r?.destinos_erro ?? []).map((e: any) => `${e.phone}: ${e.erro}`).join(" | ") || r?.motivo || "Falha no envio",
        });
    } catch (err: any) {
        return jsonResp({ error: err?.message || String(err) }, 500);
    }
});

function jsonResp(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
