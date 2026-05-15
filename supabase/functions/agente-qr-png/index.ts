// ============================================================
// agente-qr-png — Edge Function (Deno)
// Faz logout da instância Evolution e retorna o QR code como
// imagem PNG pura (Content-Type: image/png). Acesse no navegador
// pra ver a imagem direto. Escaneia pelo WhatsApp.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

function base64ToBytes(b64: string): Uint8Array {
    const clean = b64.replace(/^data:image\/\w+;base64,/, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const base = EVOLUTION_API_URL.replace(/\/$/, "");
        const headers = { apikey: EVOLUTION_API_KEY };
        const url = new URL(req.url);
        const fazLogout = url.searchParams.get("reset") === "1";

        if (fazLogout) {
            await fetch(`${base}/instance/logout/${EVOLUTION_INSTANCE}`, { method: "DELETE", headers })
                .catch(() => null);
            await new Promise((r) => setTimeout(r, 3000));
        }

        const connectResp = await fetch(`${base}/instance/connect/${EVOLUTION_INSTANCE}`, { headers });
        const connectData = await connectResp.json().catch(() => ({}));

        const qrBase64 =
            connectData?.base64 ??
            connectData?.qrcode?.base64 ??
            connectData?.qr?.base64 ??
            null;

        if (!qrBase64) {
            const jaConectado = connectData?.instance?.state === "open";
            return new Response(
                JSON.stringify({
                    erro: "QR não disponível",
                    instancia_ja_conectada: jaConectado,
                    resposta_evolution: connectData,
                }, null, 2),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const pngBytes = base64ToBytes(qrBase64);
        return new Response(pngBytes, {
            status: 200,
            headers: {
                ...corsHeaders,
                "Content-Type": "image/png",
                "Cache-Control": "no-store",
            },
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({ erro: err?.message || String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
