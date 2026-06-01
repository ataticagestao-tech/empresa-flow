// ============================================================
// radar-legislativo — Edge Function (Deno)
// Monitora proposições da Câmara dos Deputados (PL/PLP/MPV/PEC)
// relevantes para PMEs/clínicas. Fonte: API Dados Abertos da
// Câmara (gratuita, sem chave). verify_jwt=false no config.toml.
//
// Ações (body.recurso):
//   "proposicoes" (default) → lista com filtros (tema, relevancia, limit, offset)
//   "estatisticas"          → contagens por relevância/tema + última execução
//   "temas"                 → temas monitorados (estático)
//   "executar"              → roda a coleta e grava (usado pelo cron semanal)
//
// Grava via service role (RLS ON sem policies → só service role acessa).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Configuração ──
const CAMARA_BASE = "https://dadosabertos.camara.leg.br/api/v2";
const TIPOS = "PL,PLP,MPV,PEC";

const TEMAS_MONITORADOS: Record<number, string> = {
    40: "Economia",
    58: "Trabalho e Emprego",
    52: "Previdência e Assistência Social",
    56: "Saúde",
    66: "Indústria, Comércio e Serviços",
    67: "Direito e Defesa do Consumidor",
    70: "Finanças Públicas e Orçamento",
};

const KEYWORDS_PME = [
    "simples nacional", "microempreendedor", "MEI", "microempresa",
    "pequena empresa", "nota fiscal", "IRPJ", "IRPF", "CSLL",
    "PIS COFINS", "ICMS", "ISS", "folha de pagamento", "LGPD",
];

const ALTA_RELEVANCIA = [
    "simples nacional", "mei", "microempreendedor", "microempresa",
    "pequena empresa", "folha de pagamento", "desoneração",
    "nota fiscal", "imposto de renda",
];

// ── HTTP helper ──
async function getJson(url: string): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    try {
        const resp = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    } finally {
        clearTimeout(t);
    }
}

// Executa `fn` sobre `items` com no máximo `limit` em paralelo.
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
    const out: R[] = [];
    for (let i = 0; i < items.length; i += limit) {
        const chunk = items.slice(i, i + limit);
        out.push(...await Promise.all(chunk.map(fn)));
    }
    return out;
}

function classificarRelevancia(ementa: string): string {
    const e = (ementa || "").toLowerCase();
    return ALTA_RELEVANCIA.some((t) => e.includes(t)) ? "alta" : "media";
}

function parseDt(v: string | null | undefined): string | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Buscas na Câmara ──
async function buscarPorTema(cod: number, dataInicio: string): Promise<any[]> {
    const url = `${CAMARA_BASE}/proposicoes?siglaTipo=${TIPOS}&dataInicio=${dataInicio}&codTema=${cod}&itens=30&ordem=DESC&ordenarPor=id`;
    try { return (await getJson(url))?.dados ?? []; } catch (e) { console.warn(`tema ${cod}:`, e); return []; }
}
async function buscarPorKeyword(kw: string, dataInicio: string): Promise<any[]> {
    const url = `${CAMARA_BASE}/proposicoes?siglaTipo=${TIPOS}&dataInicio=${dataInicio}&keywords=${encodeURIComponent(kw)}&itens=10&ordem=DESC&ordenarPor=id`;
    try { return (await getJson(url))?.dados ?? []; } catch (e) { console.warn(`kw ${kw}:`, e); return []; }
}
async function buscarDetalhes(id: number): Promise<any | null> {
    try { return (await getJson(`${CAMARA_BASE}/proposicoes/${id}`))?.dados ?? null; } catch { return null; }
}

