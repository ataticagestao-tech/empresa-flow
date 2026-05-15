// ============================================================
// agente-resetar-whatsapp — Edge Function (Deno)
// Faz logout completo da instância Evolution e retorna o QR
// pra reconectar do zero. Use quando a instância está zumbie
// (marcada open mas não recebe webhook).
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

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const base = EVOLUTION_API_URL.replace(/\/$/, "");
        const headers = { apikey: EVOLUTION_API_KEY };

        // 1. Logout
        const logoutResp = await fetch(`${base}/instance/logout/${EVOLUTION_INSTANCE}`, {
            method: "DELETE",
            headers,
        });
        const logoutText = await logoutResp.text();
        let logoutData: any;
        try { logoutData = JSON.parse(logoutText); } catch { logoutData = { raw: logoutText }; }

        // 2. Aguarda 3s
        await new Promise((r) => setTimeout(r, 3000));

        // 3. Solicita reconexão (gera QR novo)
        const connectResp = await fetch(`${base}/instance/connect/${EVOLUTION_INSTANCE}`, { headers });
        const connectText = await connectResp.text();
        let connectData: any;
        try { connectData = JSON.parse(connectText); } catch { connectData = { raw: connectText }; }

        const qrBase64 =
            connectData?.base64 ??
            connectData?.qrcode?.base64 ??
            connectData?.qr?.base64 ??
            null;

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Resetar WhatsApp — Tatica</title>
<meta http-equiv="refresh" content="20">
<style>
  body { font-family: -apple-system, sans-serif; background: #f8f9fa; margin: 0; padding: 30px; text-align: center; color: #1D2939; }
  h1 { color: #1E3A8A; }
  .card { background: #fff; max-width: 480px; margin: 0 auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  .qr { margin: 20px auto; max-width: 280px; }
  .qr img { width: 100%; border: 8px solid #fff; border-radius: 8px; }
  .info { font-size: 13px; color: #6B7280; padding: 12px; background: #F9FAFB; border-radius: 8px; margin: 12px 0; }
  ol { text-align: left; line-height: 1.7; }
  code { background: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  .erro { color: #B42318; padding: 16px; background: #FEF3F2; border-radius: 8px; font-size: 13px; }
  pre { text-align: left; font-size: 11px; overflow: auto; max-height: 300px; }
</style>
</head>
<body>
<div class="card">
  <h1>Resetar WhatsApp</h1>
  <p>Instância: <code>${EVOLUTION_INSTANCE}</code></p>
  <div class="info">
    Logout: HTTP ${logoutResp.status}<br>
    Reconexão: HTTP ${connectResp.status}
  </div>

  ${qrBase64 ? `
    <p><strong>📱 Escaneia o QR abaixo no WhatsApp:</strong></p>
    <ol>
      <li>Abra o WhatsApp da instância no celular</li>
      <li>Menu (3 pontinhos) → <strong>Aparelhos conectados</strong></li>
      <li>Toque em <strong>Conectar aparelho</strong></li>
      <li>Aponta a câmera pra esse QR aqui</li>
    </ol>
    <div class="qr">
      <img src="${qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}" alt="QR Code">
    </div>
    <p class="info">Página recarrega a cada 20s. Depois de escanear, espera "aparelhos conectados" aparecer no WhatsApp.</p>
  ` : `
    <div class="erro">
      QR não veio na resposta. Detalhes:
      <pre>${JSON.stringify(connectData, null, 2).slice(0, 1000)}</pre>
    </div>
  `}
</div>
</body>
</html>`;

        return new Response(html, {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
        });
    } catch (err: any) {
        return new Response(`<pre>Erro: ${err?.message || String(err)}</pre>`, {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
        });
    }
});
