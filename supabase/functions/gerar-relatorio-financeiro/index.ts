// ============================================================
// gerar-relatorio-financeiro — Edge Function (Deno)
// Gera um relatório financeiro em PDF para uma empresa e devolve o PDF
// em base64 + um resumo curto em texto. Chamada server-a-server pela tool
// agente-tool-gerar_relatorio_pdf (service key, verify_jwt=false).
//
// Tipos suportados:
//   fluxo_caixa      — entradas/saídas por dia do período (movimentacoes)
//   contas_pagar     — títulos a pagar (default: só em aberto / o que falta)
//   contas_receber   — títulos a receber (default: só em aberto)
//   dre              — Demonstração de Resultado (fn_gerar_dre)
//   faturamento      — vendas confirmadas por dia + por forma de pagamento
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { renderRelatorio } from "./render.ts";
import type { Celula, RelatorioPDF, Secao } from "./render.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type TipoRelatorio = "fluxo_caixa" | "contas_pagar" | "contas_receber" | "dre" | "faturamento";

interface ReqBody {
    empresa_id: string;
    tipo: TipoRelatorio;
    data_inicio?: string; // YYYY-MM-DD (default 1º dia do mês corrente)
    data_fim?: string;    // YYYY-MM-DD (default hoje)
    escopo?: "abertas" | "todas"; // só p/ contas_pagar/contas_receber. Default "abertas".
}

const MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const STATUS_LABEL: Record<string, string> = {
    aberto: "Em aberto", parcial: "Parcial", vencido: "Vencido", pago: "Pago", cancelado: "Cancelado",
};

