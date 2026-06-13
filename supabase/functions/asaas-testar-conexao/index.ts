// ============================================================
// asaas-testar-conexao — Edge Function (Deno)
//
// Testa a chave (API Key) da conta Asaas da empresa SEM salvar nada.
// O front manda { apiKey, ambiente } com a chave digitada no formulário;
// a função chama o Asaas e devolve se conectou + nome/email/saldo da conta.
//
// Não acessa o banco e não precisa de JWT (a chave vem no corpo, validada
// contra o próprio Asaas). verify_jwt=false no config.toml.
//
// Auth Asaas: header `access_token: <chave>` (+ Content-Type, User-Agent).
// Bases: produção https://api.asaas.com/v3 · sandbox https://api-sandbox.asaas.com/v3
// Formato da chave: produção $aact_prod_… · sandbox $aact_hmlg_…
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE: Record<string, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

interface TestarRequest {
  apiKey: string;
  ambiente?: "sandbox" | "producao";
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { apiKey, ambiente: amb } = (await req.json()) as TestarRequest;
    const ambiente = amb === "producao" ? "producao" : "sandbox";

    if (!apiKey || !apiKey.trim()) {
      return json({ ok: false, message: "Informe a chave (API Key) do Asaas." });
    }

    const key = apiKey.trim();

    // Aviso suave de chave no ambiente errado (não bloqueia; o Asaas confirma).
    let aviso: string | null = null;
    if (ambiente === "producao" && key.includes("hmlg")) {
      aviso = "Atenção: essa parece ser uma chave de TESTE (sandbox), mas o ambiente está em Produção.";
    } else if (ambiente === "sandbox" && key.includes("prod")) {
      aviso = "Atenção: essa parece ser uma chave de PRODUÇÃO, mas o ambiente está em Teste (sandbox).";
    }

    const base = BASE[ambiente];
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "TaticaGestao",
      access_token: key,
    };

    // 1) /myAccount traz nome/email/walletId (UX de confirmação)
    let conta: any = null;
    try {
      const r = await fetch(`${base}/myAccount`, { headers });
      if (r.status === 401) {
        return json({
          ok: false,
          message: "Chave inválida para esse ambiente. Confira se é a chave do ambiente certo (Teste x Produção).",
        });
      }
      if (r.ok) conta = await r.json();
    } catch (_) { /* tenta o saldo abaixo */ }

    // 2) /finance/balance confirma a conexão (sempre existe numa conta válida)
    const rb = await fetch(`${base}/finance/balance`, { headers });
    if (rb.status === 401) {
      return json({
        ok: false,
        message: "Chave inválida para esse ambiente. Confira se é a chave do ambiente certo (Teste x Produção).",
      });
    }
    if (!rb.ok && !conta) {
      const t = await rb.text();
      return json({ ok: false, message: `O Asaas retornou ${rb.status}.`, details: t.slice(0, 400) });
    }
    const bal = rb.ok ? await rb.json() : null;

    return json({
      ok: true,
      ambiente,
      aviso,
      conta_nome: conta?.name ?? conta?.companyName ?? null,
      conta_email: conta?.email ?? null,
      wallet_id: conta?.walletId ?? null,
      saldo: typeof bal?.balance === "number" ? bal.balance : null,
    });
  } catch (err: any) {
    return json({ ok: false, message: err?.message || String(err) });
  }
});
