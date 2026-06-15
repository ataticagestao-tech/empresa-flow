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

interface DiaPonto {
  dia: number;
  entrada: string | null;
  saida_almoco: string | null;
  retorno_almoco: string | null;
  saida: string | null;
  tipo_ausencia: string | null;
  obs: string | null;
}

interface FolhaPontoData {
  funcionaria: string | null;
  mes_lido: string | null;
  dias: DiaPonto[];
}

const MESES: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const { fileBase64, mimeType, ano, mes } = await req.json();

    if (!fileBase64) {
      throw new Error("fileBase64 is required");
    }

    const mediaType = mimeType || "image/png";
    const mesNome = mes ? MESES[String(mes).padStart(2, "0")] : null;
    const contexto = mesNome && ano
      ? `\n\nContexto: esta folha é referente ao mês de ${mesNome} de ${ano}.`
      : "";

    let content: any[];
    if (mediaType === "application/pdf") {
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
        { type: "text", text: PROMPT + contexto },
      ];
    } else {
      content = [
        { type: "image", source: { type: "base64", media_type: mediaType, data: fileBase64 } },
        { type: "text", text: PROMPT + contexto },
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
        model: VISION_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", errText);
      throw new Error(`Claude API ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Não foi possível interpretar a folha de ponto na resposta da IA");
    }

    const parsed: FolhaPontoData = JSON.parse(jsonMatch[0]);

    // Sanitização: garantir formato consistente
    const dias = (parsed.dias || [])
      .filter((d) => d && typeof d.dia === "number" && d.dia >= 1 && d.dia <= 31)
      .map((d) => ({
        dia: d.dia,
        entrada: normalizeTime(d.entrada),
        saida_almoco: normalizeTime(d.saida_almoco),
        retorno_almoco: normalizeTime(d.retorno_almoco),
        saida: normalizeTime(d.saida),
        tipo_ausencia: normalizeAusencia(d.tipo_ausencia),
        obs: d.obs || null,
      }))
      .sort((a, b) => a.dia - b.dia);

    return new Response(
      JSON.stringify({
        funcionaria: parsed.funcionaria || null,
        mes_lido: parsed.mes_lido || null,
        dias,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[ler-folha-ponto]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao ler folha de ponto" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function normalizeTime(t: string | null): string | null {
  if (!t || typeof t !== "string") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function normalizeAusencia(a: string | null): string | null {
  if (!a) return null;
  const v = String(a).toLowerCase().trim();
  const validos = ["falta", "atraso", "atestado", "folga", "feriado", "outros"];
  return validos.includes(v) ? v : null;
}

const PROMPT = `Você está lendo uma FOLHA DE PONTO manuscrita brasileira (uma funcionária, um mês).

A tabela tem estas colunas, nesta ordem:
DIA | ENTRADA | SAÍDA DO ALMOÇO | VOLTA DO ALMOÇO | SAÍDA | FUNCIONÁRIA | GESTÃO

Mapeamento dos horários:
- ENTRADA          → entrada
- SAÍDA DO ALMOÇO  → saida_almoco
- VOLTA DO ALMOÇO  → retorno_almoco
- SAÍDA            → saida

IMPORTANTE:
- As colunas "FUNCIONÁRIA" e "GESTÃO" são apenas ASSINATURAS/vistos (rabiscos, "B", check). NÃO são horários. IGNORE-as completamente.
- Linhas separadoras tipo "D3", "D10", "D17", "D24", "D31" são marcadores de semana/domingo. IGNORE-as.
- Quando o dia inteiro estiver marcado como "Feriado" ou "Folga" (texto atravessando a linha), defina tipo_ausencia e deixe os horários como null.
- Leia os horários no formato 24h "HH:MM". Use bom senso: horários de entrada de manhã (~08:00-10:00), saída de almoço (~11:00-13:00), volta (~13:00-14:30), saída final (~17:00-20:00).
- Retorne SOMENTE os dias que têm ALGUM conteúdo (algum horário preenchido OU folga/feriado). Dias em branco (ainda não preenchidos) NÃO devem aparecer.
- Se um horário específico não estiver legível ou estiver vazio, use null naquele campo (não invente).

Retorne APENAS um JSON válido, sem markdown, sem explicação:

{
  "funcionaria": "nome lido no topo (ou null)",
  "mes_lido": "mês lido no topo (ou null)",
  "dias": [
    { "dia": 1, "entrada": null, "saida_almoco": null, "retorno_almoco": null, "saida": null, "tipo_ausencia": "feriado", "obs": "Feriado" },
    { "dia": 3, "entrada": "09:00", "saida_almoco": "11:40", "retorno_almoco": "13:10", "saida": "19:30", "tipo_ausencia": null, "obs": null }
  ]
}

Regras dos campos:
- dia: número de 1 a 31 (obrigatório).
- entrada / saida_almoco / retorno_almoco / saida: "HH:MM" ou null.
- tipo_ausencia: um de "falta","atraso","atestado","folga","feriado","outros" — ou null para dia normal.
- obs: observação curta livre se houver, senão null.

Retorne APENAS o JSON.`;
