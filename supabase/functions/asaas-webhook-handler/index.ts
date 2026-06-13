// ============================================================
// asaas-webhook-handler — Edge Function (Deno)
//
// Recebe os eventos do Asaas (chamado pelo Asaas, sem JWT). Quando um
// pagamento é confirmado, dá baixa AUTOMÁTICA na conta a receber de origem.
//
// Modelo de caixa: o recebimento entra numa conta intermediária
// "Asaas (a receber)" (não direto no banco). Quando o Asaas repassar pro banco
// e aparecer no extrato, isso será uma TRANSFERÊNCIA entre contas (Etapa 4) —
// então a receita é reconhecida UMA vez só e o extrato nunca duplica.
//
// Segurança/robustez:
//   - idempotência: cada evento é gravado com event_id único (23505 = repetido);
//   - roteamento: acha a empresa/CR pela cobrança (asaas_payment_id) ou pelo
//     externalReference "company_id:conta_receber_id";
//   - token: se a empresa cadastrou webhook_token, exige o header
//     asaas-access-token igual;
//   - baixa: insere a movimentacao ANTES de atualizar a CR (mesma ordem do
//     quitarCR, pra o trigger garantir_mov_ao_quitar_cr não duplicar).
//
// Responde 200 rápido (o Asaas reenvia/derruba o webhook em caso de erro).
// verify_jwt=false no config.toml.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Eventos que significam "dinheiro recebido".
const PAGO_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED_IN_CASH",
]);

const FORMA: Record<string, string> = {
  PIX: "pix",
  BOLETO: "boleto",
  CREDIT_CARD: "cartao_credito",
  UNDEFINED: "pix",
};

function hojeBR(): string {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - 3);
  return d.toISOString().slice(0, 10);
}

type DB = ReturnType<typeof createClient>;

