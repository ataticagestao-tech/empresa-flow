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
  const tabela = input.tipo === "payable" ? "accounts_payable" : "accounts_receivable";
  const fkField = input.tipo === "payable" ? "supplier_id" : "client_id";
  const fkTable = input.tipo === "payable" ? "suppliers" : "clients";
  const dateField = input.tipo === "payable" ? "payment_date" : "receive_date";

  // 1. Buscar conta (query simples, sem join)
  const { data: conta, error: erroConta } = await supabase
    .from(tabela)
    .select("*")
    .eq("id", input.account_id)
    .single();

  if (erroConta || !conta) return { ok: false, erro: "Conta não encontrada." };
  if (conta.receipt_generated) return { ok: false, erro: "Recibo já gerado para este pagamento." };

  // 2. Buscar parceiro (fornecedor ou cliente) separadamente
  let partnerName = conta.description ?? "Favorecido";
  let partnerEmail: string | null = null;
  let partnerPix: string | null = null;
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

  // 3. Buscar categoria separadamente
  let categoryName: string | undefined;
  if (conta.category_id) {
    const { data: cat } = await supabase
      .from("categories")
      .select("name")
      .eq("id", conta.category_id)
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
  const dataPgto = new Date(conta[dateField] ?? conta.updated_at);
  const pdfData: ReciboPDFData = {
    numero: numData,
    valor: Number(conta.amount),
    favorecido: partnerName,
    forma_pagamento: conta.payment_method ?? undefined,
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
    descricao: conta.description ?? "",
    empresa_nome: empresaNome,
    empresa_cnpj: empresa?.cnpj ?? undefined,
    cor_primaria: template?.cor_primaria ?? "#0d1b2a",
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
    .from("receipts")
    .insert({
      company_id: conta.company_id,
      [receiptFkField]: conta.id,
      numero: numData,
      valor: pdfData.valor,
      favorecido: pdfData.favorecido,
      forma_pagamento: pdfData.forma_pagamento,
      categoria: pdfData.categoria,
      conta_bancaria: pdfData.conta_bancaria,
      data_pagamento: new Date(conta[dateField] ?? conta.updated_at).toISOString(),
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

  // 11. Marcar conta como recibo gerado
  await supabase
    .from(tabela)
    .update({ receipt_id: recibo.id, receipt_generated: true })
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
    .from("receipts")
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
      .from("receipts")
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
      .from("receipts")
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

  // 1. Processar pagamento via RPC existente
  const rpcName = tipo === "payable" ? "process_payment" : "process_receipt";
  const dateParam = tipo === "payable" ? "p_payment_date" : "p_receive_date";

  const { data: conta } = await supabase
    .from(tipo === "payable" ? "accounts_payable" : "accounts_receivable")
    .select("amount")
    .eq("id", accountId)
    .single();

  const { error } = await supabase.rpc(rpcName, {
    p_account_id: accountId,
    p_bank_account_id: bankAccountId,
    p_amount: conta?.amount ?? 0,
    [dateParam]: format(new Date(), "yyyy-MM-dd"),
  });

  if (error) return { ok: false, erro: "Erro ao processar o pagamento." };

  // 2. Criar recibo
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

    await supabase.from("receipts").update({
      status_email: "enviado",
      email_enviado_em: new Date().toISOString(),
      email_erro: null,
    }).eq("id", opts.receiptId);
  } catch (err: any) {
    await supabase.from("receipts").update({
      status_email: "erro",
      email_erro: err?.message || "Erro desconhecido",
    }).eq("id", opts.receiptId);
  }
}
