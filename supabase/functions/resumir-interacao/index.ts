// resumir-interacao — resume uma conversa via IA (tema + resumo) e grava em
// interacoes_cadastro, anexando ao cadastro da pessoa (ou na caixa de entrada).
// Chamada servidor-a-servidor (cadastro flow, webhook, assistente) → verify_jwt=false.
// Design: docs/10-interacoes-cadastro.md
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
// Resumo é tarefa simples → Haiku (barato). Configurável.
const MODELO_RESUMO = Deno.env.get("ANTHROPIC_MODEL_RESUMO") ?? "claude-haiku-4-5-20251001";

interface Mensagem { autor?: "pessoa" | "empresa" | "sistema"; texto?: string; tem_arquivo?: boolean }
interface Input {
    company_id: string;
    alvo_tipo: "funcionario" | "fornecedor" | "cliente" | "nao_identificado";
    alvo_id?: string;            // employee/supplier/customer id (não usar se nao_identificado)
    canal?: "whatsapp" | "assistente" | "sistema";
    direcao?: "entrada" | "saida" | "mista";
    telefone?: string;
    mensagens: Mensagem[];
    teve_arquivo?: boolean;
    arquivo_path?: string;
    ocorrido_em?: string;        // ISO; default now
    metadata?: Record<string, unknown>;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const input = (await req.json()) as Input;
        if (!input.company_id) return j({ error: "company_id obrigatório" }, 400);
        if (!input.alvo_tipo) return j({ error: "alvo_tipo obrigatório" }, 400);
        if (!Array.isArray(input.mensagens) || input.mensagens.length === 0) {
            return j({ error: "mensagens obrigatórias (array não vazio)" }, 400);
        }

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

        const teveArquivo = !!input.teve_arquivo || input.mensagens.some((m) => m.tem_arquivo);

        // 1. resume via IA
        const { tema, resumo } = await resumir(input.mensagens, teveArquivo);

        // 2. monta a linha (mapeia alvo_tipo → coluna FK)
        const row: Record<string, unknown> = {
            company_id: input.company_id,
            alvo_tipo: input.alvo_tipo,
            canal: input.canal ?? "whatsapp",
            direcao: input.direcao ?? null,
            tema,
            resumo,
            teve_arquivo: teveArquivo,
            arquivo_path: input.arquivo_path ?? null,
            telefone: input.telefone ?? null,
            ocorrido_em: input.ocorrido_em ?? new Date().toISOString(),
            metadata: input.metadata ?? {},
        };
        if (input.alvo_tipo === "funcionario") row.employee_id = input.alvo_id ?? null;
        else if (input.alvo_tipo === "fornecedor") row.supplier_id = input.alvo_id ?? null;
        else if (input.alvo_tipo === "cliente") row.customer_id = input.alvo_id ?? null;

        const { data, error } = await service
            .from("interacoes_cadastro")
            .insert(row)
            .select("id, alvo_tipo, tema, resumo, teve_arquivo, ocorrido_em")
            .single();
        if (error) return j({ error: error.message }, 500);

        return j({ ok: true, interacao: data });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

async function resumir(mensagens: Mensagem[], teveArquivo: boolean): Promise<{ tema: string; resumo: string }> {
    const transcript = mensagens
        .map((m) => {
            const quem = m.autor === "empresa" ? "Empresa" : m.autor === "sistema" ? "Sistema" : "Pessoa";
            const arq = m.tem_arquivo ? " [enviou arquivo]" : "";
            return `${quem}: ${m.texto ?? ""}${arq}`.trim();
        })
        .join("\n")
        .slice(0, 8000);

    const sys = `Você resume conversas de WhatsApp de um sistema de gestão, em português do Brasil.
Devolva SOMENTE um JSON válido, sem texto fora dele, no formato:
{"tema": "...", "resumo": "..."}
- tema: título curto (máx 6 palavras) do assunto principal.
- resumo: 1 a 3 frases objetivas do que foi tratado/combinado.${teveArquivo ? "\n- A conversa teve troca de arquivo — mencione brevemente se for relevante." : ""}`;

    try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: MODELO_RESUMO,
                max_tokens: 300,
                system: sys,
                messages: [{ role: "user", content: `Conversa:\n${transcript}` }],
            }),
        });
        if (!resp.ok) {
            console.error("[resumir-interacao] IA falhou:", resp.status, (await resp.text()).slice(0, 200));
            return fallback(mensagens);
        }
        const dataResp = await resp.json();
        const texto = dataResp?.content?.[0]?.text ?? "";
        const match = texto.match(/\{[\s\S]*\}/);
        if (match) {
            const obj = JSON.parse(match[0]);
            return {
                tema: String(obj.tema ?? "").slice(0, 120) || fallback(mensagens).tema,
                resumo: String(obj.resumo ?? "").slice(0, 1000) || fallback(mensagens).resumo,
            };
        }
        return fallback(mensagens);
    } catch (err: any) {
        console.error("[resumir-interacao] exceção IA:", err?.message);
        return fallback(mensagens);
    }
}

// Sem IA (erro/sem crédito): grava um resumo cru pra não perder a interação.
function fallback(mensagens: Mensagem[]): { tema: string; resumo: string } {
    const primeira = mensagens.find((m) => m.texto)?.texto ?? "(sem texto)";
    return { tema: "Conversa por WhatsApp", resumo: primeira.slice(0, 300) };
}

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