// ── Coleta ──
async function executarColeta(diasAtras: number) {
    const inicio = Date.now();
    const di = new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);

    const props = new Map<number, any>();
    const meta = new Map<number, { tema_codigo: number | null; tema_nome: string | null; keyword_match: string | null }>();

    // 1. temas (paralelo)
    const temas = Object.entries(TEMAS_MONITORADOS).map(([c, n]) => ({ cod: Number(c), nome: n }));
    const porTema = await mapLimit(temas, 4, (t) => buscarPorTema(t.cod, di).then((r) => ({ t, r })));
    for (const { t, r } of porTema) {
        for (const p of r) {
            if (!props.has(p.id)) {
                props.set(p.id, p);
                meta.set(p.id, { tema_codigo: t.cod, tema_nome: t.nome, keyword_match: null });
            }
        }
    }

    // 2. keywords (paralelo)
    const porKw = await mapLimit(KEYWORDS_PME, 4, (kw) => buscarPorKeyword(kw, di).then((r) => ({ kw, r })));
    for (const { kw, r } of porKw) {
        for (const p of r) {
            if (!props.has(p.id)) {
                props.set(p.id, p);
                meta.set(p.id, { tema_codigo: null, tema_nome: null, keyword_match: kw });
            } else {
                const m = meta.get(p.id)!;
                if (!m.keyword_match) m.keyword_match = kw;
            }
        }
    }

    const supabase = db();
    const ids = [...props.keys()];
    let novas = 0;
    let erro: string | null = null;

    if (ids.length > 0) {
        // 3. já existentes
        const { data: existRows } = await supabase
            .from("radar_proposicoes").select("camara_id").in("camara_id", ids);
        const existentes = new Set((existRows ?? []).map((r: any) => r.camara_id));
        const novosIds = ids.filter((id) => !existentes.has(id));

        // 4. detalhes (paralelo, best-effort) só pros novos
        const detalhes = new Map<number, any>();
        const dets = await mapLimit(novosIds, 10, (id) => buscarDetalhes(id).then((d) => ({ id, d })));
        for (const { id, d } of dets) if (d) detalhes.set(id, d);

        // 5. monta linhas e insere (ignora duplicados por camara_id)
        const rows = novosIds.map((id) => {
            const p = props.get(id);
            const d = detalhes.get(id);
            const m = meta.get(id)!;
            const status = d?.statusProposicao ?? {};
            const ementa = p.ementa ?? "";
            return {
                camara_id: id,
                sigla_tipo: p.siglaTipo ?? "",
                numero: p.numero ?? 0,
                ano: p.ano ?? 0,
                ementa,
                ementa_detalhada: d?.ementaDetalhada ?? null,
                keywords_camara: d?.keywords ?? null,
                data_apresentacao: parseDt(d?.dataApresentacao),
                status_sigla_orgao: (status.siglaOrgao ?? "").slice(0, 20) || null,
                status_descricao: status.descricaoTramitacao ?? null,
                status_data: parseDt(status.dataHora),
                status_despacho: (status.despacho ?? "").slice(0, 500) || null,
                tema_codigo: m.tema_codigo,
                tema_nome: m.tema_nome,
                relevancia: classificarRelevancia(ementa),
                keyword_match: m.keyword_match,
                url_camara: `https://www.camara.leg.br/propostas-legislativas/${id}`,
            };
        });

        if (rows.length > 0) {
            const { data: inserted, error } = await supabase
                .from("radar_proposicoes")
                .upsert(rows, { onConflict: "camara_id", ignoreDuplicates: true })
                .select("id");
            if (error) { erro = error.message; console.error("insert radar:", error); }
            else novas = inserted?.length ?? rows.length;
        }
    }

    const duracao = Math.round((Date.now() - inicio) / 100) / 10;
    await supabase.from("radar_execucoes").insert({
        temas_consultados: temas.length,
        keywords_consultados: KEYWORDS_PME.length,
        proposicoes_encontradas: props.size,
        proposicoes_novas: novas,
        erro,
        duracao_segundos: duracao,
    });

    return { proposicoes_encontradas: props.size, proposicoes_novas: novas, duracao_segundos: duracao, erro };
}

// ── Consultas ──
async function listarProposicoes(body: any) {
    const supabase = db();
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
    const offset = Math.max(Number(body.offset) || 0, 0);

    let q = supabase
        .from("radar_proposicoes")
        .select("id,camara_id,sigla_tipo,numero,ano,ementa,tema_nome,relevancia,keyword_match,url_camara,data_apresentacao,status_sigla_orgao,status_descricao", { count: "exact" });

    if (body.tema) q = q.eq("tema_codigo", Number(body.tema));
    if (body.relevancia) q = q.eq("relevancia", body.relevancia);

    q = q.order("data_apresentacao", { ascending: false, nullsFirst: false })
         .order("id", { ascending: false })
         .range(offset, offset + limit - 1);

    const { data, count, error } = await q;
    if (error) throw error;
    return {
        total: count ?? 0,
        proposicoes: (data ?? []).map((r: any) => ({
            id: r.id, camara_id: r.camara_id, tipo: r.sigla_tipo, numero: r.numero, ano: r.ano,
            ementa: r.ementa, tema: r.tema_nome || null, relevancia: r.relevancia,
            keyword_match: r.keyword_match || null, url_camara: r.url_camara,
            data_apresentacao: r.data_apresentacao,
            status_orgao: r.status_sigla_orgao, status_descricao: r.status_descricao,
        })),
    };
}

async function estatisticas() {
    const supabase = db();
    const { data: rows } = await supabase.from("radar_proposicoes").select("relevancia,tema_nome");
    const por_relevancia: Record<string, number> = {};
    const por_tema: Record<string, number> = {};
    for (const r of rows ?? []) {
        por_relevancia[r.relevancia] = (por_relevancia[r.relevancia] ?? 0) + 1;
        if (r.tema_nome) por_tema[r.tema_nome] = (por_tema[r.tema_nome] ?? 0) + 1;
    }
    const { data: ult } = await supabase
        .from("radar_execucoes").select("executado_em,proposicoes_novas,duracao_segundos")
        .order("executado_em", { ascending: false }).limit(1).maybeSingle();
    return {
        total_proposicoes: (rows ?? []).length,
        por_relevancia,
        por_tema,
        ultima_execucao: ult
            ? { data: ult.executado_em, novas: ult.proposicoes_novas, duracao: Number(ult.duracao_segundos) || 0 }
            : null,
    };
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const body = await req.json().catch(() => ({}));
        const recurso = body.recurso ?? "proposicoes";

        switch (recurso) {
            case "temas":
                return jsonResp({ temas: Object.entries(TEMAS_MONITORADOS).map(([codigo, nome]) => ({ codigo: Number(codigo), nome })) });
            case "executar":
                return jsonResp(await executarColeta(Math.min(Math.max(Number(body.dias) || 7, 1), 90)));
            case "estatisticas":
                return jsonResp(await estatisticas());
            default:
                return jsonResp(await listarProposicoes(body));
        }
    } catch (e) {
        console.error("radar-legislativo:", e);
        return jsonResp({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
});
