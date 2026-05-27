// ============================================================
// validar-whatsapp — Edge Function (Deno)
//
// Checa se um telefone tem WhatsApp ativo. Roteia entre:
//   - Evolution: usa /chat/whatsappNumbers (nativo)
//   - Cloud API: NAO tem endpoint nativo de validacao.
//     Faz validacao de formato + retorna "valid" sem confirmar
//     existencia (UI de Funcionarios passa a ser feedback otimista).
//
// USE_WHATSAPP_CLOUD=true ativa Cloud.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isCloudEnabled, normalizeBrazilPhone } from "../_shared/whatsapp-cloud.ts";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ValidarRequest {
    phone: string;
}

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

async function validateViaEvolution(phone: string): Promise<Response> {
    if (!EVOLUTION_API_KEY) {
        return new Response(
            JSON.stringify({ error: "EVOLUTION_API_KEY nao configurada" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const normalized = normalizePhoneEvolution(phone);
    if (!normalized) {
        return new Response(
            JSON.stringify({
                ok: false,
                valid: false,
                exists: false,
                reason: "format",
                message: "Telefone em formato invalido. Use DDD + numero.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/chat/whatsappNumbers/${EVOLUTION_INSTANCE}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ numbers: [normalized] }),
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
                ok: false,
                valid: false,
                exists: false,
                reason: "api_error",
                message: data?.message || data?.error || `Evolution retornou ${resp.status}`,
                details: data,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const result = Array.isArray(data)
        ? data[0]
        : Array.isArray(data?.numbers)
            ? data.numbers[0]
            : data;
    const exists = !!result?.exists;

    return new Response(
        JSON.stringify({
            ok: true,
            valid: true,
            provider: "evolution",
            exists,
            phone: normalized,
            jid: result?.jid ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
}

/**
 * Cloud API nao tem endpoint pra checar se numero tem WhatsApp sem enviar
 * mensagem. Limita a validar formato e devolver feedback otimista.
 */
function validateViaCloud(phone: string): Response {
    const normalized = normalizeBrazilPhone(phone);
    if (!normalized) {
        return new Response(
            JSON.stringify({
                ok: false,
                valid: false,
                exists: false,
                reason: "format",
                message: "Telefone em formato invalido. Use DDD + numero.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    return new Response(
        JSON.stringify({
            ok: true,
            valid: true,
            provider: "cloud",
            exists: true, // otimista; Cloud nao confirma sem enviar
            phone: normalized,
            note: "Cloud API nao valida existencia sem enviar; resultado otimista.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { phone } = (await req.json()) as ValidarRequest;
        if (!phone) {
            return new Response(
                JSON.stringify({ error: "Campo obrigatorio: phone" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        if (isCloudEnabled()) return validateViaCloud(phone);
        return await validateViaEvolution(phone);
    } catch (err: any) {
        return new Response(
            JSON.stringify({
                ok: false,
                valid: false,
                exists: false,
                reason: "exception",
                message: err?.message || String(err),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
