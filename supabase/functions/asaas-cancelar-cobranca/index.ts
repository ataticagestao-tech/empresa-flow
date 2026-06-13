// ============================================================
// asaas-cancelar-cobranca — Edge Function (Deno)
//
// Cancela (remove) uma cobrança no Asaas e marca a asaas_cobrancas como
// CANCELLED. Usa o ambiente em que a cobrança foi criada (guardado na linha).
//
// Auth: JWT do usuário (anon key + Authorization) → RLS garante que o usuário
// só mexe na própria empresa. verify_jwt=false.
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

    const { company_id, asaas_payment_id } = (await req.json()) as {
      company_id?: string;
      asaas_payment_id?: string;
    };
    if (!company_id || !asaas_payment_id) {
      return json({ ok: false, message: "Dados insuficientes." });
    }

    // Carrega a cobrança (RLS confirma que é da empresa do usuário) p/ saber o ambiente.
    const { data: cob } = await supabase
      .from("asaas_cobrancas")
      .select("*")
      .eq("company_id", company_id)
      .eq("asaas_payment_id", asaas_payment_id)
      .maybeSingle();
    if (!cob) return json({ ok: false, message: "Cobrança não encontrada." });

    const ambiente = cob.ambiente === "producao" ? "producao" : "sandbox";

    const { data: cfg } = await supabase
      .from("asaas_configuracoes")
      .select("api_key_sandbox, api_key_producao")
      .eq("company_id", company_id)
      .maybeSingle();
    const apiKey = ambiente === "producao" ? cfg?.api_key_producao : cfg?.api_key_sandbox;
    if (!apiKey) return json({ ok: false, message: `Chave do Asaas (${ambiente}) não configurada.` });

    const base = BASE[ambiente];
    const resp = await fetch(`${base}/payments/${asaas_payment_id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "User-Agent": "TaticaGestao", access_token: apiKey },
    });
    const data = await resp.json().catch(() => ({}));

    // 200 = removida; 404/400 = já não existe lá → tratamos como cancelada local.
    if (!resp.ok && resp.status !== 404) {
      return json({ ok: false, message: data?.errors?.[0]?.description || `Asaas retornou ${resp.status}.`, details: data });
    }

    await supabase.from("asaas_cobrancas").update({ status: "CANCELLED" }).eq("id", cob.id);

    return json({ ok: true });
  } catch (err: any) {
    return json({ ok: false, message: err?.message || String(err) });
  }
});
