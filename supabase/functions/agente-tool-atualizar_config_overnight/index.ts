// agente-tool-atualizar_config_overnight — ajusta config do Overnight da empresa:
// horário de envio, números de destino e ligar/desligar o WhatsApp.
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
    horario?: string;          // "HH:MM" ou "HH:MM:SS"
    destinos?: string[];       // números (só dígitos, com DDD)
    whatsapp_ativo?: boolean;  // liga/desliga o envio
    mensagem?: string;         // legenda opcional
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const { data: cfg } = await service
            .from("overnight_config")
            .select("id, horario_envio, whatsapp_destinos, whatsapp_ativo")
            .eq("company_id", input.empresa_id)
            .maybeSingle();
        if (!cfg) {
            return j({ ok: true, atualizado: false, motivo: "Essa empresa ainda não tem Overnight configurado. A primeira configuração precisa ser feita em Configurações > Overnight no sistema." });
        }

        const patch: Record<string, unknown> = {};

        if (input.horario !== undefined) {
            const h = normalizarHorario(input.horario);
            if (!h) return j({ error: "horário inválido — use HH:MM (ex: 18:00)" }, 400);
            patch.horario_envio = h;
        }
        if (input.destinos !== undefined) {
            const nums = (input.destinos || []).map((d) => (d || "").replace(/\D/g, "")).filter((d) => d.length >= 10);
            if (nums.length === 0) return j({ error: "nenhum número válido em destinos (precisa DDD + número)" }, 400);
            patch.whatsapp_destinos = nums;
        }
        if (input.whatsapp_ativo !== undefined) patch.whatsapp_ativo = input.whatsapp_ativo;
        if (input.mensagem !== undefined) patch.whatsapp_mensagem = input.mensagem;

        if (Object.keys(patch).length === 0) {
            return j({ error: "Nada pra atualizar — informe horario, destinos, whatsapp_ativo ou mensagem" }, 400);
        }

        const { data, error } = await service
            .from("overnight_config")
            .update(patch)
            .eq("id", cfg.id)
            .select("horario_envio, whatsapp_destinos, whatsapp_ativo")
            .single();

        if (error) return j({ error: error.message }, 500);

        return j({ ok: true, atualizado: true, config: data, campos_alterados: Object.keys(patch) });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function normalizarHorario(s: string): string | null {
    const m = (s || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
