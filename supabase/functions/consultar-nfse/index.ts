import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { emissao_id } = await req.json();
    if (!emissao_id) throw new Error("emissao_id obrigatorio");

    // Buscar emissao
    const { data: emissao } = await supabase
      .from("nfse_emissoes")
      .select("*, nfse_configuracoes!configuracao_id(*)")
      .eq("id", emissao_id)
      .single();
    if (!emissao) throw new Error("Emissao nao encontrada");

    // Buscar config para token
    const { data: config } = await supabase
      .from("nfse_configuracoes")
      .select("*")
      .eq("company_id", emissao.company_id)
      .eq("ativo", true)
      .single();
    if (!config) throw new Error("Configuracao nao encontrada");

    const token = config.ambiente === "producao" ? config.token_producao : config.token_homologacao;
    if (!token) throw new Error("Token nao configurado");

    const baseUrl = config.ambiente === "producao"
      ? "https://api.focusnfe.com.br/v2"
      : "https://homologacao.focusnfe.com.br/v2";

    // Consultar Focus NF-e
    const ref = emissao.referencia;
    const resp = await fetch(`${baseUrl}/nfse/${ref}`, {
      headers: { Authorization: `Basic ${btoa(token + ":")}` },
      signal: AbortSignal.timeout(15000),
    });

    const data = await resp.json();

    // Registrar evento
    await supabase.from("nfse_eventos").insert({
      company_id: emissao.company_id,
      emissao_id,
      tipo: "consulta",
      response_payload: data,
      http_status: resp.status,
      mensagem: data.status || null,
    });

    // Atualizar emissao conforme status
    if (data.status === "autorizado") {
      await supabase.from("nfse_emissoes").update({
        status: "autorizada",
        numero_nfse: data.numero || null,
        codigo_verificacao: data.codigo_verificacao || null,
        url_xml: data.caminho_xml_nota_fiscal || data.url_xml || null,
        url_pdf: data.url || null,
        mensagem_retorno: "Autorizada",
      }).eq("id", emissao_id);

      return new Response(JSON.stringify({
        status: "autorizada",
        numero: data.numero,
        codigo_verificacao: data.codigo_verificacao,
        url_pdf: data.url,
        url_xml: data.caminho_xml_nota_fiscal || data.url_xml,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (data.status === "erro_autorizacao") {
      await supabase.from("nfse_emissoes").update({
        status: "erro_autorizacao",
        mensagem_retorno: data.erros?.[0]?.mensagem || data.mensagem || "Erro na autorizacao",
        erros_validacao: data.erros || null,
      }).eq("id", emissao_id);

      return new Response(JSON.stringify({
        status: "erro_autorizacao",
        erro: data.erros?.[0]?.mensagem || data.mensagem,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ainda processando
    return new Response(JSON.stringify({
      status: data.status || "processando",
      mensagem: "Aguardando autorizacao da prefeitura",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[consultar-nfse]", error);
    return new Response(JSON.stringify({ status: "erro", erro: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
