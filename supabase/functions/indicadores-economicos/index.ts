// ============================================================
// indicadores-economicos — Edge Function (Deno)
// Indicadores econômicos (BCB SGS + PTAX) e notícias (IBGE +
// Agência Brasil). APIs 100% gratuitas, sem API key.
// Chamada do frontend via supabase.functions.invoke.
// Não acessa o banco — só agrega APIs públicas e cacheia em
// memória (TTL por tipo). verify_jwt=false no config.toml.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// ── Cache em memória com TTL (sobrevive enquanto a instância estiver quente) ──
const _cache = new Map<string, { ts: number; data: unknown }>();
const CACHE_TTL: Record<string, number> = {
    dolar: 300_000,        // 5 min
    euro: 300_000,
    selic: 3_600_000,      // 1h
    cdi: 3_600_000,
    ipca: 86_400_000,      // 24h
    ipca_12m: 86_400_000,
    igpm: 86_400_000,
    inpc: 86_400_000,
    noticias_ibge: 1_800_000,  // 30 min
    noticias_agbr: 1_800_000,
    bolsa: 300_000,            // 5 min (cotação B3 com atraso ~15 min)
};

function getCache<T>(key: string): T | null {
    const hit = _cache.get(key);
    if (!hit) return null;
    const ttl = CACHE_TTL[key] ?? 600_000;
    if (Date.now() - hit.ts < ttl) return hit.data as T;
    return null;
}
function setCache(key: string, data: unknown) {
    _cache.set(key, { ts: Date.now(), data });
}

async function getJson(url: string, headers?: Record<string, string>): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
        const resp = await fetch(url, { headers, signal: ctrl.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    } finally {
        clearTimeout(t);
    }
}

// ── BCB SGS (séries temporais) ──
const BCB_SGS = (serie: number, n: number) =>
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/${n}?formato=json`;

const SERIES: Record<string, number> = {
    selic: 432, cdi: 12, ipca: 433, ipca_12m: 13522, igpm: 189, inpc: 188,
};

async function fetchSgs(key: string, n = 1): Promise<Array<{ data: string; valor: string }>> {
    if (n === 1) {
        const cached = getCache<any[]>(key);
        if (cached) return cached;
    }
    try {
        const data = await getJson(BCB_SGS(SERIES[key], n));
        if (n === 1) setCache(key, data);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn(`SGS ${key}:`, e instanceof Error ? e.message : e);
        return [];
    }
}

// ── BCB PTAX (câmbio) ──
const PTAX_DOLAR = (d: string) =>
    `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${d}'&$format=json`;
const PTAX_MOEDA = (m: string, d: string) =>
    `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${m}'&@dataCotacao='${d}'&$format=json`;

// Data no formato MM-dd-yyyy, recuando p/ dia útil
function dataPtax(diasAtras: number): string {
    const d = new Date();
    d.setDate(d.getDate() - diasAtras);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}-${dd}-${d.getFullYear()}`;
}

interface Cotacao { compra: number | null; venda: number | null; data: string | null; moeda: string }

async function fetchCambio(moeda: "USD" | "EUR"): Promise<Cotacao> {
    const cacheKey = moeda === "USD" ? "dolar" : "euro";
    const cached = getCache<Cotacao>(cacheKey);
    if (cached) return cached;

    for (let dias = 0; dias < 6; dias++) {
        const ds = dataPtax(dias);
        const url = moeda === "USD" ? PTAX_DOLAR(ds) : PTAX_MOEDA("EUR", ds);
        try {
            const json = await getJson(url);
            const values = json?.value ?? [];
            if (values.length > 0) {
                const ultimo = values[values.length - 1];
                const result: Cotacao = {
                    compra: ultimo.cotacaoCompra ?? null,
                    venda: ultimo.cotacaoVenda ?? null,
                    data: ultimo.dataHoraCotacao ?? null,
                    moeda,
                };
                setCache(cacheKey, result);
                return result;
            }
        } catch (_) { /* tenta dia anterior */ }
    }
    return { compra: null, venda: null, data: null, moeda };
}

// ── Histórico (séries) ──
// PTAX por período (uma cotação de fechamento por dia útil).
const PTAX_DOLAR_PER = (di: string, df: string) =>
    `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${di}'&@dataFinalCotacao='${df}'&$format=json`;
