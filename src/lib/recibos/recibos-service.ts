// Serviço de Recibos — adaptado de server actions Next.js para Supabase client-side
// Equivale a actions/recibos.ts do Next.js

import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarReciboPDF, downloadBlob, blobToBase64, type ReciboPDFData } from "./gerar-pdf";

// ─── Types ────────────────────────────────────────────────────

export interface CriarReciboInput {
  account_id: string;
  tipo: "payable" | "receivable";
  email_destino?: string;
  enviar_email?: boolean;
  bank_account_id?: string;
}

export interface ActionResult {
  ok: boolean;
  receiptId?: string;
  erro?: string;
}

interface TemplateVars {
  favorecido: string;
  valor: string;
  data: string;
  numero: string;
  empresa: string;
  forma_pagamento: string;
}

export function resolverTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars as Record<string, string>)[key] ?? "");
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ─── ACTION 1: Criar recibo a partir de uma conta pagar/receber ──

export async function criarRecibo(
  supabase: SupabaseClient,
  input: CriarReciboInput
): Promise<ActionResult> {
  // Tentar tabelas GESTAP primeiro, fallback para legacy
  const tabelaGestap = input.tipo === "payable" ? "contas_pagar" : "contas_receber";
  const tabelaLegacy = input.tipo === "payable" ? "accounts_payable" : "accounts_receivable";

  let conta: any = null;
  let isGestap = false;

  // 1. Buscar na tabela GESTAP
  const { data: contaGestap, error: erroGestap } = await supabase
    .from(tabelaGestap)
    .select("*")
    .eq("id", input.account_id)
    .single();

  if (!erroGestap && contaGestap) {
    conta = contaGestap;
    isGestap = true;
  } else {
    // Fallback: buscar na tabela legacy
    const { data: contaLegacy, error: erroLegacy } = await supabase
      .from(tabelaLegacy)
      .select("*")
      .eq("id", input.account_id)
      .single();
    if (erroLegacy || !contaLegacy) return { ok: false, erro: "Conta não encontrada." };
    conta = contaLegacy;
  }

  // 2. Resolver nome do parceiro
  let partnerName = isGestap
    ? (input.tipo === "payable" ? conta.credor_nome : conta.pagador_nome) || conta.observacoes || "Favorecido"
    : conta.description ?? "Favorecido";
  let partnerEmail: string | null = null;
  let partnerPix: string | null = null;

  if (!isGestap) {
    const fkField = input.tipo === "payable" ? "supplier_id" : "client_id";
    const fkTable = input.tipo === "payable" ? "suppliers" : "clients";
    const partnerId = conta[fkField];
    if (partnerId) {
      const { data: partner } = await supabase
        .from(fkTable)
        .select("id, razao_social, nome_fantasia, email, dados_bancarios_pix")
        .eq("id", partnerId)
        .single();
      if (partner) {
        partnerName = partner.nome_fantasia || partner.razao_social || partnerName;
        partnerEmail = partner.email;
        partnerPix = partner.dados_bancarios_pix;
      }
    }
  }

  // 3. Buscar categoria (chart_of_accounts para GESTAP, categories para legacy)
  let categoryName: string | undefined;
  const catId = isGestap ? conta.conta_contabil_id : conta.category_id;
  const catTable = isGestap ? "chart_of_accounts" : "categories";
  if (catId) {
    const { data: cat } = await supabase
      .from(catTable)
      .select("name")
      .eq("id", catId)
      .single();
    if (cat) categoryName = cat.name;
  }

  // 4. Buscar template da empresa (se existir)
  const { data: template } = await supabase
    .from("receipt_templates")
    .select("*")
    .eq("company_id", conta.company_id)
    .maybeSingle();

  // 5. Gerar número do recibo via RPC
  const { data: numData, error: errNum } = await supabase
    .rpc("generate_receipt_number", { p_company_id: conta.company_id });

  if (errNum || !numData) return { ok: false, erro: "Erro ao gerar número do recibo." };

  // 6. Buscar dados da empresa (razao_social identifica no extrato bancário)
  const { data: empresa } = await supabase
    .from("companies")
    .select("razao_social, nome_fantasia, cnpj, dados_bancarios_pix")
    .eq("id", conta.company_id)
    .single();

  const empresaNome = empresa?.nome_fantasia || empresa?.razao_social || "Empresa";
  // Razão social do pagador = empresa que fez o pagamento (identifica no extrato)
  const pagadorRazaoSocial = empresa?.razao_social || empresa?.nome_fantasia;

  // 7. Buscar conta bancária (se fornecida)
  let contaBancariaStr: string | undefined;
  if (input.bank_account_id) {
    const { data: ba } = await supabase
      .from("bank_accounts")
      .select("name, banco")
      .eq("id", input.bank_account_id)
      .single();
    if (ba) contaBancariaStr = `${ba.name} (${ba.banco})`;
  }

  // 8. Montar dados do PDF
  const dateFieldValue = isGestap
    ? conta.data_pagamento
    : (input.tipo === "payable" ? conta.payment_date : conta.receive_date);
  const dataPgto = new Date(dateFieldValue ?? conta.updated_at);
  const valorConta = isGestap ? Number(conta.valor || 0) : Number(conta.amount || 0);
  const formaPgto = isGestap
    ? (input.tipo === "payable" ? conta.forma_pagamento : conta.forma_recebimento)
    : conta.payment_method;
  const descricaoConta = isGestap
    ? (input.tipo === "payable" ? conta.credor_nome : conta.pagador_nome) || conta.observacoes || ""
    : conta.description ?? "";

  const pdfData: ReciboPDFData = {
    numero: numData,
    valor: valorConta,
    favorecido: partnerName,
    forma_pagamento: formaPgto ?? undefined,
    categoria: categoryName,
    conta_bancaria: contaBancariaStr,
    data_pagamento: new Intl.DateTimeFormat("pt-BR").format(dataPgto),
    data_hora_pagamento: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(dataPgto),
    barcode: conta.barcode || undefined,
    chave_pix: partnerPix || empresa?.dados_bancarios_pix || undefined,
    pagador_razao_social: pagadorRazaoSocial || undefined,
    descricao: descricaoConta,
    empresa_nome: empresaNome,
    empresa_cnpj: empresa?.cnpj ?? undefined,
    cor_primaria: template?.cor_primaria ?? "#1D2939",
    rodape_texto: template?.rodape_texto,
    tipo: input.tipo,
  };

  // 7. Gerar PDF (blob no browser)
  let pdfBlob: Blob;
  try {
    pdfBlob = await gerarReciboPDF(pdfData);
  } catch {
    return { ok: false, erro: "Erro ao gerar o PDF do comprovante." };
  }

  // 8. Upload PDF no Storage (bucket: documentos)
  const storagePath = `${conta.company_id}/recibos/${numData}.pdf`;
  const { error: erroUpload } = await supabase.storage
    .from("documentos")
    .upload(storagePath, pdfBlob, { contentType: "application/pdf", upsert: true });

  if (erroUpload) {
    console.warn("Erro no upload do PDF:", erroUpload);
  }

  const { data: urlData } = supabase.storage
    .from("documentos")
    .getPublicUrl(storagePath);

  // 11. Determinar email destino
  const emailDestino = input.email_destino ?? partnerEmail ?? null;

  // 10. Inserir registro na tabela receipts
  const receiptFkField = input.tipo === "payable" ? "account_payable_id" : "account_receivable_id";

  const { data: recibo, error: erroInsert } = await supabase
    .from("recibos_v2")
    .insert({
      company_id: conta.company_id,
      [receiptFkField]: conta.id,
      numero: numData,
      valor: pdfData.valor,
      favorecido: pdfData.favorecido,
      forma_pagamento: pdfData.forma_pagamento,
      categoria: pdfData.categoria,
      conta_bancaria: pdfData.conta_bancaria,
      data_pagamento: new Date(dateFieldValue ?? conta.updated_at).toISOString(),
      descricao: pdfData.descricao,
      pdf_url: urlData?.publicUrl ?? null,
      status_email: "pendente",
      email_destino: emailDestino,
      tipo: input.tipo,
    })
    .select("id")
    .single();

  if (erroInsert || !recibo) {
    console.error("Erro ao inserir recibo:", erroInsert);
    return { ok: false, erro: "Erro ao salvar o recibo." };
  }

  // 11. Marcar conta como recibo gerado (apenas campos que existem na tabela)
  const updateTabela = isGestap ? tabelaGestap : tabelaLegacy;
  const updateStatus = isGestap ? "pago" : "paid";
  await supabase
    .from(updateTabela)
    .update({ status: updateStatus as any })
    .eq("id", conta.id);

  // 12. Download local do PDF
  const nomeArquivo = `${numData}.pdf`;
  downloadBlob(pdfBlob, nomeArquivo);

  // 13. Enviar email (se solicitado)
  if (input.enviar_email && emailDestino) {
    await _enviarEmailRecibo(supabase, {
      receiptId: recibo.id,
      pdfBlob,
      pdfData,
      emailDestino,
      template,
      nomeArquivo,
    });
  }

  return { ok: true, receiptId: recibo.id };
}

