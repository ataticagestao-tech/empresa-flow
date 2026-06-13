// ============================================================
// asaas-criar-cobranca — Edge Function (Deno)
//
// Cria uma cobrança no Asaas (link único: o cliente final escolhe Pix/boleto/
// cartão na invoiceUrl) usando a chave da PRÓPRIA conta Asaas da empresa.
//
// Fluxo:
//   1) acha/cria o cliente no Asaas (por CPF/CNPJ);
//   2) cria a cobrança (billingType=UNDEFINED) com externalReference
//      "company_id:conta_receber_id" (o webhook da Etapa 3 usa isso pra rotear);
//   3) busca o QR Pix (tolerante a falha);
//   4) registra em asaas_cobrancas.
//
// Auth: recebe o JWT do usuário no Authorization e usa um client com a ANON
// key + esse header → RLS garante que o usuário só lê a config/insere cobrança
// da própria empresa. verify_jwt=false (alinha com o resto; a auth é via RLS).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE: Record<string, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoDatePlusDays(n: number): string {
  const d = new Date();
  // Ancora no horário de Brasília (UTC-3) pra a data de vencimento não "pular"
  // perto da meia-noite.
  d.setUTCHours(d.getUTCHours() - 3);
  d.setUTCDate(d.getUTCDate() + (Number.isFinite(n) ? n : 3));
  return d.toISOString().slice(0, 10);
}

interface ClienteIn {
  nome?: string;
  cpfCnpj?: string;
  email?: string;
  phone?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ ok: false, message: "Não autenticado." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json();
    const {
      company_id,
      conta_receber_id,
      venda_id,
      valor,
      vencimento,
      cliente,
      descricao,
    } = body as {
      company_id?: string;
      conta_receber_id?: string;
      venda_id?: string;
      valor?: number;
      vencimento?: string;
      cliente?: ClienteIn;
      descricao?: string;
    };

    if (!company_id) return json({ ok: false, message: "company_id obrigatório." });
    if (!valor || Number(valor) <= 0) return json({ ok: false, message: "Valor inválido." });

    const cpf = (cliente?.cpfCnpj || "").replace(/\D/g, "");
    if (!cpf) {
      return json({ ok: false, message: "CPF/CNPJ do cliente é obrigatório para gerar a cobrança." });
    }

    // Config da empresa (RLS garante que o usuário é membro dessa empresa).
    const { data: cfg, error: cfgErr } = await supabase
      .from("asaas_configuracoes")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    if (cfgErr) return json({ ok: false, message: cfgErr.message });
    if (!cfg) return json({ ok: false, message: "Conta Asaas não configurada para esta empresa." });

    const ambiente = cfg.ambiente === "producao" ? "producao" : "sandbox";
    const apiKey = ambiente === "producao" ? cfg.api_key_producao : cfg.api_key_sandbox;
    if (!apiKey) {
      return json({ ok: false, message: `A chave do Asaas (${ambiente}) não está configurada. Vá em Cobrança Asaas.` });
    }

    const base = BASE[ambiente];
    const aHeaders = {
      "Content-Type": "application/json",
      "User-Agent": "TaticaGestao",
      access_token: apiKey,
    };

    // 1) Cliente no Asaas — acha por CPF/CNPJ ou cria.
    let customerId: string | null = null;
    try {
      const findR = await fetch(`${base}/customers?cpfCnpj=${cpf}`, { headers: aHeaders });
      if (findR.ok) {
        const fd = await findR.json();
        if (Array.isArray(fd?.data) && fd.data.length) customerId = fd.data[0].id;
      }
    } catch (_) { /* cria abaixo */ }

    if (!customerId) {
      const crR = await fetch(`${base}/customers`, {
        method: "POST",
        headers: aHeaders,
        body: JSON.stringify({
          name: cliente?.nome || "Cliente",
          cpfCnpj: cpf,
          email: cliente?.email || undefined,
          mobilePhone: (cliente?.phone || "").replace(/\D/g, "") || undefined,
        }),
      });
      const cd = await crR.json();
      if (!crR.ok) {
        return json({ ok: false, message: cd?.errors?.[0]?.description || "Falha ao cadastrar o cliente no Asaas.", details: cd });
      }
      customerId = cd.id;
    }

    // 2) Cobrança (link único).
    const dueDate = vencimento || isoDatePlusDays(Number(cfg.dias_vencimento ?? 3));
    const payment: Record<string, unknown> = {
      customer: customerId,
      billingType: "UNDEFINED",
      value: Number(valor),
      dueDate,
      description: descricao || undefined,
      externalReference: `${company_id}:${conta_receber_id || ""}`,
    };
    if (Number(cfg.juros_mensal) > 0) payment.interest = { value: Number(cfg.juros_mensal) };
    if (Number(cfg.multa) > 0) payment.fine = { value: Number(cfg.multa) };

    const payR = await fetch(`${base}/payments`, {
      method: "POST",
      headers: aHeaders,
      body: JSON.stringify(payment),
    });
    const payD = await payR.json();
    if (!payR.ok) {
      return json({ ok: false, message: payD?.errors?.[0]?.description || "Falha ao criar a cobrança no Asaas.", details: payD });
    }

    // 3) QR Pix (tolerante: se a conta não tiver chave Pix, segue só com o link).
    let pixPayload: string | null = null;
    let pixImage: string | null = null;
    try {
      const qrR = await fetch(`${base}/payments/${payD.id}/pixQrCode`, { headers: aHeaders });
      if (qrR.ok) {
        const qd = await qrR.json();
        pixPayload = qd.payload ?? null;
        pixImage = qd.encodedImage ?? null;
      }
    } catch (_) { /* segue só com o link */ }

    // 4) Registra local (RLS ok). Não derruba a cobrança já criada se falhar.
    const { error: insErr } = await supabase.from("asaas_cobrancas").insert({
      company_id,
      conta_receber_id: conta_receber_id || null,
      venda_id: venda_id || null,
      asaas_payment_id: payD.id,
      asaas_customer_id: customerId,
      ambiente,
      billing_type: "UNDEFINED",
      valor: Number(valor),
      vencimento: dueDate,
      status: payD.status || "PENDING",
      invoice_url: payD.invoiceUrl || null,
      pix_payload: pixPayload,
      external_reference: payment.externalReference as string,
    });
    if (insErr) {
      console.error("[asaas-criar-cobranca] registro local falhou:", insErr.message);
    }

    return json({
      ok: true,
      paymentId: payD.id,
      status: payD.status,
      invoiceUrl: payD.invoiceUrl || null,
      pixPayload,
      pixQrImage: pixImage,
      vencimento: dueDate,
      ambiente,
      registroLocalOk: !insErr,
    });
  } catch (err: any) {
    return json({ ok: false, message: err?.message || String(err) });
  }
});
