// ============================================================
// whatsapp-cloud.ts — helpers compartilhados Cloud API
//
// Centraliza chamadas ao Graph API (graph.facebook.com) e
// normalizacao de telefones BR. Importado pelas Edge Functions
// que enviam mensagens (enviar-whatsapp, solicitar-cadastro,
// disparar-overnight-agendado).
//
// Feature flag: USE_WHATSAPP_CLOUD=true ativa Cloud API.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const GRAPH_API_VERSION = "v21.0";

/** Contexto opcional pra espelhar o envio no inbox (whatsapp_mensagens).
 *  Se passado em qualquer send*, a mensagem enviada vira uma bolha no chat. */
export interface LogContext {
    autor?: "ia" | "humano" | "sistema";
    conteudo?: string; // override do texto exibido no chat
}

/** Descrição legível do que foi enviado num template (pro chat do inbox).
 *  Modelos conhecidos da Tatica viram frase; o resto cai no fallback nome+params. */
function templateSummary(name: string, params?: string[]): string {
    const p = params ?? [];
    switch (name) {
        case "solicitar_cadastro_funcionario": // [nome, empresa]
            return `📋 Pedido de cadastro enviado${p[0] ? ` para ${p[0]}` : ""}${p[1] ? ` (${p[1]})` : ""}`;
        case "recibo_pagamento": // [nome, num_recibo, valor, data]
            return `🧾 Recibo${p[1] ? ` nº ${p[1]}` : ""} enviado${p[0] ? ` para ${p[0]}` : ""}${p[2] ? ` — R$ ${p[2]}` : ""}${p[3] ? ` (${p[3]})` : ""}`;
        case "cobranca_a_vencer": // [nome, empresa, valor, vencimento]
            return `🔔 Cobrança enviada${p[0] ? ` para ${p[0]}` : ""}${p[1] ? ` (${p[1]})` : ""}${p[2] ? ` — R$ ${p[2]}` : ""}${p[3] ? `, vence ${p[3]}` : ""}`;
        case "overnight_diario": // [empresa, data]
            return `📊 Resumo diário (overnight) enviado${p[0] ? ` — ${p[0]}` : ""}${p[1] ? ` ${p[1]}` : ""}`;
        default:
            return `📋 ${name}${p.length ? " — " + p.join(", ") : ""}`;
    }
}

// Cache do corpo dos templates aprovados (nome → texto com {{n}}). Persiste no isolate.
const _templateBodyCache: Record<string, string> = {};