// ============================================================
serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    let body: ReqBody;
    try {
        body = await req.json();
    } catch {
        return jsonError("Body JSON inválido", 400);
    }
    if (!body.empresa_id) return jsonError("empresa_id obrigatório", 400);
    if (!body.tipo) return jsonError("tipo obrigatório", 400);

    const hoje = hojeSaoPaulo();
    const inicio = body.data_inicio && /^\d{4}-\d{2}-\d{2}$/.test(body.data_inicio)
        ? body.data_inicio : hoje.slice(0, 8) + "01";
    const fim = body.data_fim && /^\d{4}-\d{2}-\d{2}$/.test(body.data_fim)
        ? body.data_fim : hoje;
    const escopo = body.escopo === "todas" ? "todas" : "abertas";

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    try {
        // Empresa
        const { data: emp, error: empErr } = await service
            .from("companies")
            .select("id, razao_social, nome_fantasia")
            .eq("id", body.empresa_id)
            .maybeSingle();
        if (empErr) throw new Error(`companies: ${empErr.message}`);
        if (!emp) throw new Error("Empresa não encontrada");
        const empresaNome = (emp as any).nome_fantasia || (emp as any).razao_social || "Empresa";

        const periodo_label = periodoLabel(inicio, fim);

        let built: { titulo: string; resumo: string; rel: RelatorioPDF };
        switch (body.tipo) {
            case "fluxo_caixa": built = await buildFluxoCaixa(service, body.empresa_id, empresaNome, inicio, fim, periodo_label); break;
            case "contas_pagar": built = await buildContas(service, body.empresa_id, empresaNome, inicio, fim, periodo_label, escopo, "pagar"); break;
            case "contas_receber": built = await buildContas(service, body.empresa_id, empresaNome, inicio, fim, periodo_label, escopo, "receber"); break;
            case "dre": built = await buildDre(service, body.empresa_id, empresaNome, inicio, fim, periodo_label); break;
            case "faturamento": built = await buildFaturamento(service, body.empresa_id, empresaNome, inicio, fim, periodo_label); break;
            default: return jsonError(`tipo inválido: ${body.tipo}`, 400);
        }

        const pdfBytes = await renderRelatorio(built.rel);
        const filename = montarFilename(empresaNome, body.tipo, inicio, fim);

        return new Response(
            JSON.stringify({
                ok: true,
                pdfBase64: bytesToBase64(pdfBytes),
                filename,
                titulo: built.titulo,
                resumo: built.resumo,
                periodo: { inicio, fim },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        return jsonError(msg, 500);
    }
});

// ============================================================
// BUILDERS
// ============================================================

async function buildFluxoCaixa(
    client: SupabaseClient, companyId: string, empresaNome: string,
    inicio: string, fim: string, periodo_label: string,
): Promise<{ titulo: string; resumo: string; rel: RelatorioPDF }> {
    // Espelha o relatório "Fluxo de Caixa Mensal" (movimentacoes credito/debito),
    // mas quebrado POR DIA. credito = entrada, debito = saída.
    const { data: movs, error } = await client
        .from("movimentacoes")
        .select("data, valor, tipo")
        .eq("company_id", companyId)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: true });
    if (error) throw new Error(`movimentacoes: ${error.message}`);

    const porDia = new Map<string, { entradas: number; saidas: number }>();
    let totalEnt = 0, totalSai = 0;
    for (const m of (movs ?? []) as any[]) {
        const dia = String(m.data).slice(0, 10);
        const v = Number(m.valor) || 0;
        const acc = porDia.get(dia) || { entradas: 0, saidas: 0 };
        if (m.tipo === "credito") { acc.entradas += v; totalEnt += v; }
        else { acc.saidas += v; totalSai += v; }
        porDia.set(dia, acc);
    }

    const dias = Array.from(porDia.keys()).sort();
    const linhas: Celula[][] = dias.map((dia) => {
        const a = porDia.get(dia)!;
        const saldo = a.entradas - a.saidas;
        return [
            fmtDataBr(dia),
            { text: a.entradas ? fmtMoeda(a.entradas) : "—", align: "right", cor: a.entradas ? "green" : "muted" } as any,
            { text: a.saidas ? fmtMoeda(a.saidas) : "—", align: "right", cor: a.saidas ? "red" : "muted" } as any,
            { text: fmtSigned(saldo), cor: saldo >= 0 ? "green" : "red" },
        ];
    });

    const resultado = totalEnt - totalSai;
    const sec: Secao = {
        titulo: "ENTRADAS E SAÍDAS POR DIA",
        colunas: [
            { header: "Dia", flex: 16, align: "center" },
            { header: "Entradas", flex: 22, align: "right" },
            { header: "Saídas", flex: 22, align: "right" },
            { header: "Saldo do dia", flex: 22, align: "right" },
        ],
        linhas,
        total: ["TOTAL DO PERÍODO", fmtMoeda(totalEnt), fmtMoeda(totalSai), { text: fmtSigned(resultado), cor: resultado >= 0 ? "green" : "red" }],
        msgVazio: "Nenhuma movimentação no período",
    };

    const rel: RelatorioPDF = {
        empresa_nome: empresaNome,
        titulo: "Fluxo de Caixa",
        periodo_label,
        resumo_boxes: [
            { label: "Entradas", valor: fmtMoeda(totalEnt), cor: "green" },
            { label: "Saídas", valor: fmtMoeda(totalSai), cor: "red" },
            { label: "Resultado", valor: fmtSigned(resultado), cor: resultado >= 0 ? "green" : "red" },
        ],
        secoes: [sec],
    };
    const resumo = `📊 *Fluxo de caixa* — ${periodo_label}\nEntrou: ${fmtMoeda(totalEnt)}\nSaiu: ${fmtMoeda(totalSai)}\nSaldo: ${fmtSigned(resultado)}`;
    return { titulo: "Fluxo de Caixa", resumo, rel };
}

