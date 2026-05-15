// ============================================================
// agente-conectar-whatsapp — Edge Function (Deno)
// Retorna uma página HTML com o QR code da instância Evolution
// pra reconectar quando ela é deslogada.
// Acesse no navegador: GET .../agente-conectar-whatsapp
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

        // Endpoint pra solicitar QR code de reconexão
        const resp = await fetch(`${base}/instance/connect/${EVOLUTION_INSTANCE}`, { headers });
        const text = await resp.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }

        // Tenta extrair o QR code (formato pode variar)
        // Evolution v2 retorna { base64: "data:image/png;base64,...", code: "..." }
        const qrBase64 =
            data?.base64 ??
            data?.qrcode?.base64 ??
            data?.qr?.base64 ??
            null;

        const qrCodeText = data?.code ?? data?.qrcode?.code ?? data?.qr ?? null;

        // Verifica se a resposta já indica conectado
        const jaConectado = data?.instance?.state === "open" || data?.state === "open";

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Reconectar WhatsApp — Tatica</title>
<meta http-equiv="refresh" content="30">
<style>
  body { font-family: -apple-system, sans-serif; background: #f8f9fa; margin: 0; padding: 30px; text-align: center; color: #1D2939; }
  h1 { color: #1E3A8A; }
  .card { background: #fff; max-width: 480px; margin: 0 auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  .qr { margin: 20px auto; max-width: 280px; }
  .qr img { width: 100%; border: 8px solid #fff; border-radius: 8px; }
  .ok { color: #039855; font-size: 18px; padding: 20px; background: #ECFDF3; border-radius: 8px; }
  .erro { color: #B42318; padding: 16px; background: #FEF3F2; border-radius: 8px; font-size: 14px; }
  ol { text-align: left; line-height: 1.6; }
  code { background: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  .small { font-size: 12px; color: #6B7280; margin-top: 16px; }
</style>
</head>
<body>
<div class="card">
  <h1>Reconectar WhatsApp</h1>
  <p>Instância: <code>${EVOLUTION_INSTANCE}</code></p>

  ${jaConectado ? `
    <div class="ok">
      ✅ Instância já está CONECTADA.<br>
      Pode mandar mensagem que vai funcionar.
    </div>
  ` : qrBase64 ? `
    <p><strong>Escaneie o QR abaixo no WhatsApp:</strong></p>
    <ol>
      <li>Abra o WhatsApp no celular da instância</li>
      <li>Menu (3 pontinhos) → Aparelhos conectados → Conectar aparelho</li>
      <li>Aponta a câmera pra esse QR aqui</li>
    </ol>
    <div class="qr">
      <img src="${qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}" alt="QR Code">
    </div>
    <p class="small">A página recarrega a cada 30s. Depois de escanear, espera aparecer "CONECTADA".</p>
  ` : `
    <div class="erro">
      Não consegui pegar o QR code agora.<br>
      Resposta da Evolution:<br>
      <pre style="text-align:left; font-size:11px;">${JSON.stringify(data, null, 2).slice(0, 800)}</pre>
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
