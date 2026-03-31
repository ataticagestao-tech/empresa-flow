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

    // 1. Buscar emissao
    const { data: emissao, error: emErr } = await supabase
      .from("nfse_emissoes")
      .select("*")
      .eq("id", emissao_id)
      .single();
    if (emErr || !emissao) throw new Error("Emissao nao encontrada");

    // 2. Buscar configuracao
    const { data: config, error: cfErr } = await supabase
      .from("nfse_configuracoes")
      .select("*")
      .eq("company_id", emissao.company_id)
      .eq("ativo", true)
      .single();
    if (cfErr || !config) throw new Error("Configuracao NFSe nao encontrada. Configure em /configuracoes/nfse");

    // Determinar token e URL
    const token = config.ambiente === "producao" ? config.token_producao : config.token_homologacao;
    if (!token) throw new Error(`Token de ${config.ambiente} nao configurado`);

    const baseUrl = config.ambiente === "producao"
      ? "https://api.focusnfe.com.br/v2"
      : "https://homologacao.focusnfe.com.br/v2";

    // 3. Atualizar status para enviando
    await supabase.from("nfse_emissoes").update({ status: "enviando" }).eq("id", emissao_id);

    // 4. Montar payload Focus NF-e
    const cpfCnpj = emissao.tomador_documento.replace(/\D/g, "");
    const isCnpj = cpfCnpj.length === 14;

    const payload: any = {
      data_emissao: emissao.data_emissao || new Date().toISOString(),
      natureza_operacao: config.natureza_operacao,
      optante_simples_nacional: config.optante_simples_nacional,
      prestador: {
        cnpj: config.cnpj.replace(/\D/g, ""),
        inscricao_municipal: config.inscricao_municipal,
        codigo_municipio: config.codigo_municipio,
      },
      tomador: {
        razao_social: emissao.tomador_razao_social,
        email: emissao.tomador_email || undefined,
        telefone: emissao.tomador_telefone || undefined,
      },
      servico: {
        discriminacao: emissao.discriminacao,
        valor_servicos: parseFloat(emissao.valor_servicos),
        aliquota: parseFloat(emissao.aliquota),
        item_lista_servico: emissao.item_lista_servico,
        iss_retido: emissao.iss_retido || false,
      },
    };

    // Documento tomador
    if (isCnpj) payload.tomador.cnpj = cpfCnpj;
    else payload.tomador.cpf = cpfCnpj;

    // Endereco tomador (se preenchido)
    if (emissao.tomador_logradouro) {
      payload.tomador.endereco = {
        logradouro: emissao.tomador_logradouro,
        numero: emissao.tomador_numero || "S/N",
        complemento: emissao.tomador_complemento || "",
        bairro: emissao.tomador_bairro || "",
        codigo_municipio: emissao.tomador_codigo_municipio || config.codigo_municipio,
        uf: emissao.tomador_uf || "",
        cep: emissao.tomador_cep?.replace(/\D/g, "") || "",
      };
    }

    // Campos opcionais
    if (config.regime_especial_tributacao) {
      payload.regime_especial_tributacao = config.regime_especial_tributacao;
    }
    if (emissao.codigo_cnae) payload.servico.codigo_cnae = emissao.codigo_cnae;
    if (emissao.codigo_tributacao_municipio) payload.servico.codigo_tributacao_municipio = emissao.codigo_tributacao_municipio;

    // Deducoes
    if (emissao.valor_deducoes && parseFloat(emissao.valor_deducoes) > 0) {
      payload.servico.valor_deducoes = parseFloat(emissao.valor_deducoes);
    }
    if (emissao.desconto_incondicionado && parseFloat(emissao.desconto_incondicionado) > 0) {
      payload.servico.desconto_incondicionado = parseFloat(emissao.desconto_incondicionado);
    }

    // Retencoes federais
    for (const campo of ["valor_pis", "valor_cofins", "valor_csll", "valor_ir", "valor_inss"]) {
      if (emissao[campo] && parseFloat(emissao[campo]) > 0) {
        payload.servico[campo] = parseFloat(emissao[campo]);
      }
    }

    // 5. Enviar para Focus NF-e
    const ref = emissao.referencia;
    const focusUrl = `${baseUrl}/nfse?ref=${ref}`;

    const focusResponse = await fetch(focusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(token + ":")}`,
      },
      body: JSON.stringify(payload),
    });

    const focusData = await focusResponse.json();

    // 6. Registrar evento
    await supabase.from("nfse_eventos").insert({
      company_id: emissao.company_id,
      emissao_id,
      tipo: "envio",
      request_payload: payload,
      response_payload: focusData,
      http_status: focusResponse.status,
      mensagem: focusData.mensagem || focusData.status || null,
    });

    // 7. Processar resposta
    if (focusResponse.status >= 400) {
      const erro = focusData.mensagem || focusData.erros?.[0]?.mensagem || JSON.stringify(focusData);
      await supabase.from("nfse_emissoes").update({
        status: "erro_autorizacao",
        mensagem_retorno: erro,
        erros_validacao: focusData.erros || null,
      }).eq("id", emissao_id);

      return new Response(JSON.stringify({ sucesso: false, erro, detalhes: focusData }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sucesso — pode ser processando ou autorizado
    const novoStatus = focusData.status === "autorizado" ? "autorizada" : "processando";

    const updateData: any = {
      status: novoStatus,
      numero_nfse: focusData.numero || null,
      codigo_verificacao: focusData.codigo_verificacao || null,
      protocolo: focusData.protocolo || null,
      mensagem_retorno: focusData.status || null,
    };

    // Se ja autorizada, buscar URLs
    if (novoStatus === "autorizada") {
      const consultaResp = await fetch(`${baseUrl}/nfse/${ref}`, {
        headers: { Authorization: `Basic ${btoa(token + ":")}` },
      });
      if (consultaResp.ok) {
        const cData = await consultaResp.json();
        updateData.url_xml = cData.caminho_xml_nota_fiscal || cData.url_xml || null;
        updateData.url_pdf = cData.url || null;
        updateData.numero_nfse = cData.numero || updateData.numero_nfse;
        updateData.codigo_verificacao = cData.codigo_verificacao || updateData.codigo_verificacao;
      }
    }

    await supabase.from("nfse_emissoes").update(updateData).eq("id", emissao_id);

    return new Response(JSON.stringify({
      sucesso: true,
      status: novoStatus,
      numero: updateData.numero_nfse,
      referencia: ref,
      focus_response: focusData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[emitir-nfse]", error);
    return new Response(JSON.stringify({ sucesso: false, erro: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