async function buildContas(
    client: SupabaseClient, companyId: string, empresaNome: string,
    inicio: string, fim: string, periodo_label: string,
    escopo: "abertas" | "todas", lado: "pagar" | "receber",
): Promise<{ titulo: string; resumo: string; rel: RelatorioPDF }> {
    const tabela = lado === "pagar" ? "contas_pagar" : "contas_receber";
    const nomeCol = lado === "pagar" ? "credor_nome" : "pagador_nome";
    const tituloBase = lado === "pagar" ? "Contas a Pagar" : "Contas a Receber";
    const verbo = lado === "pagar" ? "pagar" : "receber";

    let q = client
        .from(tabela)
        .select(`data_vencimento, ${nomeCol}, descricao, valor, valor_pago, status`)
        .eq("company_id", companyId)
        .is("deleted_at", null);

    if (escopo === "abertas") {
        // Só o que ainda falta: aberto/parcial/vencido, com vencimento até o fim do período.
        q = q.in("status", ["aberto", "parcial", "vencido"]).lte("data_vencimento", fim);
    } else {
        // Todas (menos canceladas) com vencimento dentro do período.
        q = q.neq("status", "cancelado").gte("data_vencimento", inicio).lte("data_vencimento", fim);
    }
    const { data, error } = await q.order("data_vencimento", { ascending: true });
    if (error) throw new Error(`${tabela}: ${error.message}`);

    const rows = (data ?? []) as any[];
    let total = 0;
    const linhas: Celula[][] = rows.map((r) => {
        const valorOrig = Number(r.valor) || 0;
        const pago = Number(r.valor_pago) || 0;
        // Em "abertas" mostramos o saldo restante (o que falta); em "todas", o valor cheio.
        const mostrar = escopo === "abertas" ? Math.max(valorOrig - pago, 0) : valorOrig;
        total += mostrar;
        const vencido = r.status === "vencido" || (["aberto", "parcial"].includes(r.status) && String(r.data_vencimento) < hojeSaoPaulo());
        return [
            { text: fmtDataBr(r.data_vencimento), align: "center", cor: vencido ? "red" : "body" } as any,
            r[nomeCol] || "—",
            r.descricao || "—",
            { text: STATUS_LABEL[r.status] || r.status, align: "center", cor: vencido ? "red" : "body" } as any,
            { text: fmtMoeda(mostrar), align: "right" } as any,
        ];
    });

    const colNome = lado === "pagar" ? "Credor" : "Pagador";
    const rotuloTotal = escopo === "abertas"
        ? `TOTAL A ${verbo.toUpperCase()} (em aberto)`
        : `TOTAL NO PERÍODO`;
    const sec: Secao = {
        titulo: escopo === "abertas" ? `TÍTULOS EM ABERTO` : `TÍTULOS NO PERÍODO`,
        colunas: [
            { header: "Vencimento", flex: 14, align: "center" },
            { header: colNome, flex: 24 },
            { header: "Descrição", flex: 28 },
            { header: "Status", flex: 14, align: "center" },
            { header: "Valor", flex: 16, align: "right" },
        ],
        linhas,
        total: [{ text: rotuloTotal, bold: true }, "", "", "", { text: fmtMoeda(total), align: "right" } as any],
        msgVazio: escopo === "abertas" ? `Nada a ${verbo} em aberto 🎉` : "Nenhum título no período",
    };

    const titulo = escopo === "abertas" ? `${tituloBase} (em aberto)` : tituloBase;
    const labelFinal = escopo === "abertas" ? `Posição em aberto até ${fmtDataBr(fim)}` : periodo_label;
    const rel: RelatorioPDF = {
        empresa_nome: empresaNome,
        titulo,
        periodo_label: labelFinal,
        resumo_boxes: [
            { label: escopo === "abertas" ? `A ${verbo}` : "Total", valor: fmtMoeda(total), cor: lado === "pagar" ? "red" : "green" },
            { label: "Títulos", valor: String(rows.length), cor: "body" },
        ],
        secoes: [sec],
    };
    const resumo = escopo === "abertas"
        ? `${lado === "pagar" ? "💸" : "💰"} *${tituloBase}* em aberto\n${rows.length} ${rows.length === 1 ? "título" : "títulos"} · total a ${verbo}: ${fmtMoeda(total)}`
        : `${lado === "pagar" ? "💸" : "💰"} *${tituloBase}* — ${periodo_label}\n${rows.length} ${rows.length === 1 ? "título" : "títulos"} · total: ${fmtMoeda(total)}`;
    return { titulo, resumo, rel };
}

