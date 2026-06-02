// ============================================================
// enviar-whatsapp — Edge Function (Deno)
//
// Envia mensagem WhatsApp. Roteia entre Evolution API (legado) e
// WhatsApp Business Cloud API (oficial Meta) conforme env
// USE_WHATSAPP_CLOUD=true|false.
//
// Aceita 3 modos no body:
//   1. { phone, text }                            -> texto livre
//   2. { phone, mediaBase64, fileName, ... }      -> mídia/PDF
//   3. { phone, template: { name, params, ... } } -> template Cloud
//
// Cloud API só aceita texto livre dentro da janela de 24h apos
// cliente mandar msg. Fora dela, use template.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
    getCloudConfig,
    isCloudEnabled,
    sendCloudText,
    sendCloudTemplate,
    sendCloudDocument,
} from "../_shared/whatsapp-cloud.ts";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TemplateSpec {
    name: string;
    languageCode?: string;
    bodyParams?: string[];
    /** Link publico do PDF (header DOCUMENT) */
    headerDocumentLink?: string;
    /** OU media_id retornado pelo upload em /media (header DOCUMENT) */
    headerDocumentMediaId?: string;
    headerDocumentFilename?: string;
    headerImageLink?: string;
    headerImageMediaId?: string;
}

interface WhatsAppRequest {
    phone: string;
    text?: string;
    mediaBase64?: string;
    fileName?: string;
    mimeType?: string;
    caption?: string;
    template?: TemplateSpec;
}

/** Normaliza telefone para Evolution: 12 ou 13 digitos, com 9 extra se cel BR */
function normalizePhoneEvolution(raw: string): string | null {
    if (!raw) return null;
    let digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("0")) digits = digits.slice(1);
    if (!digits.startsWith("55")) {
        if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
        else return null;
    }
    if (digits.length < 12 || digits.length > 13) return null;
    return digits;
}

async function sendViaEvolution(req: WhatsAppRequest): Promise<Response> {
    if (!EVOLUTION_API_KEY) {
        return new Response(
            JSON.stringify({ error: "EVOLUTION_API_KEY nao configurada" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const normalized = normalizePhoneEvolution(req.phone);
    if (!normalized) {
        return new Response(
            JSON.stringify({ error: `Telefone invalido: ${req.phone}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const isMedia = !!req.mediaBase64;
    const url = isMedia
        ? `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendMedia/${EVOLUTION_INSTANCE}`
        : `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;

    const payload: Record<string, unknown> = isMedia
        ? {
              number: normalized,
              mediatype: "document",
              mimetype: req.mimeType ?? "application/pdf",
              media: req.mediaBase64,
              fileName: req.fileName ?? "documento.pdf",
              caption: req.caption ?? req.text ?? "",
          }
        : { number: normalized, text: req.text };

    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify(payload),
    });
    const bodyText = await resp.text();
    let data: any;
    try {
        data = JSON.parse(bodyText);
    } catch {
        data = { raw: bodyText };
    }

    if (!resp.ok) {
        return new Response(
            JSON.stringify({
                error: data?.message || data?.error || `Evolution retornou ${resp.status}`,
                details: data,
            }),
            { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    return new Response(
        JSON.stringify({ ok: true, provider: "evolution", phone: normalized, response: data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
}

async function sendViaCloud(req: WhatsAppRequest): Promise<Response> {
    const cfg = getCloudConfig();
    if (!cfg) {
        return new Response(
            JSON.stringify({ error: "WhatsApp Cloud nao configurado (faltam secrets)" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    // Template tem prioridade
    if (req.template) {
        const result = await sendCloudTemplate(cfg, {
            to: req.phone,
            templateName: req.template.name,
            languageCode: req.template.languageCode,
            bodyParams: req.template.bodyParams,
            headerDocument: (req.template.headerDocumentLink || req.template.headerDocumentMediaId)
                ? {
                      link: req.template.headerDocumentLink,
                      mediaId: req.template.headerDocumentMediaId,
                      filename: req.template.headerDocumentFilename,
                  }
                : undefined,
            headerImage: (req.template.headerImageLink || req.template.headerImageMediaId)
                ? {
                      link: req.template.headerImageLink,
                      mediaId: req.template.headerImageMediaId,
                  }
                : undefined,
            logAs: { autor: "sistema" }, // espelha no chat do inbox
        });
        return new Response(
            JSON.stringify({
                ok: result.ok,
                provider: "cloud",
                error: result.error,
                waMessageId: result.waMessageId,
                details: result.rawError,
            }),
            {
                status: result.ok ? 200 : 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    // Mídia (PDF)
    if (req.mediaBase64) {
        const result = await sendCloudDocument(cfg, {
            to: req.phone,
            documentBase64: req.mediaBase64,
            filename: req.fileName ?? "documento.pdf",
            caption: req.caption ?? req.text,
            logAs: { autor: "sistema" }, // espelha no chat do inbox
        });
        return new Response(
            JSON.stringify({
                ok: result.ok,
                provider: "cloud",
                error: result.error,
                waMessageId: result.waMessageId,
                details: result.rawError,
            }),
            {
                status: result.ok ? 200 : 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    // Texto livre (só dentro da janela 24h)
    if (req.text) {
        const result = await sendCloudText(cfg, { to: req.phone, text: req.text, logAs: { autor: "sistema" } });
        return new Response(
            JSON.stringify({
                ok: result.ok,
                provider: "cloud",
                error: result.error,
                waMessageId: result.waMessageId,
                details: result.rawError,
            }),
            {
                status: result.ok ? 200 : 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    return new Response(
        JSON.stringify({ error: "Forneca 'text', 'mediaBase64' ou 'template'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const body = (await req.json()) as WhatsAppRequest;

        if (!body.phone) {
            return new Response(
                JSON.stringify({ error: "Campo obrigatorio: phone" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }
        if (!body.text && !body.mediaBase64 && !body.template) {
            return new Response(
                JSON.stringify({ error: "Forneca 'text', 'mediaBase64' ou 'template'" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        if (isCloudEnabled()) return await sendViaCloud(body);
        return await sendViaEvolution(body);
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: err?.message || String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
