import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSetorEmpresa } from "@/hooks/useSetorEmpresa";
import { useIndicadores } from "@/hooks/useIndicadores";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ──────────────────────────────────────────────────────────────────────────
 * Crescimento: você × o setor.
 *  • Crescimento do setor: dado REAL de mercado do IBGE — volume do varejo (PMC)
 *    ou de serviços (PMS), variação acumulada em 12 meses. É "quanto o setor cresceu".
 *  • Seu crescimento: variação do faturamento (vendas.valor_liquido confirmadas),
 *    12 meses vs 12 anteriores quando há histórico; senão a metade recente vs a
 *    anterior (janela curta, sinalizada). Compara os dois lado a lado.
 * ──────────────────────────────────────────────────────────────────────── */

const NAVY = "#071D41";
const CREME = "#F6F2EB";
const C = {
    text1: "#1D2939", text2: "#667085", muted: "#98A2B3",
    green: "#039855", red: "#E53E3E", border: "#EAECF0",
};

/* Perfil de setor (resolveSetor) → índice de volume do IBGE (crescimento de mercado).
 * Comércio → PMC; tudo que é serviço (inclui saúde/educação) → PMS. */
type GrowthKey = "pmc_varejo" | "pms_servicos";
const SETOR_GROWTH: Record<string, { key: GrowthKey; label: string } | undefined> = {
    varejo: { key: "pmc_varejo", label: "comércio varejista" },
    farmacia: { key: "pmc_varejo", label: "comércio varejista" },
    beleza: { key: "pms_servicos", label: "serviços" },
    alimentacao: { key: "pms_servicos", label: "serviços" },
    servicos: { key: "pms_servicos", label: "serviços" },
    tecnologia: { key: "pms_servicos", label: "serviços" },
    transporte: { key: "pms_servicos", label: "serviços" },
    medicina: { key: "pms_servicos", label: "serviços (saúde)" },
    odontologia: { key: "pms_servicos", label: "serviços (saúde)" },
    saude_prof: { key: "pms_servicos", label: "serviços (saúde)" },
    laboratorio: { key: "pms_servicos", label: "serviços (saúde)" },
    veterinaria: { key: "pms_servicos", label: "serviços (saúde)" },
    educacao: { key: "pms_servicos", label: "serviços (educação)" },
};

const pct = (v: number | null | undefined, d = 1) =>
    v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