async function buildDre(
    client: SupabaseClient, companyId: string, empresaNome: string,
    inicio: string, fim: string, periodo_label: string,
): Promise<{ titulo: string; resumo: string; rel: RelatorioPDF }> {
    // Espelha a tela DRE.tsx: regime de CAIXA — CR/CP PAGOS por data_pagamento,
    // agrupados por conta contábil (chart_of_accounts revenue/expense/cost).
    // (Não usa fn_gerar_dre — aquele motor de template está com agregação incompleta.)
    const sel = "valor, valor_pago, data_pagamento, conta_contabil_id";
    const qCR = client.from("contas_receber").select(sel)
        .eq("company_id", companyId).eq("status", "pago").is("deleted_at", null)
        .not("data_pagamento", "is", null).gte("data_pagamento", inicio).lte("data_pagamento", fim);
    const qCP = client.from("contas_pagar").select(sel)
        .eq("company_id", companyId).eq("status", "pago").is("deleted_at", null)
        .not("data_pagamento", "is", null).gte("data_pagamento", inicio).lte("data_pagamento", fim);
    const qContas = client.from("chart_of_accounts").select("id, code, name, account_type")
        .eq("company_id", companyId).in("account_type", ["revenue", "expense", "cost"]);

    const [crRes, cpRes, contasRes] = await Promise.all([qCR, qCP, qContas]);
    if (crRes.error) throw new Error(`contas_receber: ${crRes.error.message}`);
    if (cpRes.error) throw new Error(`contas_pagar: ${cpRes.error.message}`);
    if (contasRes.error) throw new Error(`chart_of_accounts: ${contasRes.error.message}`);

    const contasMap: Record<string, any> = {};
    for (const c of (contasRes.data ?? []) as any[]) contasMap[c.id] = c;

    // Agrega o realizado por conta (soma valor_pago; fallback valor).
    const porConta: Record<string, number> = {};
    const addRow = (r: any) => {
        const id = r.conta_contabil_id;
        if (!id || !contasMap[id]) return;
        porConta[id] = (porConta[id] || 0) + (Number(r.valor_pago ?? r.valor) || 0);
    };
    for (const r of (crRes.data ?? []) as any[]) addRow(r);
    for (const r of (cpRes.data ?? []) as any[]) addRow(r);

    const receitas: Array<{ codigo: string; nome: string; valor: number }> = [];
    const despesas: Array<{ codigo: string; nome: string; valor: number }> = [];
    let receitaTotal = 0, despesaTotal = 0;
    for (const [id, total] of Object.entries(porConta)) {
        const c = contasMap[id];
        if (c.account_type === "revenue") {
            receitas.push({ codigo: c.code || "", nome: c.name || "—", valor: total });
            receitaTotal += total;
        } else { // expense | cost
            const abs = Math.abs(total);
            despesas.push({ codigo: c.code || "", nome: c.name || "—", valor: abs });
            despesaTotal += abs;
        }
    }
    receitas.sort((a, b) => a.codigo.localeCompare(b.codigo));
    despesas.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const resultado = receitaTotal - despesaTotal;
    const margem = receitaTotal > 0 ? (resultado / receitaTotal) * 100 : 0;

    const colsConta = [
        { header: "Código", flex: 16 },
        { header: "Conta", flex: 56 },
        { header: "Valor", flex: 28, align: "right" as const },
    ];
    const secReceitas: Secao = {
        titulo: "RECEITAS (recebidas)",
        colunas: colsConta,
        linhas: receitas.map((l) => [l.codigo || "—", l.nome, { text: fmtMoeda(l.valor), align: "right", cor: "green" } as any]),
        total: ["", { text: "TOTAL DE RECEITAS", bold: true }, { text: fmtMoeda(receitaTotal), align: "right" } as any],
        msgVazio: "Nenhuma receita recebida no período",
    };
    const secDespesas: Secao = {
        titulo: "DESPESAS (pagas)",
        colunas: colsConta,
        linhas: despesas.map((l) => [l.codigo || "—", l.nome, { text: fmtMoeda(l.valor), align: "right", cor: "red" } as any]),
        total: ["", { text: "TOTAL DE DESPESAS", bold: true }, { text: fmtMoeda(despesaTotal), align: "right" } as any],
        msgVazio: "Nenhuma despesa paga no período",
    };
    const secResultado: Secao = {
        titulo: "RESULTADO",
        colunas: [
            { header: "", flex: 72 },
            { header: "Valor", flex: 28, align: "right" as const },
        ],
        linhas: [
            ["(+) Receitas", { text: fmtMoeda(receitaTotal), align: "right", cor: "green" } as any],
            ["(-) Despesas", { text: fmtMoeda(despesaTotal), align: "right", cor: "red" } as any],
        ],
        total: [{ text: "(=) RESULTADO DO PERÍODO", bold: true }, { text: fmtSigned(resultado), align: "right", cor: resultado >= 0 ? "green" : "red" } as any],
    };

    const rel: RelatorioPDF = {
        empresa_nome: empresaNome,
        titulo: "DRE",
        periodo_label: `${periodo_label} · regime de caixa`,
        resumo_boxes: [
            { label: "Receitas", valor: fmtMoeda(receitaTotal), cor: "green" },
            { label: "Despesas", valor: fmtMoeda(despesaTotal), cor: "red" },
            { label: "Resultado", valor: fmtSigned(resultado), cor: resultado >= 0 ? "green" : "red" },
        ],
        secoes: [secReceitas, secDespesas, secResultado],
    };
    const resumo = `📈 *DRE* (caixa) — ${periodo_label}\nReceitas: ${fmtMoeda(receitaTotal)}\nDespesas: ${fmtMoeda(despesaTotal)}\nResultado: ${fmtSigned(resultado)}${receitaTotal > 0 ? ` · margem ${margem.toFixed(1)}%` : ""}`;
    return { titulo: "DRE", resumo, rel };
}

