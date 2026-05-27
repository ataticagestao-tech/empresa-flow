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

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            const value = change.value as CloudValue;

            // mensagens recebidas → encaminha pro agente
            if (change.field === "messages" && value?.messages?.length) {
                const phoneNumberId = value.metadata?.phone_number_id ?? "";
                for (const msg of value.messages) {
                    const contact = value.contacts?.find((c) => c.wa_id === msg.from);
                    const evolutionLike = toEvolutionPayload(msg, contact, phoneNumberId);
                    // fire-and-forget (nao bloqueia ack do webhook)
                    forwardToAgente(evolutionLike);
                }
            }

            // statuses → por ora apenas log; refinar depois (TODO: atualizar cadastro_mensagens)
            if (change.field === "messages" && value?.statuses?.length) {
                for (const st of value.statuses) {
                    console.log(
                        `[whatsapp-cloud-webhook] status: msgId=${st.id} status=${st.status} to=${st.recipient_id}`,
                    );
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
