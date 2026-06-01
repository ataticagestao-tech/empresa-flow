import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { Info } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";

/* ── Vendas por item × mês passado — barras deitadas sobrepostas (bullet), fundo creme ── */
const C = {
    text1: "#1D2939",
    text2: "#667085",
    muted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
    navy: "#071D41",
    cream: "#F6F2EB",
    green: "#059669",
    prevBar: "rgba(239, 159, 39, 0.42)", // mês passado — laranja translúcida
    divider: "rgba(29, 41, 57, 0.08)", // linha transparente entre itens
    red: "#E53E3E",
};

interface Props {
    companyId?: string;
    periodStart: string; // 'YYYY-MM-DD'
    periodEnd: string; // 'YYYY-MM-DD'
}

interface ItemCmp {
    descricao: string;
    atual: number;
    anterior: number;
}

/** Parse 'YYYY-MM-DD' como data local (evita shift de timezone). */
function parseDateLocal(s: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return new Date(s);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Faturamento por item: rateia o valor_liquido de cada venda entre seus itens
 * proporcional ao share de cada um (mesma lógica do breakdown do dashboard).
 * Vendas sem itens caem no 'procedimento' (ex.: contrato).
 */
function faturamentoPorItem(vendas: any[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const v of vendas || []) {
        const valor = Number(v.valor_liquido || 0);
        if (valor <= 0 || !v.data_venda) continue;
        const itens = Array.isArray(v.vendas_itens) ? v.vendas_itens : [];
        const totalItens = itens.reduce((s: number, it: any) => s + Number(it.valor_total || 0), 0);
        if (itens.length > 0 && totalItens > 0) {
            for (const it of itens) {
                const desc = (it.descricao || "Sem descrição").trim();
                const fat = valor * (Number(it.valor_total || 0) / totalItens);
                map.set(desc, (map.get(desc) || 0) + fat);
            }
        } else if (v.procedimento) {
            const desc = String(v.procedimento).trim();
            map.set(desc, (map.get(desc) || 0) + valor);
        }
    }
    return map;
}

const fmtR$ = (v: number) =>
    v >= 1000
        ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
        : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function VendasPorItemCard({ companyId, periodStart, periodEnd }: Props) {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const db = activeClient as any;
    const cId = companyId || selectedCompany?.id;

    // Mês passado = mesmo intervalo deslocado 1 mês (comparação alinhada por dia).
    const prevStart = format(subMonths(parseDateLocal(periodStart), 1), "yyyy-MM-dd");
    const prevEnd = format(subMonths(parseDateLocal(periodEnd), 1), "yyyy-MM-dd");

    const { data, isLoading } = useQuery({
        queryKey: ["vendas_por_item", cId, periodStart, periodEnd],
        enabled: !!db && !!cId,
        queryFn: async (): Promise<ItemCmp[]> => {
            const sel = "id, valor_liquido, data_venda, procedimento, vendas_itens(descricao, valor_total)";
            const base = () =>
                db.from("vendas").select(sel).eq("company_id", cId).eq("status", "confirmado").is("deleted_at", null).limit(10000);
            const [cur, prev] = await Promise.all([
                base().gte("data_venda", periodStart).lte("data_venda", periodEnd),
                base().gte("data_venda", prevStart).lte("data_venda", prevEnd),
            ]);
            const mAtual = faturamentoPorItem(cur.data || []);
            const mAnt = faturamentoPorItem(prev.data || []);
            const arr: ItemCmp[] = [];
            new Set<string>([...mAtual.keys(), ...mAnt.keys()]).forEach((k) =>
                arr.push({ descricao: k, atual: mAtual.get(k) || 0, anterior: mAnt.get(k) || 0 }),
            );
            arr.sort((a, b) => b.atual - a.atual || b.anterior - a.anterior);
            return arr;
        },
    });

    const items = data || [];
    const max = useMemo(() => Math.max(1, ...items.flatMap((i) => [i.atual, i.anterior])), [items]);
    const pct = (v: number) => (v > 0 ? Math.max(2, (v / max) * 100) : 0);

    return (
        <section style={{ background: C.surface, border: "var(--border-hairline)", borderRadius: 12, overflow: "hidden", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            {/* Header — padrão navy (igual aos demais cards) */}
            <div style={{ padding: "14px 16px", background: C.navy }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>Vendas por item</span>
                    <span
                        title="Faturamento (R$) de cada item/serviço no período atual vs. o mesmo intervalo do mês passado. Barra laranja = mês passado; barra verde = mês atual. Rateia o valor líquido da venda entre os itens."
                        style={{ display: "inline-flex", cursor: "help" }}
                    >
                        <Info size={13} style={{ color: "rgba(255,255,255,0.6)" }} />
                    </span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500, marginTop: 2 }}>R$ · período atual vs. mês passado</div>
            </div>

            {/* Legenda */}
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.text2, padding: "10px 16px 0" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 12, height: 5, background: C.green, borderRadius: 3 }} /> mês atual
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 12, height: 11, background: C.prevBar, borderRadius: 3 }} /> mês passado
                </span>
            </div>

            {/* Body — fundo creme + scroll vertical */}
            {isLoading ? (
                <div style={{ margin: 12, height: 96, borderRadius: 8, background: C.cream }} className="animate-pulse" />
            ) : items.length === 0 ? (
                <p style={{ fontSize: 13, color: C.muted, margin: "14px 0", textAlign: "center" }}>Sem vendas no período.</p>
            ) : (
                <div
                    style={{
                        margin: "8px 12px 12px",
                        padding: "8px 12px",
                        background: C.cream,
                        borderRadius: 8,
                        maxHeight: 176,
                        overflowY: "auto",
                    }}
                >
                    {items.map((it, idx) => {
                        const delta =
                            it.anterior > 0 ? ((it.atual - it.anterior) / it.anterior) * 100 : it.atual > 0 ? null : 0;
                        const subiu = (delta ?? 0) >= 0;
                        return (
                            <div
                                key={it.descricao}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(88px, 140px) 1fr 116px",
                                    gap: 12,
                                    alignItems: "center",
                                    padding: "7px 0",
                                    borderTop: idx === 0 ? "none" : `1px solid ${C.divider}`,
                                }}
                            >
                                {/* Nome */}
                                <span
                                    title={it.descricao}
                                    style={{ fontSize: 12, fontWeight: 500, color: C.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                >
                                    {it.descricao}
                                </span>

                                {/* Barra sobreposta (bullet): mês passado atrás (grosso), mês atual na frente (fino) */}
                                <div style={{ position: "relative", height: 12 }}>
                                    <div style={{ position: "absolute", left: 0, top: 0, height: 12, width: `${pct(it.anterior)}%`, background: C.prevBar, borderRadius: 6 }} />
                                    <div style={{ position: "absolute", left: 0, top: 3.5, height: 5, width: `${pct(it.atual)}%`, background: C.green, borderRadius: 3, transition: "width .3s" }} />
                                </div>

                                {/* Valor + variação (uma linha) */}
                                <div style={{ textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text1 }}>{fmtR$(it.atual)}</span>{" "}
                                    {delta === null ? (
                                        <span style={{ fontSize: 10.5, fontWeight: 600, color: C.green }}>novo</span>
                                    ) : (
                                        <span style={{ fontSize: 10.5, fontWeight: 600, color: subiu ? C.green : C.red }}>
                                            {subiu ? "▲" : "▼"}{Math.abs(delta).toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
