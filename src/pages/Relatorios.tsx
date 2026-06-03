import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { PeriodFilter } from "@/components/ui/period-filter";
import { PagePanel } from "@/components/layout/PagePanel";
import { CentralRelatorios } from "@/components/relatorios/CentralRelatorios";
import type { EmpresaInfo } from "@/lib/relatorios/gerar-relatorio";

export default function Relatorios() {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
        end: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
    });

    const empresaInfo = useMemo<EmpresaInfo>(
        () => ({
            nome:
                (selectedCompany as any)?.nome_fantasia ||
                (selectedCompany as any)?.razao_social ||
                "Empresa",
            razao_social: (selectedCompany as any)?.razao_social ?? null,
            cnpj: (selectedCompany as any)?.cnpj ?? null,
            local:
                [(selectedCompany as any)?.endereco_cidade, (selectedCompany as any)?.endereco_estado]
                    .filter(Boolean)
                    .join("/") || null,
        }),
        [selectedCompany],
    );

    const periodoLabel = useMemo(() => {
        try {
            return `${format(new Date(dateRange.start + "T12:00:00"), "dd/MM/yyyy")} a ${format(new Date(dateRange.end + "T12:00:00"), "dd/MM/yyyy")}`;
        } catch {
            return `${dateRange.start} a ${dateRange.end}`;
        }
    }, [dateRange.start, dateRange.end]);

    useEffect(() => {
        const stateRaw = sessionStorage.getItem("relatorios_state");
        if (!stateRaw) return;
        try {
            const parsed = JSON.parse(stateRaw) as any;
            if (parsed?.dateRange?.start && parsed?.dateRange?.end) {
                setDateRange({
                    start: String(parsed.dateRange.start),
                    end: String(parsed.dateRange.end),
                });
            }
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        sessionStorage.setItem("relatorios_state", JSON.stringify({ dateRange }));
    }, [dateRange]);

    useEffect(() => {
        const el = document.getElementById("app-scroll-container");
        if (!el) return;

        const key = "scroll:/relatorios";
        const saved = sessionStorage.getItem(key);
        if (saved) {
            const next = Number(saved);
            if (Number.isFinite(next)) {
                requestAnimationFrame(() => {
                    el.scrollTop = next;
                });
            }
        }

        return () => {
            sessionStorage.setItem(key, String(el.scrollTop || 0));
        };
    }, []);

    return (
        <AppLayout title="Relatórios">
            <div className="animate-fade-in">
                <PagePanel title="Relatórios" subtitle="Exporte seus dados em Excel ou PDF">
                    <div className="flex justify-end">
                    <PeriodFilter
                        from={dateRange.start}
                        to={dateRange.end}
                        onApply={(from, to) => {
                            if (from && to) {
                                setDateRange({ start: from, end: to });
                            } else {
                                setDateRange({
                                    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
                                    end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
                                });
                            }
                        }}
                    />
                    </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Central de Relatórios</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Baixe relatórios em Excel ou PDF. Os relatórios por período usam as datas do filtro acima
                            ({periodoLabel}); as listas de cadastro trazem todos os registros.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <CentralRelatorios
                            client={activeClient}
                            companyId={selectedCompany?.id}
                            empresa={empresaInfo}
                            range={dateRange}
                            periodoLabel={periodoLabel}
                        />
                    </CardContent>
                </Card>
                </PagePanel>
            </div>
        </AppLayout>
    );
}