// ─── ACTION 2: Re-enviar e-mail de recibo existente ──────────

export async function reenviarEmailRecibo(
  supabase: SupabaseClient,
  receiptId: string,
  emailDestino?: string
): Promise<ActionResult> {
  const { data: recibo, error } = await supabase
    .from("recibos_v2")
    .select("*")
    .eq("id", receiptId)
    .single();

  if (error || !recibo) return { ok: false, erro: "Recibo não encontrado." };

  const destino = emailDestino ?? recibo.email_destino;
  if (!destino) return { ok: false, erro: "E-mail do destinatário não informado." };

  // Baixar PDF do storage (bucket: documentos)
  const storagePath = `${recibo.company_id}/recibos/${recibo.numero}.pdf`;
  const { data: pdfBlob, error: erroDownload } = await supabase.storage
    .from("documentos")
    .download(storagePath);

  if (erroDownload || !pdfBlob) return { ok: false, erro: "PDF não encontrado no storage." };

  // Buscar template
  const { data: template } = await supabase
    .from("receipt_templates")
    .select("*")
    .eq("company_id", recibo.company_id)
    .maybeSingle();

  const vars: TemplateVars = {
    favorecido: recibo.favorecido,
    valor: fmt(Number(recibo.valor)),
    data: new Intl.DateTimeFormat("pt-BR").format(new Date(recibo.data_pagamento)),
    numero: recibo.numero,
    empresa: "Tática Gestão",
    forma_pagamento: recibo.forma_pagamento ?? "",
  };

  const assunto = resolverTemplate(
    template?.email_assunto ?? "Comprovante de Pagamento — {{favorecido}}",
    vars
  );
  const corpo = resolverTemplate(
    template?.email_corpo ?? "Olá, segue em anexo o comprovante de pagamento no valor de {{valor}} realizado em {{data}}.",
    vars
  );

  // Enviar via Edge Function
  try {
    const pdfBase64 = await blobToBase64(pdfBlob);

    await supabase.functions.invoke("enviar-recibo-email", {
      body: {
        destinatario: destino,
        assunto,
        corpo,
        pdfBase64,
        nomeArquivo: `${recibo.numero}.pdf`,
      },
    });

    await supabase
      .from("recibos_v2")
      .update({
        status_email: "enviado",
        email_destino: destino,
        email_enviado_em: new Date().toISOString(),
        email_erro: null,
      })
      .eq("id", receiptId);

    return { ok: true, receiptId };
  } catch (err: any) {
    const erroMsg = err?.message || "Erro ao enviar e-mail.";

    await supabase
      .from("recibos_v2")
      .update({
        status_email: "erro",
        email_erro: erroMsg,
      })
      .eq("id", receiptId);

    return { ok: false, erro: erroMsg };
  }
}

