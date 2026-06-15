// ============================================================
// ler-extrato — Edge Function (Deno)
//
// Lê um EXTRATO BANCÁRIO (PDF escaneado/imagem ou foto) via Claude vision
// e devolve as transações normalizadas + resumo (conta, saldo final, período).
//
// É o fallback de visão pro parser de texto (bankStatementPdf.ts): quando o
// PDF não tem camada de texto (escaneado) ou o usuário sobe uma FOTO do extrato,
// o parser posicional acha 0 transações — aí o front chama esta função.
//
// Espelha ler-boleto/index.ts (mesmo modelo, mesma forma de request). Não grava
// nada no banco: só extrai e retorna JSON. O insert em bank_transactions + o gate
// de segurança continuam no front (useBankReconciliation.uploadPDF).
//
// Contrato de saída:
//   {
//     transactions: [{ date:'yyyy-MM-dd', description:string, amount:number }],
//     acctId: string|null, closingBalance: number|null, closingDate: string|null,
//     periodStart: string|null, periodEnd: string|null,
//     truncated: boolean   // true se o modelo cortou por max_tokens
//   }
// amount já vem ASSINADO: negativo = débito/saída, positivo = crédito/entrada.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExtratoTx {
  date: string | null;
  description: string | null;
  amount: number | null;
}

interface ExtratoResult {
  transactions: ExtratoTx[];
  acctId: string | null;
  closingBalance: number | null;
  closingDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64) {
      throw new Error("fileBase64 is required");
    }

    const mediaType: string = mimeType || "image/png";

    // PDF → bloco "document"; imagem → bloco "image". Igual ao ler-boleto.
    const fileBlock = mediaType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: fileBase64 },
        };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        // Extrato pode ter centenas de linhas → saída grande. Sonnet 4.6 suporta bem.
        max_tokens: 16000,
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
    const truncated = result.stop_reason === "max_tokens";

    const parsed = extractJson(text);
    if (!parsed) {
      throw new Error("Não foi possível interpretar o extrato (resposta da IA sem JSON válido).");
    }

    const raw = parsed as Partial<ExtratoResult>;
    const transactions = sanitizeTransactions(raw.transactions);

    const out: ExtratoResult & { truncated: boolean } = {
      transactions,
      acctId: cleanStr(raw.acctId),
      closingBalance: cleanNum(raw.closingBalance),
      closingDate: cleanDate(raw.closingDate),
      periodStart: cleanDate(raw.periodStart),
      periodEnd: cleanDate(raw.periodEnd),
      truncated,
    };

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[ler-extrato]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao ler extrato" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Helpers de saneamento ─────────────────────────────────────

/** Extrai o objeto JSON da resposta, tolerando ```json ... ``` e truncamento. */
function extractJson(text: string): unknown | null {
  let t = text.trim();
  // Remove cercas de markdown
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  // Tentativa direta
  try {
    return JSON.parse(t);
  } catch { /* tenta recortar */ }

  // Recorta do primeiro { até o último } e tenta de novo
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = t.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch { /* talvez truncado — tenta salvar o array */ }
  }

  // Salvamento de truncamento: pega "transactions":[ ... até o último } completo
  const arrStart = t.indexOf('"transactions"');
  if (arrStart >= 0) {
    const bracket = t.indexOf("[", arrStart);
    if (bracket >= 0) {
      const lastObj = t.lastIndexOf("}");
      if (lastObj > bracket) {
        const arrText = t.slice(bracket, lastObj + 1) + "]";
        try {
          const arr = JSON.parse(arrText);
          return { transactions: arr };
        } catch { /* desiste */ }
      }
    }
  }
  return null;
}

function sanitizeTransactions(input: unknown): ExtratoTx[] {
  if (!Array.isArray(input)) return [];
  const out: ExtratoTx[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const date = cleanDate(r.date);
    const amount = cleanNum(r.amount);
    const description = cleanStr(r.description) ?? "";
    if (!date) continue;
    if (amount == null || Math.abs(amount) < 0.01) continue;
    out.push({ date, description: description.substring(0, 255), amount });
  }
  return out;
}

function cleanStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function cleanNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // String tipo "1.234,56" ou "-R$ 50,00" — normaliza pro formato JS
  let s = String(v).trim().replace(/R\$\s*/gi, "").replace(/\s/g, "");
  const neg = s.startsWith("-") || s.endsWith("-");
  s = s.replace(/-/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

/** Aceita yyyy-MM-dd ou dd/MM/yyyy; devolve sempre yyyy-MM-dd. */
function cleanDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const PROMPT = `Você é um extrator de EXTRATOS BANCÁRIOS brasileiros. A imagem/documento é um extrato de conta corrente/poupança (pode ser escaneado, foto ou PDF). Leia TODAS as páginas e extraia TODAS as linhas de movimentação.

Retorne APENAS um JSON válido (sem markdown, sem comentários, sem texto fora do JSON):

{
  "transactions": [
    { "date": "2026-05-02", "description": "PIX RECEBIDO FULANO", "amount": 1200.00 },
    { "date": "2026-05-03", "description": "PAGAMENTO BOLETO ENERGIA", "amount": -345.67 }
  ],
  "acctId": "12345-6",
  "closingBalance": 8540.39,
  "closingDate": "2026-05-31",
  "periodStart": "2026-05-01",
  "periodEnd": "2026-05-31"
}

Regras OBRIGATÓRIAS:
- date: formato YYYY-MM-DD. Se a linha só mostra DD/MM, complete o ano pelo cabeçalho/período do extrato. Datas de dezembro num extrato de janeiro pertencem ao ano anterior.
- amount: número decimal ASSINADO. Débito / saída / pagamento / compra / tarifa / saque = NEGATIVO. Crédito / entrada / depósito / PIX recebido / recebimento = POSITIVO. Use o sinal/coluna do extrato (D ou C, "-", débitos vs créditos).
- description: texto limpo da movimentação (sem o valor, sem o saldo).
- NÃO inclua linhas de SALDO: "saldo anterior", "saldo do dia", "saldo final", "saldo em conta", "saldo bloqueado", totalizadores, subtotais, nem cabeçalhos de coluna.
- NÃO invente transações. Se um valor estiver ilegível, omita a linha.
- acctId: número da conta (com dígito, ex "12345-6"). Se não aparecer, null.
- closingBalance: saldo final do período (número). Se não houver, null.
- closingDate / periodStart / periodEnd: YYYY-MM-DD ou null.
- Se o documento NÃO for um extrato bancário, retorne {"transactions": []}.

Retorne SOMENTE o JSON.`;