const PTAX_MOEDA_PER = (m: string, di: string, df: string) =>
    `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${m}'&@dataInicial='${di}'&@dataFinalCotacao='${df}'&$format=json`;

interface HistCfg {
    tipo: "sgs" | "ptax";
    titulo: string;
    unidade: string;
    n?: number;          // pontos p/ SGS
    moeda?: "USD" | "EUR";
    dias?: number;       // janela p/ PTAX
}

const HIST: Record<string, HistCfg> = {
    selic:    { tipo: "sgs", n: 30, titulo: "Selic", unidade: "% a.a." },
    cdi:      { tipo: "sgs", n: 30, titulo: "CDI", unidade: "% a.d." },
    ipca:     { tipo: "sgs", n: 12, titulo: "IPCA mês", unidade: "%" },
    ipca_12m: { tipo: "sgs", n: 12, titulo: "IPCA 12m", unidade: "%" },
    igpm:     { tipo: "sgs", n: 12, titulo: "IGP-M", unidade: "%" },
    inpc:     { tipo: "sgs", n: 12, titulo: "INPC", unidade: "%" },
    dolar:    { tipo: "ptax", moeda: "USD", dias: 45, titulo: "Dólar", unidade: "R$" },
    euro:     { tipo: "ptax", moeda: "EUR", dias: 45, titulo: "Euro", unidade: "R$" },
};

function ptaxDateOffset(diasAtras: number): string {
    const d = new Date();
    d.setDate(d.getDate() - diasAtras);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}-${dd}-${d.getFullYear()}`;
}

// SGS por intervalo (dd/MM/yyyy). Usado em vez de ultimos/N porque o BCB
// rejeita ultimos/30 (HTTP 400) em algumas séries diárias (Selic, CDI).
const BCB_SGS_PER = (serie: number, di: string, df: string) =>
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${di}&dataFinal=${df}`;

function sgsDateOffset(diasAtras: number): string {
    const d = new Date();
    d.setDate(d.getDate() - diasAtras);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
}

async function fetchHistorico(indicador: string): Promise<{ titulo: string; unidade: string; historico: Array<{ data: string; valor: number }> }> {
    const cfg = HIST[indicador];
    if (!cfg) return { titulo: indicador, unidade: "", historico: [] };

    const cacheKey = `hist_${indicador}`;
    const cached = getCache<any>(cacheKey);
    if (cached) return cached;

    let historico: Array<{ data: string; valor: number }> = [];
    try {
        if (cfg.tipo === "sgs") {
            const n = cfg.n ?? 12;
            // janela ampla por data e corta os últimos N: diárias ~90 dias, mensais ~13×30 dias
            const diaria = indicador === "selic" || indicador === "cdi";
            const janelaDias = diaria ? 120 : (n + 2) * 31;
            const url = BCB_SGS_PER(SERIES[indicador], sgsDateOffset(janelaDias), sgsDateOffset(0));
            const raw = await getJson(url);
            const todos = (Array.isArray(raw) ? raw : [])
                .map((r: any) => ({ data: r.data, valor: Number(r.valor) }))
                .filter((r) => Number.isFinite(r.valor));
            historico = todos.slice(-n);
        } else {
            const di = ptaxDateOffset(cfg.dias ?? 45);
            const df = ptaxDateOffset(0);
            const url = cfg.moeda === "USD" ? PTAX_DOLAR_PER(di, df) : PTAX_MOEDA_PER(cfg.moeda!, di, df);
            const json = await getJson(url);
            const values = json?.value ?? [];
            // tipoBoletim: dólar usa "Fechamento PTAX"; moeda usa "Fechamento".
            // Pega o boletim de Fechamento; se não houver, usa o último do dia.
            const fechamentos = values.filter((v: any) => String(v.tipoBoletim ?? "").startsWith("Fechamento"));
            const base = fechamentos.length > 0 ? fechamentos : values;
            historico = base
                .map((v: any) => ({
                    data: String(v.dataHoraCotacao ?? "").slice(0, 10),  // yyyy-MM-dd
                    valor: Number(v.cotacaoVenda),
                }))
                .filter((r: any) => Number.isFinite(r.valor) && r.data);
        }
    } catch (e) {
        console.warn(`histórico ${indicador}:`, e instanceof Error ? e.message : e);
    }

    const result = { titulo: cfg.titulo, unidade: cfg.unidade, historico };
    if (historico.length > 0) setCache(cacheKey, result);  // não cacheia falha pontual
    return result;
}