async function buildFaturamento(
    client: SupabaseClient, companyId: string, empresaNome: string,
    inicio: string, fim: string, periodo_label: string,
): Promise<{ titulo: string; resumo: string; rel: RelatorioPDF }> {
    const { data, error } = await client
        .from("vendas")
        .select("data_venda, valor_liquido, forma_pagamento")
        .eq("company_id", companyId)
        .eq("status", "confirmado")
        .is("deleted_at", null)
        .gte("data_venda", inicio)
        .lte("data_venda", fim)
        .order("data_venda", { ascending: true });
    if (error) throw new Error(`vendas: ${error.message}`);

    const rows = (data ?? []) as any[];
    const porDia = new Map<string, { qtd: number; total: number }>();
    const porForma = new Map<string, { qtd: number; total: number }>();
    let totalGeral = 0;
    for (const v of rows) {
        const dia = String(v.data_venda).slice(0, 10);
        const valor = Number(v.valor_liquido) || 0;
        totalGeral += valor;
        const d = porDia.get(dia) || { qtd: 0, total: 0 };
        d.qtd++; d.total += valor; porDia.set(dia, d);
        const fk = formaLabel(v.forma_pagamento);
        const f = porForma.get(fk) || { qtd: 0, total: 0 };
        f.qtd++; f.total += valor; porForma.set(fk, f);
    }

    const dias = Array.from(porDia.keys()).sort();
    const linhasDia: Celula[][] = dias.map((dia) => {
        const a = porDia.get(dia)!;
        return [fmtDataBr(dia), { text: String(a.qtd), align: "center" } as any, { text: fmtMoeda(a.total), align: "right" } as any];
    });
    const secDia: Secao = {
        titulo: "FATURAMENTO POR DIA",
        colunas: [
            { header: "Dia", flex: 40, align: "center" },
            { header: "Vendas", flex: 25, align: "center" },
            { header: "Total", flex: 35, align: "right" },
        ],
        linhas: linhasDia,
        total: ["TOTAL DO PERÍODO", { text: String(rows.length), align: "center" } as any, { text: fmtMoeda(totalGeral), align: "right" } as any],
        msgVazio: "Nenhuma venda confirmada no período",
    };

    const formas = Array.from(porForma.entries()).sort((a, b) => b[1].total - a[1].total);
    const secForma: Secao = {
        titulo: "POR FORMA DE PAGAMENTO",
        colunas: [
            { header: "Forma de pagamento", flex: 50 },
            { header: "Vendas", flex: 20, align: "center" },
            { header: "Total", flex: 30, align: "right" },
        ],
        linhas: formas.map(([forma, a]) => [forma, { text: String(a.qtd), align: "center" } as any, { text: fmtMoeda(a.total), align: "right" } as any]),
        msgVazio: "—",
    };

    const ticket = rows.length ? totalGeral / rows.length : 0;
    const rel: RelatorioPDF = {
        empresa_nome: empresaNome,
        titulo: "Faturamento",
        periodo_label,
        resumo_boxes: [
            { label: "Faturamento", valor: fmtMoeda(totalGeral), cor: "green" },
            { label: "Vendas", valor: String(rows.length), cor: "body" },
            { label: "Ticket médio", valor: fmtMoeda(ticket), cor: "body" },
        ],
        secoes: rows.length ? [secDia, secForma] : [secDia],
    };
    const resumo = `🧾 *Faturamento* — ${periodo_label}\n${fmtMoeda(totalGeral)} em ${rows.length} ${rows.length === 1 ? "venda" : "vendas"}\nTicket médio: ${fmtMoeda(ticket)}`;
    return { titulo: "Faturamento", resumo, rel };
}

