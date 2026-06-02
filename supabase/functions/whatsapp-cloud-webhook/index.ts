// ============================================================
// whatsapp-cloud-webhook — Edge Function (Deno)
//
// Webhook oficial WhatsApp Business Cloud API (Meta Graph).
//
// GET  → handshake de verificação (hub.challenge)
// POST → recebe eventos:
//   * messages       → traduz payload Cloud para formato Evolution
//                      e encaminha pro agente-orquestrador, que ja
//                      sabe processar mensagens recebidas
//   * statuses       → atualiza status de entrega (placeholder por
//                      enquanto; log apenas)
//   * template       → status de aprovacao de template (log)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function service() {
    return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── tipos parciais do payload Cloud ────────────────────────────

interface CloudMessage {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; mime_type: string; caption?: string };
    document?: { id: string; mime_type: string; filename?: string; caption?: string };
    audio?: { id: string; mime_type: string; voice?: boolean };
    video?: { id: string; mime_type: string; caption?: string };
    interactive?: any;
    button?: any;
    location?: any;
    context?: { from: string; id: string };
    referral?: Record<string, unknown>; // CTWA: anúncio que originou a conversa
}

interface CloudContact {
    profile?: { name?: string };
    wa_id?: string;
}

interface CloudStatus {
    id: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    recipient_id: string;
    conversation?: { id: string };
    errors?: any[];
}

interface CloudValue {
    messaging_product: string;
    metadata: { display_phone_number: string; phone_number_id: string };
    messages?: CloudMessage[];
    contacts?: CloudContact[];
    statuses?: CloudStatus[];
}

interface CloudChange {
    value: CloudValue | any;
    field: string;
}

interface CloudWebhookPayload {
    object: string;
    entry: Array<{ id: string; changes: CloudChange[] }>;
}

// ── traducao Cloud → formato Evolution-like ────────────────────

function toEvolutionPayload(
    msg: CloudMessage,
    contact: CloudContact | undefined,
    phoneNumberId: string,
): Record<string, unknown> {
    const jid = `${msg.from}@s.whatsapp.net`;

    // Mapa de message body
    let message: Record<string, unknown> = {};
    let messageType = "conversation";

    if (msg.type === "text" && msg.text) {
        message = { conversation: msg.text.body };
        messageType = "conversation";
    } else if (msg.type === "image" && msg.image) {
        message = {
            imageMessage: {
                mimetype: msg.image.mime_type,
                caption: msg.image.caption,
                cloudMediaId: msg.image.id,
            },
        };
        messageType = "imageMessage";
    } else if (msg.type === "document" && msg.document) {
        message = {
            documentMessage: {
                mimetype: msg.document.mime_type,
                fileName: msg.document.filename,
                caption: msg.document.caption,
                cloudMediaId: msg.document.id,
            },
        };
        messageType = "documentMessage";
    } else if (msg.type === "audio" && msg.audio) {
        message = {
            audioMessage: {
                mimetype: msg.audio.mime_type,
                ptt: !!msg.audio.voice,
                cloudMediaId: msg.audio.id,
            },
        };
        messageType = "audioMessage";
    } else if (msg.type === "video" && msg.video) {
        message = {
            videoMessage: {
                mimetype: msg.video.mime_type,
                caption: msg.video.caption,
                cloudMediaId: msg.video.id,
            },
        };
        messageType = "videoMessage";
    } else {
        // fallback: serializa como conversation com tipo entre colchetes
        message = { conversation: `[${msg.type}]` };
        messageType = "conversation";
    }

    return {
        event: "messages.upsert",
        instance: "cloud", // marca origem; agente nao usa isso pra logica
        data: {
            key: {
                remoteJid: jid,
                fromMe: false,
                id: msg.id,
            },
            pushName: contact?.profile?.name ?? null,
            message,
            messageType,
            messageTimestamp: Number(msg.timestamp),
            // marcador pra debug
            source: "whatsapp_cloud",
            cloudPhoneNumberId: phoneNumberId,
        },
    };
}

// ── persistência no inbox ──────────────────────────────────────

/** Extrai conteúdo legível + tipo + mídia de uma mensagem Cloud, pro inbox. */
function paraInbox(msg: CloudMessage): { tipo: string; conteudo: string; midia: Record<string, unknown> | null } {
    if (msg.type === "text" && msg.text) {
        return { tipo: "texto", conteudo: msg.text.body, midia: null };
    }
    if (msg.type === "image" && msg.image) {
        return {
            tipo: "imagem",
            conteudo: msg.image.caption || "[imagem]",
            midia: { mime: msg.image.mime_type, cloudMediaId: msg.image.id },
        };
    }
    if (msg.type === "document" && msg.document) {
        return {
            tipo: "documento",
            conteudo: msg.document.caption || msg.document.filename || "[documento]",
            midia: { mime: msg.document.mime_type, cloudMediaId: msg.document.id, filename: msg.document.filename },
        };
    }
    if (msg.type === "audio" && msg.audio) {
        return { tipo: "audio", conteudo: "[áudio]", midia: { mime: msg.audio.mime_type, cloudMediaId: msg.audio.id } };
    }
    if (msg.type === "video" && msg.video) {
        return {
            tipo: "video",
            conteudo: msg.video.caption || "[vídeo]",
            midia: { mime: msg.video.mime_type, cloudMediaId: msg.video.id },
        };
    }
    if (msg.type === "interactive" || msg.type === "button") {
        const t = msg.interactive?.button_reply?.title
            || msg.interactive?.list_reply?.title
            || msg.button?.text
            || "[resposta]";
        return { tipo: "interativo", conteudo: t, midia: null };
    }
    return { tipo: "texto", conteudo: `[${msg.type}]`, midia: null };
}

