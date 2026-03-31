import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BoletoData {
  valor: number | null;
  vencimento: string | null;
  codigo_barras: string | null;
  fornecedor: string | null;
  descricao: string | null;
  competencia: string | null;
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

    const mediaType = mimeType || "image/png";

    // Montar content baseado no tipo de arquivo
    let content: any[];

    if (mediaType === "application/pdf") {
      content = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileBase64,
          },
        },
        {
          type: "text",
          text: PROMPT,
        },
      ];
    } else {
      content = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: fileBase64,
          },
        },
        {
          type: "text",
          text: PROMPT,
        },
      ];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", errText);
      throw new Error(`Claude API ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";

    // Extrair JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse boleto data from AI response");
    }

    const boletoData: BoletoData = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(boletoData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[ler-boleto]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao ler boleto" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

const PROMPT = `Analise esta imagem/documento de boleto bancário brasileiro e extraia as seguintes informações.
Retorne APENAS um JSON válido, sem markdown, sem explicações, apenas o JSON:

{
  "valor": 150.00,
  "vencimento": "2026-03-30",
  "codigo_barras": "23793.38128 60000.000003 00000.000400 1 84260000015000",
  "fornecedor": "Nome da empresa/pessoa beneficiária",
  "descricao": "Descrição curta do que é o boleto (ex: Aluguel março, Mensalidade internet)",
  "competencia": "03/2026"
}

Regras:
- valor: número decimal (ex: 150.00). Se não encontrar, null.
- vencimento: formato YYYY-MM-DD. Se não encontrar, null.
- codigo_barras: linha digitável completa (47-48 dígitos com pontos/espaços). Se não encontrar, null.
- fornecedor: nome do cedente/beneficiário. Se não encontrar, null.
- descricao: breve descrição inferida do documento. Se não conseguir inferir, null.
- competencia: mês/ano de referência no formato MM/YYYY. Se não encontrar, inferir do vencimento. Se não conseguir, null.

Retorne APENAS o JSON.`;