// ─── ACTION 3: Pagar + Gerar recibo em 1 chamada ─────────────

export async function pagarEGerarRecibo(
  supabase: SupabaseClient,
  accountId: string,
  bankAccountId: string,
  tipo: "payable" | "receivable",
  opcoes?: { enviar_email?: boolean; email_destino?: string }
): Promise<ActionResult> {
  const { format } = await import("date-fns");

  // 1. Buscar valor da conta nas tabelas GESTAP
  const tabela = tipo === "payable" ? "contas_pagar" : "contas_receber";
  const { data: conta } = await supabase
    .from(tabela)
    .select("valor")
    .eq("id", accountId)
    .single();

  // 2. Processar pagamento via RPC GESTAP (atomico)
  const rpcName = tipo === "payable" ? "quitar_conta_pagar" : "quitar_conta_receber";
  const idParam = tipo === "payable" ? "p_conta_pagar_id" : "p_conta_receber_id";
  const formaParam = tipo === "payable" ? "p_forma_pagamento" : "p_forma_recebimento";

  const { error } = await supabase.rpc(rpcName, {
    [idParam]: accountId,
    p_valor_pago: conta?.valor ?? 0,
    p_data_pagamento: format(new Date(), "yyyy-MM-dd"),
    p_conta_bancaria_id: bankAccountId,
    [formaParam]: "pix",
  });

  if (error) return { ok: false, erro: "Erro ao processar o pagamento: " + error.message };

  // 3. Criar recibo
  return criarRecibo(supabase, {
    account_id: accountId,
    tipo,
    bank_account_id: bankAccountId,
    enviar_email: opcoes?.enviar_email ?? false,
    email_destino: opcoes?.email_destino,
  });
}

