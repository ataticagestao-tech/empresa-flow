import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FOCUS_NFE_URL = Deno.env.get("FOCUS_NFE_URL") || "https://homologacao.focusnfe.com.br";
const FOCUS_NFE_TOKEN = Deno.env.get("FOCUS_NFE_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CancelarRequest {
  nota_fiscal_id: string;
  motivo: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!FOCUS_NFE_TOKEN) {
      throw new Error("FOCUS_NFE_TOKEN nao configurado");
    }

    const body: CancelarRequest = await req.json();

    if (!body.nota_fiscal_id || !body.motivo) {
      throw new Error("Campos obrigatorios: nota_fiscal_id, motivo");
    }

    if (body.motivo.length < 15) {
      throw new Error("Motivo deve ter pelo menos 15 caracteres (exigencia SEFAZ)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar NF para pegar a referencia
    const { data: nf, error: nfError } = await supabase
      .from("notas_fiscais")
      .select("id, status")
      .eq("id", body.nota_fiscal_id)
      .single();

    if (nfError || !nf) {
      throw new Error("Nota fiscal nao encontrada");
    }

    if (nf.status !== "autorizada") {
      throw new Error("Apenas NFs autorizadas podem ser canceladas");
    }

    const ref = `nfse-${body.nota_fiscal_id.slice(0, 8)}`;

    // Enviar cancelamento para Focus NF-e
    const focusUrl = `${FOCUS_NFE_URL}/v2/nfse/${ref}`;

    const focusResponse = await fetch(focusUrl, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(FOCUS_NFE_TOKEN + ":")}`,
      },
      body: JSON.stringify({
        justificativa: body.motivo,
      }),
    });

    const focusData = await focusResponse.json();

    if (!focusResponse.ok && focusResponse.status !== 200) {
      // Se falhou no Focus, ainda cancelar localmente mas avisar
      await supabase
        .from("notas_fiscais")
        .update({
          status: "cancelada",
          motivo_cancelamento: body.motivo,
        })
        .eq("id", body.nota_fiscal_id);

      return new Response(
        JSON.stringify({
          sucesso: true,
          aviso: "Cancelado localmente. Erro no Focus NF-e: " + (focusData.mensagem || JSON.stringify(focusData)),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Cancelamento confirmado
    await supabase
      .from("notas_fiscais")
      .update({
        status: "cancelada",
        motivo_cancelamento: body.motivo,
      })
      .eq("id", body.nota_fiscal_id);

    return new Response(
      JSON.stringify({
        sucesso: true,
        status: "cancelada",
        focus_response: focusData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[cancelar-nfse]", error);
    return new Response(
      JSON.stringify({ sucesso: false, erro: error.message || "Erro ao cancelar" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
