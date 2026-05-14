import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WhatsAppRequest {
    phone: string;
    text: string;
}

/** Normaliza telefone para o formato exigido pela Evolution API:
 *  - so digitos
 *  - prefixo 55 (Brasil) se nao houver
 *  - adiciona 9 no celular brasileiro de 8 digitos (legado)
 */
function normalizePhone(raw: string): string | null {
    if (!raw) return null;
    let digits = raw.replace(/\D/g, "");
    if (!digits) return null;

    // remove zero inicial de DDD se vier
    if (digits.startsWith("0")) digits = digits.slice(1);

    // adiciona DDI 55 se nao tem
    if (!digits.startsWith("55")) {
        // celular BR tipico: DDD (2) + 9 + numero (8) = 11 digitos
        // fixo BR: DDD (2) + numero (8) = 10 digitos
        if (digits.length === 10 || digits.length === 11) {
            digits = "55" + digits;
        } else {
            return null;
        }
    }

    // validacao final: 12 ou 13 digitos (DDI + DDD + numero)
    if (digits.length < 12 || digits.length > 13) return null;
    return digits;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (!EVOLUTION_API_KEY) {
            return new Response(
                JSON.stringify({ error: "EVOLUTION_API_KEY nao configurada no servidor" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { phone, text } = (await req.json()) as WhatsAppRequest;

        if (!phone || !text) {
            return new Response(
                JSON.stringify({ error: "Campos obrigatorios: phone, text" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const normalized = normalizePhone(phone);
        if (!normalized) {
            return new Response(
                JSON.stringify({ error: `Telefone invalido: ${phone}. Use formato com DDD (ex: 11999999999).` }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const evolutionUrl = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;
        const resp = await fetch(evolutionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({ number: normalized, text }),
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
                JSON.stringify({ error: data?.message || data?.error || `Evolution API retornou ${resp.status}`, details: data }),
                { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ ok: true, phone: normalized, response: data }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: err?.message || String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
