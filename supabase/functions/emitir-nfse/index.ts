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

interface ItemNFSe {
  descricao: string;
  cnae?: string;
  quantidade: number;
  valor_unitario: number;
  aliquota_iss?: number;
}

interface EmitirRequest {
  nota_fiscal_id: string;
  empresa_id: string;
  // Dados da empresa
  cnpj: string;
  inscricao_municipal?: string;
  codigo_municipio: string;
  razao_social: string;
  // Tomador
  tomador_nome: string;
  tomador_cpf_cnpj: string;
  tomador_email?: string;
  // Servicos
  itens: ItemNFSe[];
  valor_servicos: number;
  valor_iss: number;
  aliquota_iss: number;
  // Controle
  enviar_email_tomador: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!FOCUS_NFE_TOKEN) {
      throw new Error("FOCUS_NFE_TOKEN nao configurado. Configure nas variaveis de ambiente do Supabase.");
    }

    const body: EmitirRequest = await req.json();

    if (!body.nota_fiscal_id || !body.cnpj || !body.tomador_cpf_cnpj) {
      throw new Error("Campos obrigatorios: nota_fiscal_id, cnpj, tomador_cpf_cnpj");
    }

    // Supabase client para atualizar a NF
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Atualizar status para 'enviando'
    await supabase
      .from("notas_fiscais")
      .update({ status: "enviando" })
      .eq("id", body.nota_fiscal_id);

    // Montar payload Focus NF-e
    // Docs: https://focusnfe.com.br/doc/#nfse
    const cpfCnpj = body.tomador_cpf_cnpj.replace(/\D/g, "");
    const isCnpj = cpfCnpj.length === 14;

    const ref = `nfse-${body.nota_fiscal_id.slice(0, 8)}`;

    const payload: any = {
      data_emissao: new Date().toISOString(),
      prestador: {
        cnpj: body.cnpj.replace(/\D/g, ""),
        inscricao_municipal: body.inscricao_municipal || "",
        codigo_municipio: body.codigo_municipio,
      },
      tomador: {
        cnpj: isCnpj ? cpfCnpj : undefined,
        cpf: !isCnpj ? cpfCnpj : undefined,
        razao_social: body.tomador_nome,
        email: body.tomador_email || undefined,
      },
      servico: {
        aliquota: body.aliquota_iss,
        discriminacao: body.itens.map((i) => `${i.descricao} (${i.quantidade}x)`).join("; "),
        iss_retido: false,
        item_lista_servico: "0107",  // Suporte tecnico — ajustar por CNAE
        valor_servicos: body.valor_servicos,
        valor_iss: body.valor_iss,
      },
    };

    // Enviar para Focus NF-e
    const focusUrl = `${FOCUS_NFE_URL}/v2/nfse?ref=${ref}`;

    const focusResponse = await fetch(focusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(FOCUS_NFE_TOKEN + ":")}`,
      },
      body: JSON.stringify(payload),
    });

    const focusData = await focusResponse.json();

    if (focusResponse.status === 422 || focusResponse.status === 400) {
      // NFS-e rejeitada
      await supabase
        .from("notas_fiscais")
        .update({
          status: "rejeitada",
          motivo_cancelamento: focusData.mensagem || focusData.erros?.[0]?.mensagem || JSON.stringify(focusData),
        })
        .eq("id", body.nota_fiscal_id);

      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: focusData.mensagem || "NFS-e rejeitada pelo Focus NF-e",
          detalhes: focusData,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!focusResponse.ok) {
      throw new Error(`Focus NF-e retornou ${focusResponse.status}: ${JSON.stringify(focusData)}`);
    }

    // Sucesso — a Focus pode retornar status processando ou autorizado
    // Em homologacao geralmente retorna direto
    const status = focusData.status === "autorizado" ? "autorizada" : "enviando";

    const updateData: any = {
      status,
      numero: focusData.numero || null,
      numero_rps: focusData.numero_rps || null,
      codigo_verificacao: focusData.codigo_verificacao || null,
      protocolo_sefaz: focusData.protocolo || null,
    };

    // Se ja veio autorizada, buscar URLs do XML e PDF
    if (status === "autorizada" || focusData.url) {
      // Buscar NFS-e completa para pegar URLs
      const consultaUrl = `${FOCUS_NFE_URL}/v2/nfse/${ref}`;
      const consultaResp = await fetch(consultaUrl, {
        method: "GET",
        headers: {
          Authorization: `Basic ${btoa(FOCUS_NFE_TOKEN + ":")}`,
        },
      });

      if (consultaResp.ok) {
        const consultaData = await consultaResp.json();
        updateData.xml_url = consultaData.url_xml || consultaData.caminho_xml_nota_fiscal || null;
        updateData.danfe_url = consultaData.url || consultaData.caminho_danfe || null;
        updateData.chave_acesso = consultaData.codigo_verificacao || null;

        if (consultaData.status === "autorizado") {
          updateData.status = "autorizada";
        }
      }
    }

    await supabase
      .from("notas_fiscais")
      .update(updateData)
      .eq("id", body.nota_fiscal_id);

    // Enviar email para tomador (via Focus — ja faz automaticamente se configurado)

    return new Response(
      JSON.stringify({
        sucesso: true,
        status: updateData.status,
        numero: updateData.numero,
        codigo_verificacao: updateData.codigo_verificacao,
        xml_url: updateData.xml_url || null,
        pdf_url: updateData.danfe_url || null,
        focus_ref: ref,
        focus_response: focusData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[emitir-nfse]", error);

    return new Response(
      JSON.stringify({ sucesso: false, erro: error.message || "Erro ao emitir NFS-e" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