function brlCompacto(v: number): string {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    if (v >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString("pt-BR")} mil`;
    return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

function Metric({ rotulo, valor, cor, tag }: { rotulo: string; valor: string; cor?: string; tag?: string }) {
    return (
        <div style={{ flex: "1 1 190px", minWidth: 170, background: "#fff", border: "var(--border-hairline)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: C.text2 }}>{rotulo}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: cor ?? C.text1, lineHeight: 1.1, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
            {tag && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>{tag}</div>}
        </div>
    );
}

export default function BenchmarkSetor({ companyId }: { companyId?: string }) {
    const { activeClient } = useAuth();
    const db = activeClient as any;
    const { setor } = useSetorEmpresa();
    const { indicadores } = useIndicadores();

    const hoje = useMemo(() => new Date(), []);
    const win = useMemo(() => {
        const fim = endOfMonth(hoje);
        const meses: string[] = [];
        for (let i = 23; i >= 0; i--) meses.push(format(subMonths(fim, i), "yyyy-MM"));
        return { start: format(startOfMonth(subMonths(fim, 23)), "yyyy-MM-dd"), end: format(fim, "yyyy-MM-dd"), meses };
    }, [hoje]);

    const { data: valores, isLoading } = useQuery<number[]>({
        queryKey: ["benchmark_fat24", companyId, win.start, win.end],
        enabled: !!companyId,
        staleTime: 30 * 60 * 1000,
        queryFn: async () => {
            const { data } = await db.from("vendas")
                .select("valor_liquido, data_venda")
                .eq("company_id", companyId).eq("status", "confirmado")
                .is("deleted_at", null)
                .gte("data_venda", win.start).lte("data_venda", win.end)
                .limit(100000);
            const map: Record<string, number> = {};
            (data || []).forEach((v: any) => {
                const ym = (v.data_venda || "").slice(0, 7);
                map[ym] = (map[ym] || 0) + Number(v.valor_liquido || 0);
            });
            return win.meses.map((m) => map[m] || 0);
        },
    });

    // Seu crescimento (médias mensais p/ não distorcer com meses faltando).
    const calc = useMemo(() => {
        const pts = (valores || []).map((v, i) => ({ v, i })).filter((x) => x.v > 0);
        const n = pts.length;
        const media = n ? pts.reduce((s, x) => s + x.v, 0) / n : 0;
        if (n < 6) return { cresc: null as number | null, janela: null as string | null, comparavel: false, n, media };
        // Tier 1: últimos 12m vs 12 anteriores (comparável ao setor, que é 12m)
        const last = pts.filter((x) => x.i >= 12);
        const prior = pts.filter((x) => x.i < 12);
        if (last.length >= 3 && prior.length >= 3) {
            const aL = last.reduce((s, x) => s + x.v, 0) / last.length;
            const aP = prior.reduce((s, x) => s + x.v, 0) / prior.length;
            return { cresc: aP > 0 ? ((aL - aP) / aP) * 100 : null, janela: "12 meses", comparavel: true, n, media };
        }
        // Tier 2: metade recente vs anterior (janela curta)
        const half = Math.floor(n / 2);
        const aO = pts.slice(0, half).reduce((s, x) => s + x.v, 0) / half;
        const aR = pts.slice(n - half).reduce((s, x) => s + x.v, 0) / half;
        return { cresc: aO > 0 ? ((aR - aO) / aO) * 100 : null, janela: `últimos ${half} meses`, comparavel: false, n, media };
    }, [valores]);

    const growth = SETOR_GROWTH[setor.key];
    const setorial = indicadores?.setorial;
    const setorCresc = growth && setorial ? setorial[growth.key]?.valor ?? null : null;
    const setorLabel = growth?.label ?? "setor";
    const ipca12m = indicadores?.inflacao?.ipca_12m?.valor ?? null;
    const inadPf = indicadores?.economia?.inadimplencia_pf?.valor ?? null;
    const desemprego = setorial?.desemprego?.valor ?? null;

    const leitura = useMemo(() => {
        if (calc.cresc == null) {
            const base = `Pra calcular seu crescimento preciso de ~6 meses de venda (você tem ${calc.n}).`;
            return { txt: setorCresc != null ? `${base} O ${setorLabel} cresceu ${pct(setorCresc)} no ano.` : base, cor: C.text2 };
        }
        if (setorCresc == null) {
            return { txt: `Seu faturamento ${calc.cresc >= 0 ? "cresceu" : "caiu"} ${pct(calc.cresc)} (${calc.janela}). Sem índice de mercado pro seu setor.`, cor: calc.cresc >= 0 ? C.green : C.red };
        }
        if (calc.comparavel) {
            const diff = calc.cresc - setorCresc;
            const comp = Math.abs(diff) < 1 ? "em linha com" : diff > 0 ? "ACIMA do" : "ABAIXO do";
            return { txt: `No último ano você ${calc.cresc >= 0 ? "cresceu" : "caiu"} ${pct(calc.cresc)} — ${comp} ${setorLabel}, que cresceu ${pct(setorCresc)}.`, cor: diff >= 0 ? C.green : C.red };
        }
        return { txt: `Seu faturamento ${calc.cresc >= 0 ? "cresceu" : "caiu"} ${pct(calc.cresc)} nos ${calc.janela}. O ${setorLabel} cresceu ${pct(setorCresc)} em 12 meses.`, cor: calc.cresc >= 0 ? C.green : C.red };
    }, [calc, setorCresc, setorLabel]);

    const periodoFim = format(endOfMonth(hoje), "MMM/yy", { locale: ptBR });
    const crescTag = calc.cresc != null
        ? `${calc.janela}${calc.media > 0 ? ` · ${brlCompacto(calc.media)}/mês` : ""}`
        : `${calc.n} ${calc.n === 1 ? "mês" : "meses"} de venda`;

    return (
        <div style={{ background: CREME, borderRadius: 10, border: "var(--border-hairline)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", background: NAVY }}>
                <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    Crescimento: você × o setor
                </span>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500, marginTop: 2 }}>
                    {setor.label} · faturamento × volume IBGE · até {periodoFim}
                </div>
            </div>

            <div style={{ padding: 14 }}>
                {isLoading ? (
                    <div style={{ height: 92, borderRadius: 8, background: "#fff", opacity: 0.6 }} className="animate-pulse" />
                ) : (
                    <>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            <Metric
                                rotulo="Seu crescimento"
                                valor={pct(calc.cresc)}
                                cor={calc.cresc == null ? C.muted : calc.cresc >= 0 ? C.green : C.red}
                                tag={crescTag}
                            />
                            <Metric
                                rotulo="Crescimento do setor"
                                valor={pct(setorCresc)}
                                cor={setorCresc == null ? C.muted : setorCresc >= 0 ? C.green : C.red}
                                tag={`${setorLabel} · volume · 12 meses`}
                            />
                        </div>

                        <div style={{ marginTop: 12, padding: "10px 12px", background: "#fff", border: "var(--border-hairline)", borderRadius: 8, fontSize: 12.5, lineHeight: 1.5, color: leitura.cor }}>
                            {leitura.txt}
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12, fontSize: 11.5, color: C.text2 }}>
                            <span>Desemprego: <b style={{ color: C.text1 }}>{pct(desemprego).replace("+", "")}</b></span>
                            <span>Inadimplência PF: <b style={{ color: C.text1 }}>{pct(inadPf, 2).replace("+", "")}</b></span>
                            <span>IPCA 12m: <b style={{ color: C.text1 }}>{pct(ipca12m, 2).replace("+", "")}</b></span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
