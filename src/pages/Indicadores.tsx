import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PontoEquilibrioCard } from "@/components/dashboard/PontoEquilibrioCard";
import { ComparativoMensalCard } from "@/components/dashboard/ComparativoMensalCard";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { ContextoIndicadores } from "@/components/dashboard/ContextoIndicadores";
import {
    startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, format,
} from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── Tokens (alinhados ao CompanyDashboard) ── */
const NAVY = "#071D41";
const C = {
    text1: "#1D2939",
    text2: "#667085",
    textMuted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
} as const;

type Period = "mes" | "mes_anterior" | "trimestre" | "ano";

/**
 * Aba "Indicadores" — casa dos indicadores financeiros gerenciais.
 * Hoje: Ciclo de Caixa (PMR / PMP / Ciclo Financeiro).
 * Próximos blocos: Liquidez/solvência de curto prazo e Ponto de equilíbrio.
 */
export default function Indicadores() {
    const { selectedCompany } = useCompany();
    const cId = selectedCompany?.id;
    const companyName = selectedCompany?.razao_social || selectedCompany?.nome_fantasia || "Empresa";

    const [period, setPeriod] = useState<Period>("mes_anterior");

    const { periodStart, periodEnd, periodLabel } = useMemo(() => {
        const today = new Date();
        switch (period) {
            case "mes_anterior": {
                const d = subMonths(today, 1);
                return {
                    periodStart: format(startOfMonth(d), "yyyy-MM-dd"),
                    periodEnd: format(endOfMonth(d), "yyyy-MM-dd"),
                    periodLabel: format(d, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase()),
                };
            }
            case "trimestre":
                return {
                    periodStart: format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"),
                    periodEnd: format(endOfMonth(today), "yyyy-MM-dd"),
                    periodLabel: "Últimos 3 meses",
                };
            case "ano":
                return {
                    periodStart: format(startOfYear(today), "yyyy-MM-dd"),
                    periodEnd: format(endOfYear(today), "yyyy-MM-dd"),
                    periodLabel: format(today, "yyyy"),
                };
            case "mes":
            default:
                return {
                    periodStart: format(startOfMonth(today), "yyyy-MM-dd"),
                    periodEnd: format(endOfMonth(today), "yyyy-MM-dd"),
                    periodLabel: format(today, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase()),
                };
        }
    }, [period]);

    return (
        <AppLayout title="Indicadores">
            {/* ── Abas do Dashboard (Visão Geral | Indicadores) ── */}
            <div style={{ marginBottom: 12 }}>
                <DashboardTabs active="indicadores" />
            </div>
            <div
                className="bg-white rounded-xl border border-[#EAECF0] shadow-sm p-6 pb-8 min-h-[calc(100vh-190px)]"
                style={{ fontFamily: "var(--font-base)" }}
            >
                {/* ── Header: empresa + período ── */}
                <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white" style={{ marginBottom: 20 }}>
                    <div
                        className="bg-[#071D41]"
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, padding: "12px 16px" }}
                    >
                        <div>
                            <div
                                style={{
                                    fontSize: 20, fontWeight: 700, color: "#fff",
                                    textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.15,
                                }}
                            >
                                Indicadores Financeiros
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 500, marginTop: 2 }}>
                                {companyName} · {periodLabel}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Filtro de período ── */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
                    <SegmentedControl<Period>
                        value={period}
                        onChange={setPeriod}
                        options={[
                            { value: "mes", label: "Mês", title: "Mês corrente" },
                            { value: "mes_anterior", label: "Mês anterior", title: "Mês passado completo" },
                            { value: "trimestre", label: "Trimestre", title: "Últimos 3 meses" },
                            { value: "ano", label: "Ano", title: "Ano corrente (do dia 1º de janeiro até hoje)" },
                        ]}
                    />
                </div>

                {!cId ? (
                    <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: C.textMuted }}>
                        Selecione uma empresa para ver os indicadores.
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                        <ContextoIndicadores companyId={cId} periodStart={periodStart} periodEnd={periodEnd} />
                        <PontoEquilibrioCard companyId={cId} periodStart={periodStart} periodEnd={periodEnd} />
                        <ComparativoMensalCard companyId={cId} />
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