// ── Bolsa (B3) via Yahoo Finance — grátis, sem API key ──
// Cotação com atraso (~15 min). Símbolos B3 usam sufixo .SA.
// Para editar os papéis exibidos na faixa, mexa em BOLSA_ATIVOS.
const YAHOO_CHART = (symbol: string) =>
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

// O Yahoo bloqueia requests sem User-Agent de navegador.
const YAHOO_HEADERS: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/json",
};

const BOLSA_ATIVOS: Array<{ symbol: string; label: string; tipo: string }> = [
    { symbol: "^BVSP", label: "Ibovespa", tipo: "indice" },
    { symbol: "PETR4.SA", label: "Petrobras PN", tipo: "acao" },
    { symbol: "PETR3.SA", label: "Petrobras ON", tipo: "acao" },
    { symbol: "VALE3.SA", label: "Vale ON", tipo: "acao" },
    { symbol: "ITUB4.SA", label: "Itaú PN", tipo: "acao" },
    { symbol: "BBDC4.SA", label: "Bradesco PN", tipo: "acao" },
    { symbol: "USDBRL=X", label: "Dólar", tipo: "moeda" },
];

interface AtivoBolsa { label: string; symbol: string; tipo: string; preco: number | null; variacao_pct: number | null }

async function fetchAtivoBolsa(ativo: { symbol: string; label: string; tipo: string }): Promise<AtivoBolsa> {
    const base: AtivoBolsa = { label: ativo.label, symbol: ativo.symbol, tipo: ativo.tipo, preco: null, variacao_pct: null };
    try {
        const json = await getJson(YAHOO_CHART(ativo.symbol), YAHOO_HEADERS);
        const meta = json?.chart?.result?.[0]?.meta;
        if (!meta) return base;
        const preco = meta.regularMarketPrice ?? null;
        const anterior = meta.chartPreviousClose ?? meta.previousClose ?? null;
        const variacao = preco != null && anterior ? ((preco - anterior) / anterior) * 100 : null;
        return { ...base, preco, variacao_pct: variacao };
    } catch (e) {
        console.warn(`bolsa ${ativo.symbol}:`, e instanceof Error ? e.message : e);
        return base;
    }
}

async function fetchBolsa(): Promise<AtivoBolsa[]> {
    const cached = getCache<AtivoBolsa[]>("bolsa");
    if (cached) return cached;
    const results = await Promise.all(BOLSA_ATIVOS.map(fetchAtivoBolsa));
    // Só cacheia se ao menos um papel veio com preço (não congela erro total).
    if (results.some((r) => r.preco != null)) setCache("bolsa", results);
    return results;
}

// ── Notícias ──
const IBGE_URL = (qtd: number) =>
    `https://servicodados.ibge.gov.br/api/v3/noticias/?qtd=${qtd}&tipo=noticia`;
const AGBR_RSS = "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml";

interface Noticia { titulo: string; resumo: string; link: string; data: string; fonte: string }

async function fetchNoticiasIbge(qtd: number): Promise<Noticia[]> {
    const cached = getCache<Noticia[]>("noticias_ibge");
    if (cached) return cached;
    try {
        const json = await getJson(IBGE_URL(qtd));
        const items = json?.items ?? [];
        const result: Noticia[] = items.map((it: any) => ({
            titulo: it.titulo ?? "",
            resumo: (it.introducao ?? "").slice(0, 200),
            link: it.link ?? "",
            data: it.data_publicacao ?? "",
            fonte: "IBGE",
        }));
        setCache("noticias_ibge", result);
        return result;
    } catch (e) {
        console.warn("notícias IBGE:", e instanceof Error ? e.message : e);
        return [];
    }
}