/** Grava a mensagem recebida no inbox (upsert conversa + insert msg). Não pode quebrar o ack. */
async function registrarInbound(msg: CloudMessage, contact: CloudContact | undefined): Promise<void> {
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    try {
        const { tipo, conteudo, midia } = paraInbox(msg);
        const { error } = await service().rpc("whatsapp_registrar_msg", {
            p_phone: msg.from,
            p_direcao: "entrada",
            p_autor: "contato",
            p_conteudo: conteudo,
            p_wa_message_id: msg.id,
            p_tipo: tipo,
            p_nome: contact?.profile?.name ?? null,
            p_midia: midia,
            p_referral: msg.referral ?? null,
            p_status: null,
        });
        if (error) console.error("[whatsapp-cloud-webhook] registrarInbound falhou:", error.message);
    } catch (err) {
        console.error("[whatsapp-cloud-webhook] exceção registrarInbound:", err);
    }
}

/** Atualiza o status de entrega de uma mensagem enviada (sent/delivered/read/failed). */
async function atualizarStatus(st: CloudStatus): Promise<void> {
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    try {
        const { error } = await service()
            .from("whatsapp_mensagens")
            .update({ status: st.status })
            .eq("wa_message_id", st.id);
        if (error) console.error("[whatsapp-cloud-webhook] atualizarStatus falhou:", error.message);
    } catch (err) {
        console.error("[whatsapp-cloud-webhook] exceção atualizarStatus:", err);
    }
}

async function forwardToAgente(evolutionPayload: Record<string, unknown>): Promise<void> {
    if (!SUPABASE_URL || !SERVICE_KEY) {
        console.error("[whatsapp-cloud-webhook] SUPABASE_URL/SERVICE_KEY ausentes; nao consigo encaminhar");
        return;
    }
    try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/agente-orquestrador`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
            },
            body: JSON.stringify(evolutionPayload),
        });
        if (!resp.ok) {
            const text = await resp.text();
            console.error(
                `[whatsapp-cloud-webhook] agente-orquestrador retornou ${resp.status}: ${text.slice(0, 300)}`,
            );
        }
    } catch (err) {
        console.error("[whatsapp-cloud-webhook] erro encaminhando pro agente:", err);
    }
}

async function handlePost(req: Request): Promise<Response> {
    let payload: CloudWebhookPayload;
    try {
        payload = (await req.json()) as CloudWebhookPayload;
    } catch (err) {
        console.error("[whatsapp-cloud-webhook] body invalido:", err);
        return new Response("EVENT_RECEIVED", {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
    }

    if (payload?.object !== "whatsapp_business_account") {
        return new Response("EVENT_RECEIVED", {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
    }

    const tasks: Promise<void>[] = [];

    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            const value = change.value as CloudValue;

            // mensagens recebidas → grava no inbox E encaminha pro agente
            if (change.field === "messages" && value?.messages?.length) {
                const phoneNumberId = value.metadata?.phone_number_id ?? "";
                for (const msg of value.messages) {
                    const contact = value.contacts?.find((c) => c.wa_id === msg.from);
                    const evolutionLike = toEvolutionPayload(msg, contact, phoneNumberId);
                    // 1) Grava a mensagem recebida no inbox (conversa + mensagem).
                    // 2) Encaminha pro agente-orquestrador (IA responde).
                    // Nao bloqueia o ack do webhook, mas registra as tarefas pra
                    // manter o isolate vivo via EdgeRuntime.waitUntil (senao o
                    // runtime do Supabase mata o forward antes de chegar no agente).
                    tasks.push(registrarInbound(msg, contact));
                    tasks.push(forwardToAgente(evolutionLike));
                }
            }

            // statuses → atualiza status de entrega da mensagem enviada
            if (change.field === "messages" && value?.statuses?.length) {
                for (const st of value.statuses) {
                    console.log(
                        `[whatsapp-cloud-webhook] status: msgId=${st.id} status=${st.status} to=${st.recipient_id}`,
                    );
                    tasks.push(atualizarStatus(st));
                }
            }

            // aprovacao/rejeicao de template
            if (change.field === "message_template_status_update") {
                console.log(
                    "[whatsapp-cloud-webhook] template status:",
                    JSON.stringify(value),
                );
            }
        }
    }

    if (tasks.length) {
        const pending = Promise.all(tasks);
        const edgeWaitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
        if (typeof edgeWaitUntil === "function") {
            edgeWaitUntil(pending);
        } else {
            // ambiente sem EdgeRuntime: aguarda pra nao perder a tarefa
            await pending;
        }
    }

    return new Response("EVENT_RECEIVED", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);

    if (req.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (!VERIFY_TOKEN) {
            return new Response("WHATSAPP_VERIFY_TOKEN nao configurado no servidor", {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "text/plain" },
            });
        }

        if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
            return new Response(challenge, {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "text/plain" },
            });
        }

        return new Response("verify token invalido", {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
    }

    if (req.method === "POST") {
        return await handlePost(req);
    }

    return new Response("method not allowed", {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
});