// ============================================================
// HELPERS
// ============================================================
function jsonError(msg: string, status: number) {
    return new Response(JSON.stringify({ ok: false, erro: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function hojeSaoPaulo(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
}

function periodoLabel(inicio: string, fim: string): string {
    const mesIni = inicio.slice(0, 7);
    const mesFim = fim.slice(0, 7);
    if (mesIni === mesFim) {
        const [y, m] = inicio.split("-");
        const nome = MESES[Number(m) - 1] || m;
        return `${cap(nome)} de ${y}`;
    }
    return `${fmtDataBr(inicio)} a ${fmtDataBr(fim)}`;
}

function montarFilename(empresaNome: string, tipo: TipoRelatorio, inicio: string, fim: string): string {
    const tipoSlug: Record<TipoRelatorio, string> = {
        fluxo_caixa: "fluxo-caixa", contas_pagar: "contas-a-pagar",
        contas_receber: "contas-a-receber", dre: "dre", faturamento: "faturamento",
    };
    const mesIni = inicio.slice(0, 7);
    const mesFim = fim.slice(0, 7);
    let periodoSlug: string;
    if (mesIni === mesFim) {
        const [y, m] = inicio.split("-");
        periodoSlug = `${MESES[Number(m) - 1] || m}-${y}`;
    } else {
        periodoSlug = `${inicio}_a_${fim}`;
    }
    return `${slug(empresaNome)}-${tipoSlug[tipo]}-${slug(periodoSlug)}.pdf`;
}

function slug(s: string): string {
    return (s || "relatorio")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "relatorio";
}

function fmtMoeda(v: number): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

function fmtSigned(v: number): string {
    const sign = v > 0 ? "+ " : v < 0 ? "- " : "";
    return `${sign}${fmtMoeda(Math.abs(v))}`;
}

function fmtDataBr(iso: string): string {
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
}

function cap(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formaLabel(forma: string | null): string {
    const f = (forma || "").toLowerCase().trim();
    if (!f) return "Não informado";
    if (f === "multiplo" || f === "múltiplo") return "Múltiplo";
    if (f === "pix") return "PIX";
    if (f === "ted") return "TED";
    if (f === "dinheiro" || f === "especie" || f === "espécie") return "Dinheiro / Espécie";
    if (f === "cartao_debito" || f === "debito") return "Cartão de Débito";
    if (f === "cartao_credito" || f === "credito" || f === "parcelado") return "Cartão de Crédito";
    if (f === "boleto") return "Boleto";
    return cap(f);
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
}