// RSS parse sem libs: regex sobre <item>…</item>
function parseRss(xml: string, qtd: number): Noticia[] {
    const items: Noticia[] = [];
    const blocks = xml.split(/<item>/i).slice(1);
    const pick = (block: string, tag: string): string => {
        const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
        const m = block.match(re);
        if (!m) return "";
        return m[1]
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
            .replace(/<[^>]+>/g, "")
            .trim();
    };
    for (const raw of blocks.slice(0, qtd)) {
        const block = raw.split(/<\/item>/i)[0];
        items.push({
            titulo: pick(block, "title"),
            resumo: pick(block, "description").slice(0, 200),
            link: pick(block, "link"),
            data: pick(block, "pubDate"),
            fonte: "Agência Brasil",
        });
    }
    return items;
}

async function fetchNoticiasAgbr(qtd: number): Promise<Noticia[]> {
    const cached = getCache<Noticia[]>("noticias_agbr");
    if (cached) return cached;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15_000);
        const resp = await fetch(AGBR_RSS, { headers: { Accept: "application/xml" }, signal: ctrl.signal });
        clearTimeout(t);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const xml = await resp.text();
        const result = parseRss(xml, qtd);
        setCache("noticias_agbr", result);
        return result;
    } catch (e) {
        console.warn("notícias Agência Brasil:", e instanceof Error ? e.message : e);
        return [];
    }
}

// ── Helpers ──
function fmtSgs(data: Array<{ data: string; valor: string }>, nome: string, unidade: string) {
    if (!data || data.length === 0) return { nome, valor: null, data: null, unidade };
    const ultimo = data[data.length - 1];
    const valor = Number(ultimo.valor);
    return { nome, valor: Number.isFinite(valor) ? valor : null, data: ultimo.data ?? null, unidade };
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        let recurso = "todos";
        let qtd = 5;
        let indicador = "selic";
        try {
            const body = await req.json();
            if (body?.recurso) recurso = String(body.recurso);
            if (body?.qtd) qtd = Number(body.qtd) || 5;
            if (body?.indicador) indicador = String(body.indicador);
        } catch (_) { /* sem body → todos */ }

        if (recurso === "historico") {
            return jsonResp(await fetchHistorico(indicador));
        }

        if (recurso === "bolsa") {
            return jsonResp({ ativos: await fetchBolsa() });
        }

        if (recurso === "noticias") {
            const [ibge, agbr] = await Promise.all([
                fetchNoticiasIbge(qtd),
                fetchNoticiasAgbr(qtd),
            ]);
            const todas: Noticia[] = [];
            for (let i = 0; i < Math.max(ibge.length, agbr.length); i++) {
                if (i < ibge.length) todas.push(ibge[i]);
                if (i < agbr.length) todas.push(agbr[i]);
            }
            return jsonResp({ noticias: todas.slice(0, qtd * 2) });
        }

        // recurso === "todos" (default): indicadores + notícias num payload só
        const [
            selic, cdi, ipca, ipca12m, igpm, inpc, dolar, euro, bolsa, ibge, agbr,
        ] = await Promise.all([
            fetchSgs("selic"), fetchSgs("cdi"), fetchSgs("ipca"),
            fetchSgs("ipca_12m"), fetchSgs("igpm"), fetchSgs("inpc"),
            fetchCambio("USD"), fetchCambio("EUR"), fetchBolsa(),
            fetchNoticiasIbge(qtd), fetchNoticiasAgbr(qtd),
        ]);

        const noticias: Noticia[] = [];
        for (let i = 0; i < Math.max(ibge.length, agbr.length); i++) {
            if (i < ibge.length) noticias.push(ibge[i]);
            if (i < agbr.length) noticias.push(agbr[i]);
        }

        return jsonResp({
            atualizado_em: new Date().toISOString(),
            cambio: { dolar, euro },
            juros: {
                selic: fmtSgs(selic, "Selic Meta", "% a.a."),
                cdi: fmtSgs(cdi, "CDI", "% a.d."),
            },
            inflacao: {
                ipca: fmtSgs(ipca, "IPCA Mensal", "%"),
                ipca_12m: fmtSgs(ipca12m, "IPCA Acum. 12m", "%"),
                igpm: fmtSgs(igpm, "IGP-M Mensal", "%"),
                inpc: fmtSgs(inpc, "INPC Mensal", "%"),
            },
            bolsa,
            noticias: noticias.slice(0, qtd * 2),
        });
    } catch (e) {
        console.error("indicadores-economicos:", e instanceof Error ? e.message : e);
        return jsonResp({ error: "Falha ao buscar indicadores" }, 500);
    }
});
