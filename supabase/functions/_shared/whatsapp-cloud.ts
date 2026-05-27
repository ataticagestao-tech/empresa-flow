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

const GRAPH_API_VERSION = "v21.0";

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
}

export interface SendTemplateOptions {
    to: string;
    templateName: string;
    languageCode?: string;
    bodyParams?: string[];
    /** Forneca link OU mediaId (id retornado por uploadMedia). filename obrigatorio. */
    headerDocument?: { link?: string; mediaId?: string; filename?: string };
    headerImage?: { link?: string; mediaId?: string };
}

export interface SendDocumentOptions {
    to: string;
    documentLink?: string;
    documentBase64?: string;
    filename: string;
    caption?: string;
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
    return { ok: true, waMessageId: data?.messages?.[0]?.id };
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
    return { ok: true, waMessageId: data?.messages?.[0]?.id };
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
    return { ok: true, waMessageId: data?.messages?.[0]?.id };
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
