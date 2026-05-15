// ============================================================
// agente-polling — Edge Function (Deno)
// A cada chamada (cron a cada 30s), pergunta pra Evolution
// "tem mensagens novas?" e processa as não-respondidas.
// Bypassa o webhook do Evolution que estava com problema.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

interface MensagemEvolution {
    key: {
        id: string;
        remoteJid: string;
        fromMe: boolean;
        remoteJidAlt?: string;
        addressingMode?: string;
    };
    message?: {
        conversation?: string;
        extendedTextMessage?: { text?: string };
    };
    messageTimestamp: number;
    pushName?: string;
}

function extrairTexto(m: MensagemEvolution): string {
    return (m.message?.conversation || m.message?.extendedTextMessage?.text || "").trim();
}

serve(async (_req: Request) => {
    if (_req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const evoBase = EVOLUTION_API_URL.replace(/\/$/, "");

    try {
        // 1. Busca mensagens recentes da Evolution (últimas 50 chats)
        const resp = await fetch(`${evoBase}/chat/findMessages/${EVOLUTION_INSTANCE}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
                where: { key: { fromMe: false } },
                limit: 30,
            }),
        });

        if (!resp.ok) {
            const t = await resp.text();
            return jsonResp({ ok: false, erro: `Evolution ${resp.status}: ${t.slice(0, 300)}` }, 500);
        }

        const respData = await resp.json();
        const mensagens: MensagemEvolution[] =
            (Array.isArray(respData) ? respData : respData?.messages?.records || respData?.records || []) as MensagemEvolution[];

        if (!Array.isArray(mensagens) || mensagens.length === 0) {
            return jsonResp({ ok: true, msg: "sem mensagens", total_resp: respData });
        }

        // 2. Filtra mensagens recentes (últimos 30 min) que ainda não foram processadas
        const cutoff = Math.floor(Date.now() / 1000) - 30 * 60;
        const candidatas = mensagens.filter(
            (m) =>
                m?.key?.id &&
                !m.key.fromMe &&
                m.messageTimestamp >= cutoff &&
                extrairTexto(m).length > 0,
        );

        if (candidatas.length === 0) {
            return jsonResp({ ok: true, msg: "sem candidatas recentes", total_msgs: mensagens.length });
        }

        // 3. Pra cada candidata, processa se não foi marcada como processada
        const resultados: any[] = [];
        for (const m of candidatas) {
            const msgId = m.key.id;
            const jidReal = m.key.remoteJidAlt || m.key.remoteJid;
            const phone = jidReal.split("@")[0];
            const texto = extrairTexto(m);

            // checa se já processada
            const { data: existente } = await service
                .from("agente_msg_processadas")
                .select("message_id")
                .eq("message_id", msgId)
                .maybeSingle();

            if (existente) {
                resultados.push({ msgId, status: "pulada", motivo: "já processada" });
                continue;
            }

            // marca ANTES de chamar pra evitar dupla-execução por reentrância
            await service.from("agente_msg_processadas").insert({
                message_id: msgId,
                from_phone: phone,
                conteudo: texto.slice(0, 500),
            });

            // chama o orquestrador como se fosse webhook
            const orquestradorResp = await fetch(`${SUPABASE_URL}/functions/v1/agente-orquestrador`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event: "messages.upsert",
                    instance: EVOLUTION_INSTANCE,
                    data: {
                        key: {
                            remoteJid: m.key.remoteJid,
                            remoteJidAlt: m.key.remoteJidAlt,
                            fromMe: false,
                            id: msgId,
                        },
                        message: { conversation: texto },
                        pushName: m.pushName || null,
                        messageTimestamp: m.messageTimestamp,
                    },
                }),
            });

            const orqBody = await orquestradorResp.json().catch(() => ({}));
            resultados.push({
                msgId,
                phone,
                texto: texto.slice(0, 80),
                status: orquestradorResp.ok ? "processada" : "erro",
                resposta_orq: orqBody,
            });
        }

        return jsonResp({ ok: true, processadas: resultados.length, resultados });
    } catch (err: any) {
        return jsonResp({ ok: false, erro: err?.message || String(err) }, 500);
    }
});

function jsonResp(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