// ─── Helper interno ───────────────────────────────────────────

async function _enviarEmailRecibo(
  supabase: SupabaseClient,
  opts: {
    receiptId: string;
    pdfBlob: Blob;
    pdfData: ReciboPDFData;
    emailDestino: string;
    template: any;
    nomeArquivo: string;
  }
) {
  const vars: TemplateVars = {
    favorecido: opts.pdfData.favorecido,
    valor: fmt(opts.pdfData.valor),
    data: opts.pdfData.data_pagamento,
    numero: opts.pdfData.numero,
    empresa: opts.pdfData.empresa_nome,
    forma_pagamento: opts.pdfData.forma_pagamento ?? "",
  };

  const assunto = resolverTemplate(
    opts.template?.email_assunto ?? "Comprovante de Pagamento — {{favorecido}}",
    vars
  );
  const corpo = resolverTemplate(
    opts.template?.email_corpo ?? "Olá, segue em anexo o comprovante de pagamento no valor de {{valor}} realizado em {{data}}.",
    vars
  );

  try {
    const pdfBase64 = await blobToBase64(opts.pdfBlob);

    await supabase.functions.invoke("enviar-recibo-email", {
      body: {
        destinatario: opts.emailDestino,
        assunto,
        corpo,
        pdfBase64,
        nomeArquivo: opts.nomeArquivo,
      },
    });

    await supabase.from("recibos_v2").update({
      status_email: "enviado",
      email_enviado_em: new Date().toISOString(),
      email_erro: null,
    }).eq("id", opts.receiptId);
  } catch (err: any) {
    await supabase.from("recibos_v2").update({
      status_email: "erro",
      email_erro: err?.message || "Erro desconhecido",
    }).eq("id", opts.receiptId);
  }
}
