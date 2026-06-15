// ============================================================
// ler-comprovante — Edge Function (Deno)
//
// Lê um documento financeiro enviado por foto/PDF e CLASSIFICA:
//   - "comprovante"  → comprovante de PIX/TED/transferência/depósito (pagamento
//                       que JÁ aconteceu) → leva a DAR BAIXA numa CR ou CP.
//   - "boleto"        → boleto bancário (conta a pagar) → leva a LANÇAR CP.
//   - "outro"         → não é nem um nem outro.
//
// Faz UMA chamada de visão (espelha ler-boleto/ler-extrato, mesmo modelo) e
// devolve os campos dos dois tipos, pra quem chama (orquestrador) rotear.
//
// Saída:
//   {
//     tipo_documento: "comprovante" | "boleto" | "outro",
//     comprovante: { tipo, valor, data, pagador_nome, pagador_cpf_cnpj,
//                    beneficiario_nome, beneficiario_cpf_cnpj, instituicao,
//                    descricao, id_transacao },
//     boleto: { valor, vencimento, codigo_barras, fornecedor, descricao,
//               competencia, pagador_nome, pagador_cpf_cnpj }
//   }
// Campos não encontrados vêm null.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// Modelo de visão (trocável via secret ANTHROPIC_VISION_MODEL, sem novo deploy).
// Default: Sonnet 4.6 (suporta visão). NÃO usa ANTHROPIC_MODEL pra não herdar
// o modelo dos agentes (que pode ser Opus, ~5x mais caro).
const VISION_MODEL = Deno.env.get("ANTHROPIC_VISION_MODEL") ?? "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64) throw new Error("fileBase64 is required");

    const mediaType: string = mimeType || "image/png";

    const fileBlock = mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: fileBase64 } };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: [fileBlock, { type: "text", text: PROMPT }] }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", errText);
      throw new Error(`Claude API ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const text: string = result.content?.[0]?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Não foi possível interpretar o documento (resposta da IA sem JSON).");

    const raw = JSON.parse(jsonMatch[0]) as any;

    const tipo_documento: string = ["comprovante", "boleto"].includes(raw?.tipo_documento)
      ? raw.tipo_documento
      : "outro";

    const c = raw?.comprovante ?? {};
    const b = raw?.boleto ?? {};

    const out = {
      tipo_documento,
      comprovante: {
        tipo: cleanStr(c.tipo),
        valor: cleanNum(c.valor),
        data: cleanDate(c.data),
        pagador_nome: cleanStr(c.pagador_nome),
        pagador_cpf_cnpj: cleanStr(c.pagador_cpf_cnpj),
        beneficiario_nome: cleanStr(c.beneficiario_nome),
        beneficiario_cpf_cnpj: cleanStr(c.beneficiario_cpf_cnpj),
        instituicao: cleanStr(c.instituicao),
        descricao: cleanStr(c.descricao),
        id_transacao: cleanStr(c.id_transacao),
      },
      boleto: {
        valor: cleanNum(b.valor),
        vencimento: cleanDate(b.vencimento),
        codigo_barras: cleanStr(b.codigo_barras),
        fornecedor: cleanStr(b.fornecedor),
        descricao: cleanStr(b.descricao),
        competencia: cleanStr(b.competencia),
        pagador_nome: cleanStr(b.pagador_nome),
        pagador_cpf_cnpj: cleanStr(b.pagador_cpf_cnpj),
      },
    };

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[ler-comprovante]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao ler comprovante" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── saneamento ────────────────────────────────────────────────
function cleanStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function cleanNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/R\$\s*/gi, "").replace(/\s/g, "");
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : Math.abs(n);
}
function cleanDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const PROMPT = `Você recebe a FOTO ou PDF de um documento financeiro brasileiro. Primeiro CLASSIFIQUE, depois extraia os dados.

Tipos:
- "comprovante" = comprovante de pagamento/transferência que JÁ ACONTECEU: PIX (enviado/recebido), TED, DOC, transferência, depósito, comprovante de pagamento de boleto. Tem pagador e beneficiário, data/hora da transação e geralmente um ID/autenticação.
- "boleto" = um BOLETO a pagar (ainda não pago): tem linha digitável / código de barras (47-48 dígitos), vencimento, cedente/beneficiário e sacado/pagador. É uma cobrança, não uma prova de pagamento.
- "outro" = nota fiscal, recibo, cardápio, foto qualquer, etc.

Retorne APENAS um JSON válido (sem markdown, sem texto fora do JSON):

{
  "tipo_documento": "comprovante",
  "comprovante": {
    "tipo": "PIX",
    "valor": 1200.00,
    "data": "2026-06-05",
    "pagador_nome": "Quem ENVIOU o dinheiro",
    "pagador_cpf_cnpj": "CPF/CNPJ do pagador (como aparece, mesmo mascarado)",
    "beneficiario_nome": "Quem RECEBEU o dinheiro",
    "beneficiario_cpf_cnpj": "CPF/CNPJ do beneficiário",
    "instituicao": "Banco/instituição (ex: Nubank, Itaú)",
    "descricao": "Descrição/mensagem da transação, se houver",
    "id_transacao": "ID/autenticação/end-to-end, se houver"
  },
  "boleto": {
    "valor": null, "vencimento": null, "codigo_barras": null, "fornecedor": null,
    "descricao": null, "competencia": null, "pagador_nome": null, "pagador_cpf_cnpj": null
  }
}

Regras:
- Preencha SÓ o objeto do tipo identificado; o outro deixe com tudo null.
- valor: número decimal (ex: 1200.00). data: YYYY-MM-DD (a data da transação no comprovante).
- pagador vs beneficiário: NÃO inverta. Pagador = de quem SAIU. Beneficiário = quem RECEBEU. Em "PIX enviado" o titular é o pagador; em "PIX recebido" o titular é o beneficiário.
- Mantenha o CPF/CNPJ como aparece, mesmo mascarado (ex: "***.456.789-**").
- Se for boleto, preencha o objeto "boleto" igual a um leitor de boleto: valor, vencimento (YYYY-MM-DD), codigo_barras (linha digitável completa), fornecedor (cedente/beneficiário), descricao, competencia (MM/YYYY), pagador_nome e pagador_cpf_cnpj (sacado).
- Se não conseguir um campo, use null. Não invente.

Retorne SOMENTE o JSON.`;