// Acha (ou cria) a conta intermediária "Asaas (a receber)" da empresa.
async function getAsaasAccount(supabase: DB, companyId: string): Promise<string | null> {
  const { data } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", "Asaas (a receber)")
    .maybeSingle();
  if (data?.id) return data.id as string;

  const { data: created, error } = await supabase
    .from("bank_accounts")
    .insert({
      company_id: companyId,
      name: "Asaas (a receber)",
      banco: "Asaas",
      type: "checking",
      initial_balance: 0,
      status: "ativa",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[asaas-webhook] criar conta Asaas falhou:", error.message);
    return null;
  }
  return created.id as string;
}

// Dá baixa na CR: mov (credito) na conta Asaas + atualiza a CR. Idempotente.
async function baixarCR(
  supabase: DB,
  contaReceberId: string,
  contaBancariaId: string,
  payment: any,
): Promise<void> {
  const { data: cr } = await supabase
    .from("contas_receber")
    .select("*")
    .eq("id", contaReceberId)
    .maybeSingle();
  if (!cr) return;
  if (cr.status === "pago") return; // já baixado → idempotente

  const valorPago = Number(payment?.value ?? cr.valor);
  const novoValorPago = Number(cr.valor_pago || 0) + valorPago;
  const novoStatus = novoValorPago >= Number(cr.valor) ? "pago" : "parcial";
  const dataPagamento = payment?.paymentDate || payment?.clientPaymentDate || hojeBR();
  const forma = FORMA[payment?.billingType] || "pix";

  // 1) movimentacao PRIMEIRO (idempotência via trigger anti_duplicata; e evita
  //    duplicação com garantir_mov_ao_quitar_cr).
  const { error: movErr } = await supabase.from("movimentacoes").insert({
    company_id: cr.company_id,
    conta_bancaria_id: contaBancariaId,
    conta_contabil_id: cr.conta_contabil_id,
    tipo: "credito",
    valor: valorPago,
    data: dataPagamento,
    descricao: `Recebimento Asaas — ${cr.pagador_nome}`,
    origem: "conta_receber",
    conta_receber_id: cr.id,
  });
  if (movErr) console.error("[asaas-webhook] mov insert:", movErr.message);

  // 2) atualiza a CR.
  const { error: crErr } = await supabase
    .from("contas_receber")
    .update({
      valor_pago: novoValorPago,
      status: novoStatus,
      data_pagamento: dataPagamento,
      forma_recebimento: forma,
      conta_bancaria_id: contaBancariaId,
    })
    .eq("id", cr.id);
  if (crErr) console.error("[asaas-webhook] cr update:", crErr.message);
}

// Repasse do Asaas pro banco (Etapa 4). Lança uma TRANSFERÊNCIA: débito na
// conta "Asaas (a receber)" + crédito na conta de repasse configurada. Como a
// empresa que recebeu o repasse não vem no payload, roteamos pelo token (cada
// empresa cadastra o seu webhook_token no painel Asaas).
async function handleTransfer(
  supabase: DB,
  req: Request,
  event: string,
  body: any,
): Promise<Response> {
  const transfer = body.transfer;
  const token = req.headers.get("asaas-access-token") || "";

  let companyId: string | null = null;
  let contaRepasse: string | null = null;
  if (token) {
    const { data: cfg } = await supabase
      .from("asaas_configuracoes")
      .select("company_id, conta_repasse_id")
      .eq("webhook_token", token)
      .maybeSingle();
    if (cfg) {
      companyId = cfg.company_id as string;
      contaRepasse = (cfg.conta_repasse_id as string) || null;
    }
  }

  // Idempotência.
  const eventId: string = body?.id || `${transfer.id}:${event}`;
  const { error: dupErr } = await supabase.from("asaas_webhook_events").insert({
    event_id: eventId,
    event_type: event,
    asaas_payment_id: null,
    company_id: companyId,
    payload: body,
  });
  if (dupErr) {
    if ((dupErr as any).code === "23505") return json({ received: true, duplicate: true });
    console.error("[asaas-webhook] transfer event insert:", dupErr.message);
  }

  // Só lança quando o repasse foi efetivado E há conta de repasse configurada.
  if (event === "TRANSFER_DONE" && companyId && contaRepasse) {
    try {
      const asaasAcc = await getAsaasAccount(supabase, companyId);
      const value = Number(transfer?.value);
      if (asaasAcc && value > 0) {
        const data = String(transfer?.effectiveDate || transfer?.dateCreated || hojeBR()).slice(0, 10);
        await supabase.from("movimentacoes").insert({
          company_id: companyId,
          conta_bancaria_id: asaasAcc,
          conta_contabil_id: null,
          tipo: "debito",
          valor: value,
          data,
          descricao: "Repasse Asaas → banco",
          origem: "transferencia",
        });
        await supabase.from("movimentacoes").insert({
          company_id: companyId,
          conta_bancaria_id: contaRepasse,
          conta_contabil_id: null,
          tipo: "credito",
          valor: value,
          data,
          descricao: "Repasse recebido do Asaas",
          origem: "transferencia",
        });
      }
    } catch (e: any) {
      console.error("[asaas-webhook] transfer baixa falhou:", e?.message || e);
    }
  }

  return json({ received: true });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: true }, 200);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ received: true, ignored: "body inválido" }, 200);
  }

  const event: string = body?.event || "";

  // ── Repasse do Asaas pro banco (transferência) — Etapa 4 ──
  if (event.startsWith("TRANSFER") && body?.transfer?.id) {
    return await handleTransfer(supabase, req, event, body);
  }

  const payment: any = body?.payment || null;
  if (!payment?.id) {
    // Evento sem pagamento (ex.: teste de conexão do painel) — só confirma.
    return json({ received: true }, 200);
  }

  // Roteamento: pela cobrança que criamos, ou pelo externalReference.
  const { data: cob } = await supabase
    .from("asaas_cobrancas")
    .select("*")
    .eq("asaas_payment_id", payment.id)
    .maybeSingle();

  let companyId: string | null = (cob?.company_id as string) || null;
  let contaReceberId: string | null = (cob?.conta_receber_id as string) || null;
  if ((!companyId || !contaReceberId) && typeof payment.externalReference === "string") {
    const [cid, crid] = payment.externalReference.split(":");
    companyId = companyId || cid || null;
    contaReceberId = contaReceberId || crid || null;
  }

  // Validação do token (se a empresa cadastrou um).
  if (companyId) {
    const { data: cfg } = await supabase
      .from("asaas_configuracoes")
      .select("webhook_token")
      .eq("company_id", companyId)
      .maybeSingle();
    const tokenRecebido = req.headers.get("asaas-access-token") || "";
    if (cfg?.webhook_token && cfg.webhook_token !== tokenRecebido) {
      return json({ error: "token inválido" }, 401);
    }
  }

  // Idempotência.
  const eventId: string = body?.id || `${payment.id}:${event}`;
  const { error: dupErr } = await supabase.from("asaas_webhook_events").insert({
    event_id: eventId,
    event_type: event,
    asaas_payment_id: payment.id,
    company_id: companyId,
    payload: body,
  });
  if (dupErr) {
    if ((dupErr as any).code === "23505") {
      return json({ received: true, duplicate: true }, 200);
    }
    console.error("[asaas-webhook] registro do evento falhou:", dupErr.message);
  }

  const pago = PAGO_EVENTS.has(event);

  // Atualiza o status da cobrança local.
  if (cob) {
    const upd: Record<string, unknown> = { status: payment.status || event };
    if (pago) {
      upd.pago_em = new Date().toISOString();
      upd.valor_pago = Number(payment.value ?? cob.valor);
    }
    await supabase.from("asaas_cobrancas").update(upd).eq("id", cob.id);
  }

  // Baixa automática.
  if (pago && companyId && contaReceberId) {
    try {
      const contaId = await getAsaasAccount(supabase, companyId);
      if (contaId) await baixarCR(supabase, contaReceberId, contaId, payment);
    } catch (e: any) {
      console.error("[asaas-webhook] baixa falhou:", e?.message || e);
    }
  }

  return json({ received: true }, 200);
});
