import { useState } from "react";
import { useIndicadores, useHistoricoIndicador } from "@/hooks/useIndicadores";
import { RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

/* ── Painel lateral de indicadores — estilo editorial (Valor) ── */
const C = {
    text1: "#1D2939",
    text2: "#667085",
    muted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
    green: "#059669",
    greenSoft: "#ECFDF4",
    serif: "Georgia, 'Times New Roman', serif",
};

const fmt = (v: number | null | undefined, d = 2) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/* casas decimais por indicador */
const CASAS: Record<string, number> = { dolar: 4, euro: 4, cdi: 4, selic: 2, ipca: 2, ipca_12m: 2, igpm: 2, inpc: 2 };

/* yyyy-MM-dd → dd/MM ; dd/MM/yyyy → dd/MM */
const eixoData = (s: string) => {
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const p = s.split("-"); return `${p[2]}/${p[1]}`; }
    if (s.includes("/")) { const p = s.split("/"); return `${p[0]}/${p[1]}`; }
    return s;
};

/* ── Gráfico de destaque (indicador selecionado) ── */
function GraficoDestaque({ indicador }: { indicador: string }) {
    const { data, isLoading, error } = useHistoricoIndicador(indicador);
    const casas = CASAS[indicador] ?? 2;

    let conteudo: React.ReactNode;
    if (isLoading) {
        conteudo = <div style={{ height: 120, borderRadius: 8, background: "#F2F4F7" }} className="animate-pulse" />;
    } else if (error || !data || data.historico.length === 0) {
        conteudo = <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.muted }}>Sem histórico disponível.</div>;
    } else {
        const dados = data.historico.map((p) => ({ ...p, eixo: eixoData(p.data) }));
        const vals = dados.map((d) => d.valor);
        const ultimo = vals[vals.length - 1];
        const primeiro = vals[0];
        const variacao = primeiro ? ((ultimo - primeiro) / primeiro) * 100 : 0;
        const subiu = variacao >= 0;
        const cor = subiu ? C.green : "#E53E3E";
        conteudo = (
            <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: C.text1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                        {data.unidade === "R$" ? "R$ " : ""}{fmt(ultimo, casas)}{data.unidade !== "R$" ? data.unidade : ""}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: cor, fontVariantNumeric: "tabular-nums" }}>
                        {subiu ? "▲" : "▼"} {fmt(Math.abs(variacao), 2)}%
                    </span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id={`g-${indicador}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={cor} stopOpacity={0.22} />
                                <stop offset="100%" stopColor={cor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="eixo" tick={{ fontSize: 9, fill: C.muted }} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: C.border }} minTickGap={28} />
                        <YAxis hide domain={["auto", "auto"]} />
                        <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}`, padding: "4px 8px" }}
                            labelStyle={{ color: C.muted, fontSize: 10 }}
                            formatter={(v: number) => [`${data.unidade === "R$" ? "R$ " : ""}${fmt(v, casas)}${data.unidade !== "R$" ? data.unidade : ""}`, data.titulo]}
                        />
                        <Area type="monotone" dataKey="valor" stroke={cor} strokeWidth={1.6} fill={`url(#g-${indicador})`} dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </>
        );
    }

    return (
        <div style={{ marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 4px", fontFamily: C.serif, fontSize: 17, fontWeight: 700, color: C.text1, letterSpacing: "-0.01em" }}>
                {data?.titulo ?? "Histórico"}
                <span style={{ fontSize: 10, fontWeight: 400, color: C.muted, marginLeft: 6 }}>
                    {indicador === "dolar" || indicador === "euro" ? "· 45 dias" : "· 12 meses"}
                </span>
            </h3>
            {conteudo}
        </div>
    );
}

interface RowProps {
    id: string;
    nome: string;
    a: string;
    b?: string;
    sel: boolean;
    onSelect: () => void;
}

function Linha({ id, nome, a, b, sel, onSelect }: RowProps) {
    return (
        <button
            onClick={onSelect}
            style={{
                width: "100%", display: "flex", alignItems: "baseline", justifyContent: "space-between",
                padding: "7px 8px", margin: "0 -8px",
                background: sel ? C.greenSoft : "transparent", borderRadius: sel ? 6 : 0,
                border: "none", borderTop: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
            }}
            title="Ver no gráfico"
        >
            <span style={{ fontSize: 12.5, fontWeight: sel ? 600 : 400, color: C.text1 }}>{nome}</span>
            <span style={{ display: "flex", gap: 14, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: C.text1, minWidth: 56, textAlign: "right" }}>{a}</span>
                {b !== undefined && <span style={{ fontSize: 12.5, fontWeight: 500, color: C.text2, minWidth: 56, textAlign: "right" }}>{b}</span>}
            </span>
        </button>
    );
}

function Titulo({ children }: { children: React.ReactNode }) {
    return (
        <h3 style={{ margin: "0 0 2px", fontFamily: C.serif, fontSize: 16, fontWeight: 700, color: C.text1, letterSpacing: "-0.01em" }}>
            {children}
        </h3>
    );
}

export default function IndicadoresEconomicos() {
    const { indicadores, loading, error, lastUpdate, refetch } = useIndicadores();
    const [sel, setSel] = useState<string>("dolar");

    const wrap: React.CSSProperties = {
        width: 240, flexShrink: 0,
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,.05)",
        alignSelf: "flex-start",
    };

    if (loading && !indicadores) {
        return <aside style={wrap}><div style={{ height: 320, borderRadius: 8, background: "#F2F4F7" }} className="animate-pulse" /></aside>;
    }

    if (!indicadores) {
        return (
            <aside style={wrap}>
                <Titulo>Mercado</Titulo>
                <p style={{ fontSize: 12, color: "#991B1B", margin: "10px 0" }}>⚠ Não foi possível carregar os indicadores.</p>
                <button onClick={() => refetch()} style={{ background: "none", border: "none", color: C.green, textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0 }}>
                    Tentar novamente
                </button>
            </aside>
        );
    }

    const { cambio, juros, inflacao } = indicadores;

    return (
        <aside style={wrap}>
            {/* Gráfico de destaque do indicador selecionado */}
            <GraficoDestaque indicador={sel} />

            {/* Moedas */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <Titulo>Moedas</Titulo>
                <button onClick={() => refetch()} title="Atualizar" style={{ display: "flex", padding: 3, border: "none", background: "transparent", color: C.muted, cursor: "pointer" }}>
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: C.muted, paddingBottom: 4 }}>
                <span style={{ minWidth: 56, textAlign: "right" }}>Compra</span>
                <span style={{ minWidth: 56, textAlign: "right" }}>Venda</span>
            </div>
            <Linha id="dolar" nome="Dólar" a={fmt(cambio.dolar?.compra, 4)} b={fmt(cambio.dolar?.venda, 4)} sel={sel === "dolar"} onSelect={() => setSel("dolar")} />
            <Linha id="euro" nome="Euro" a={fmt(cambio.euro?.compra, 4)} b={fmt(cambio.euro?.venda, 4)} sel={sel === "euro"} onSelect={() => setSel("euro")} />

            {/* Juros & Índices */}
            <div style={{ marginTop: 16 }}>
                <Titulo>Índices</Titulo>
                <div style={{ height: 4 }} />
                <Linha id="selic" nome="Selic (a.a.)" a={`${fmt(juros.selic?.valor)}%`} sel={sel === "selic"} onSelect={() => setSel("selic")} />
                <Linha id="cdi" nome="CDI (a.d.)" a={`${fmt(juros.cdi?.valor, 4)}%`} sel={sel === "cdi"} onSelect={() => setSel("cdi")} />
                <Linha id="ipca_12m" nome="IPCA 12m" a={`${fmt(inflacao.ipca_12m?.valor)}%`} sel={sel === "ipca_12m"} onSelect={() => setSel("ipca_12m")} />
                <Linha id="ipca" nome="IPCA mês" a={`${fmt(inflacao.ipca?.valor)}%`} sel={sel === "ipca"} onSelect={() => setSel("ipca")} />
                <Linha id="igpm" nome="IGP-M" a={`${fmt(inflacao.igpm?.valor)}%`} sel={sel === "igpm"} onSelect={() => setSel("igpm")} />
                <Linha id="inpc" nome="INPC" a={`${fmt(inflacao.inpc?.valor)}%`} sel={sel === "inpc"} onSelect={() => setSel("inpc")} />
            </div>

            {/* Rodapé */}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: C.muted }}>Fonte: BCB · clique p/ ver no gráfico</span>
                {lastUpdate && (
                    <span style={{ fontSize: 10, color: C.muted }}>
                        {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {error && <span title={error} style={{ color: "#E53E3E", marginLeft: 4 }}>⚠</span>}
                    </span>
                )}
            </div>
        </aside>
    );
}
