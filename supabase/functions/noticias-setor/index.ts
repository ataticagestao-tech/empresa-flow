// ============================================================
// noticias-setor — Edge Function (Deno)
// Notícias por setor via Google News RSS (grátis, sem chave).
// Recebe { q: string, qtd?: number } — a query já vem montada pelo
// frontend (src/lib/setores.ts) a partir do CNAE da empresa.
// Cacheia por query em memória (30 min). verify_jwt=false.
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

// Cache em memória por query (sobrevive enquanto a instância estiver quente)
const _cache = new Map<string, { ts: number; data: unknown }>();
const TTL = 30 * 60 * 1000; // 30 min

interface Noticia { titulo: string; resumo: string; link: string; data: string; fonte: string }

// RSS parse sem libs (mesma abordagem do indicadores-economicos)
function pick(block: string, tag: string): string {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (!m) return "";
    return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
        .trim();
}

function parseGoogleNews(xml: string, qtd: number): Noticia[] {
    const out: Noticia[] = [];
    const blocks = xml.split(/<item>/i).slice(1);
    for (const raw of blocks.slice(0, qtd)) {
        const block = raw.split(/<\/item>/i)[0];
        const tituloRaw = pick(block, "title");
        const fonte = pick(block, "source");
        // Google News usa "Título - Fonte"; remove o sufixo da fonte do título.
        let titulo = tituloRaw;
        if (fonte && titulo.endsWith(` - ${fonte}`)) titulo = titulo.slice(0, -(fonte.length + 3));
        out.push({
            titulo: titulo || tituloRaw,
            resumo: "",
            link: pick(block, "link"),
            data: pick(block, "pubDate"),
            fonte: fonte || "Google Notícias",
        });
    }
    return out;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const body = await req.json().catch(() => ({}));
        const q = String(body.q ?? "").trim();
        const qtd = Math.min(Math.max(Number(body.qtd) || 6, 1), 15);
        if (!q) return jsonResp({ noticias: [] });

        const cacheKey = `${q}::${qtd}`;
        const hit = _cache.get(cacheKey);
        if (hit && Date.now() - hit.ts < TTL) return jsonResp(hit.data);

        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12_000);
        let noticias: Noticia[] = [];
        try {
            const resp = await fetch(url, {
                headers: {
                    Accept: "application/rss+xml, application/xml",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                },
                signal: ctrl.signal,
            });
            if (resp.ok) noticias = parseGoogleNews(await resp.text(), qtd);
        } finally {
            clearTimeout(t);
        }

        const payload = { noticias };
        if (noticias.length > 0) _cache.set(cacheKey, { ts: Date.now(), data: payload });
        return jsonResp(payload);
    } catch (e) {
        console.error("noticias-setor:", e);
        return jsonResp({ error: e instanceof Error ? e.message : String(e), noticias: [] }, 200);
    }
});