/** Busca o TEXTO exato do corpo do template aprovado na Meta (Graph API). */
async function getTemplateBody(cfg: CloudConfig, name: string): Promise<string | null> {
    if (name in _templateBodyCache) return _templateBodyCache[name];
    try {
        const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${cfg.wabaId}/message_templates`
            + `?name=${encodeURIComponent(name)}&fields=name,components&limit=10`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) return null;
        const list = (data?.data ?? []) as any[];
        const tpl = list.find((t) => t.name === name) ?? list[0];
        const body = (tpl?.components ?? []).find((c: any) => c.type === "BODY");
        const text = body?.text;
        if (typeof text === "string" && text.length) {
            _templateBodyCache[name] = text;
            return text;
        }
        return null;
    } catch {
        return null;
    }
}

/** Substitui {{1}},{{2}}... pelo valor correspondente em params. */
function renderTemplate(body: string, params?: string[]): string {
    const p = params ?? [];
    return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => p[Number(n) - 1] ?? `{{${n}}}`);
}

/** Grava a mensagem ENVIADA no inbox (cria/atualiza a conversa). Não quebra o envio. */
async function logOutboundToInbox(
    to: string,
    autor: string,
    tipo: string,
    conteudo: string,
    waMessageId?: string,
) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    try {
        const svc = createClient(url, key, { auth: { persistSession: false } });
        await svc.rpc("whatsapp_registrar_msg", {
            p_phone: to,
            p_direcao: "saida",
            p_autor: autor,
            p_conteudo: conteudo,
            p_wa_message_id: waMessageId ?? null,
            p_tipo: tipo,
            p_status: waMessageId ? "sent" : null,
        });
    } catch (e) {
        console.error("[whatsapp-cloud] log inbox falhou:", (e as any)?.message);
    }
}

export interface CloudConfig {
    accessToken: string;
    phoneNumberId: string;
    wabaId: string;
}

export function getCloudConfig(): CloudConfig | null {
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const wabaId = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID");
    if (!accessToken || !phoneNumberId || !wabaId) return null;
    return { accessToken, phoneNumberId, wabaId };
}

export function isCloudEnabled(): boolean {
    return (Deno.env.get("USE_WHATSAPP_CLOUD") || "").toLowerCase() === "true";
}

/**
 * Normaliza telefone BR para o formato que a Cloud API espera:
 * - so digitos
 * - prefixo 55 se nao houver
 * - REMOVE o 9 extra de celular (Cloud API/wa_id usa 12 digitos)
 */
export function normalizeBrazilPhone(raw: string): string | null {
    if (!raw) return null;
    let digits = raw.replace(/\D/g, "");
    if (!digits) return null;

    if (digits.startsWith("0")) digits = digits.slice(1);

    if (!digits.startsWith("55")) {
        if (digits.length === 10 || digits.length === 11) {
            digits = "55" + digits;
        } else {
            return null;
        }
    }

    // Tira o 9 extra de celular: 13 digitos -> 12 digitos
    // Formato com 9: 55 + DDD(2) + 9 + 8digitos = 13
    // Formato sem 9: 55 + DDD(2) + 8digitos = 12
    if (digits.length === 13 && digits[4] === "9") {
        digits = digits.slice(0, 4) + digits.slice(5);
    }

    if (digits.length !== 12 && digits.length !== 13) return null;
    return digits;
}

export interface SendTextOptions {
    to: string;
    text: string;
    previewUrl?: boolean;
    logAs?: LogContext;
}

export interface SendTemplateOptions {
    to: string;
    templateName: string;
    languageCode?: string;
    bodyParams?: string[];
    /** Forneca link OU mediaId (id retornado por uploadMedia). filename obrigatorio. */
    headerDocument?: { link?: string; mediaId?: string; filename?: string };
    headerImage?: { link?: string; mediaId?: string };
    logAs?: LogContext;
}

export interface SendDocumentOptions {
    to: string;
    documentLink?: string;
    documentBase64?: string;
    filename: string;
    caption?: string;
    logAs?: LogContext;
}

export interface CloudSendResult {
    ok: boolean;
    waMessageId?: string;
    error?: string;
    rawError?: unknown;
}

async function postGraph(path: string, payload: unknown, accessToken: string): Promise<Response> {
    return fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
}

function parseError(data: any, status: number): string {
    const err = data?.error;
    if (!err) return `HTTP ${status}`;
    const msg = err.error_user_msg || err.message || `code ${err.code}`;
    return `${msg} (code ${err.code ?? "?"})`;
}

/** Envia texto livre (so funciona dentro da janela de 24h apos cliente mandar msg) */
export async function sendCloudText(
    cfg: CloudConfig,
    opts: SendTextOptions,
): Promise<CloudSendResult> {
    const to = normalizeBrazilPhone(opts.to);
    if (!to) return { ok: false, error: `Telefone invalido: ${opts.to}` };

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: opts.text, preview_url: !!opts.previewUrl },
    };

    const resp = await postGraph(`${cfg.phoneNumberId}/messages`, payload, cfg.accessToken);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: parseError(data, resp.status), rawError: data };
    const waId = data?.messages?.[0]?.id;
    if (opts.logAs) {
        await logOutboundToInbox(to, opts.logAs.autor ?? "sistema", "texto", opts.logAs.conteudo ?? opts.text, waId);
    }
    return { ok: true, waMessageId: waId };
}

/** Envia template aprovado pela Meta (unico modo fora da janela de 24h) */
export async function sendCloudTemplate(
    cfg: CloudConfig,
    opts: SendTemplateOptions,
): Promise<CloudSendResult> {
    const to = normalizeBrazilPhone(opts.to);
    if (!to) return { ok: false, error: `Telefone invalido: ${opts.to}` };

    const components: any[] = [];

    if (opts.headerDocument) {
        const doc: Record<string, unknown> = {
            filename: opts.headerDocument.filename ?? "documento.pdf",
        };
        if (opts.headerDocument.mediaId) doc.id = opts.headerDocument.mediaId;
        else if (opts.headerDocument.link) doc.link = opts.headerDocument.link;
        else return { ok: false, error: "headerDocument requer mediaId OU link" };
        components.push({
            type: "header",
            parameters: [{ type: "document", document: doc }],
        });
    } else if (opts.headerImage) {
        const img: Record<string, unknown> = {};
        if (opts.headerImage.mediaId) img.id = opts.headerImage.mediaId;
        else if (opts.headerImage.link) img.link = opts.headerImage.link;
        else return { ok: false, error: "headerImage requer mediaId OU link" };
        components.push({
            type: "header",
            parameters: [{ type: "image", image: img }],
        });
    }

    if (opts.bodyParams && opts.bodyParams.length > 0) {
        components.push({
            type: "body",
            parameters: opts.bodyParams.map((v) => ({ type: "text", text: v })),
        });
    }

    const payload: any = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
            name: opts.templateName,
            language: { code: opts.languageCode ?? "pt_BR" },
        },
    };
    if (components.length > 0) payload.template.components = components;

    const resp = await postGraph(`${cfg.phoneNumberId}/messages`, payload, cfg.accessToken);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: parseError(data, resp.status), rawError: data };
    const waId = data?.messages?.[0]?.id;
    if (opts.logAs) {
        let resumo = opts.logAs.conteudo;
        if (!resumo) {
            // Texto EXATO do modelo aprovado, renderizado com os dados; fallback = descrição.
            const body = await getTemplateBody(cfg, opts.templateName);
            resumo = body ? renderTemplate(body, opts.bodyParams) : templateSummary(opts.templateName, opts.bodyParams);
        }
        await logOutboundToInbox(to, opts.logAs.autor ?? "sistema", "template", resumo, waId);
    }
    return { ok: true, waMessageId: waId };
}

/** Envia documento (PDF/etc) como mensagem de midia. So dentro da janela de 24h. */
export async function sendCloudDocument(
    cfg: CloudConfig,
    opts: SendDocumentOptions,
): Promise<CloudSendResult> {
    const to = normalizeBrazilPhone(opts.to);
    if (!to) return { ok: false, error: `Telefone invalido: ${opts.to}` };

    // Se for base64, primeiro precisa fazer upload via /PHONE_ID/media
    let mediaId: string | undefined;
    let link = opts.documentLink;

    if (opts.documentBase64 && !link) {
        const uploadResp = await uploadMedia(
            cfg,
            opts.documentBase64,
            opts.filename,
            "application/pdf",
        );
        if (!uploadResp.ok) return { ok: false, error: uploadResp.error };
        mediaId = uploadResp.mediaId;
    }

    const document: Record<string, unknown> = { filename: opts.filename };
    if (link) document.link = link;
    if (mediaId) document.id = mediaId;
    if (opts.caption) document.caption = opts.caption;

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "document",
        document,
    };

    const resp = await postGraph(`${cfg.phoneNumberId}/messages`, payload, cfg.accessToken);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: parseError(data, resp.status), rawError: data };
    const waId = data?.messages?.[0]?.id;
    if (opts.logAs) {
        const resumo = opts.logAs.conteudo ?? (opts.caption || `📎 ${opts.filename}`);
        await logOutboundToInbox(to, opts.logAs.autor ?? "sistema", "documento", resumo, waId);
    }
    return { ok: true, waMessageId: waId };
}

/** Upload de midia (PDF/imagem) pra Cloud API; retorna media_id pra usar em sends */
export async function uploadMedia(
    cfg: CloudConfig,
    base64: string,
    filename: string,
    mimeType: string,
): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([bytes], { type: mimeType }), filename);
    form.append("type", mimeType);

    const resp = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${cfg.phoneNumberId}/media`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${cfg.accessToken}` },
            body: form,
        },
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: parseError(data, resp.status) };
    return { ok: true, mediaId: data?.id };
}
