import { ArrowDownCircle, ArrowUpCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import type { ReportSearchSelection } from "./useReportSearch";

type ArapSummary = {
    totalReceivable: number;
    totalPayable: number;
    net: number;
    countReceivable: number;
    countPayable: number;
};

type ArapBucketed = {
    groupByMonth: boolean;
    data: Array<{
        key: string;
        label: string;
        receber: number;
        pagar: number;
        saldo: number;
    }>;
};

interface ArapOverviewProps {
    selectedSearch: ReportSearchSelection | null;
    selectedSearchDisplay: string;
    selectedSearchKindLabel: string;
    isLoadingArap: boolean;
    arapSummary: ArapSummary;
    arapBucketed: ArapBucketed;
    typedDigits: string;
    formatCurrency: (value: number) => string;
}

export function ArapOverview({
    selectedSearch,
    selectedSearchDisplay,
    selectedSearchKindLabel,
    isLoadingArap,
    arapSummary,
    arapBucketed,
    typedDigits,
    formatCurrency,
}: ArapOverviewProps) {
    if (!selectedSearch) return null;

    return (
        <>
            <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedSearchKindLabel}:</span>{" "}
                {selectedSearchDisplay || selectedSearch.label}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-dashed">
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Contas a receber (vencimento)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600 flex items-center gap-2">
                            <ArrowUpCircle className="h-6 w-6" />
                            {isLoadingArap ? "—" : formatCurrency(arapSummary.totalReceivable)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {isLoadingArap ? "—" : `${arapSummary.countReceivable} lançamento(s)`}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-dashed">
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Contas a pagar (vencimento)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 flex items-center gap-2">
                            <ArrowDownCircle className="h-6 w-6" />
                            {isLoadingArap ? "—" : formatCurrency(arapSummary.totalPayable)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {isLoadingArap ? "—" : `${arapSummary.countPayable} lançamento(s)`}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-dashed">
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Saldo (AR - AP)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn("text-2xl font-bold flex items-center gap-2", arapSummary.net >= 0 ? "text-blue-600" : "text-red-600")}>
                            <TrendingUp className="h-6 w-6" />
                            {isLoadingArap ? "—" : formatCurrency(arapSummary.net)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {!isLoadingArap && arapSummary.countReceivable === 0 && arapSummary.countPayable === 0 && (
                <div className="text-sm text-muted-foreground">
                    <div>Filtro encontrado, mas não há lançamentos AR/AP no período selecionado.</div>
                    {selectedSearch.kind === "term" && (typedDigits.length === 11 || typedDigits.length === 14) && (
                        <div className="mt-1">
                            Dica: para CNPJ/CPF, selecione o Cliente/Fornecedor na lista (não “Texto”).
                        </div>
                    )}
                    <div className="mt-1">
                        Ajuste o período (datas no topo) para incluir os lançamentos.
                    </div>
                </div>
            )}

            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle>Comparativo AR x AP {arapBucketed.groupByMonth ? "(mensal)" : "(diário)"}</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer
                        className="w-full min-h-[320px]"
                        config={{
                            receber: { label: "A receber", color: "hsl(var(--success))" },
                            pagar: { label: "A pagar", color: "hsl(var(--destructive))" },
                        }}
                    >
                        <BarChart data={arapBucketed.data} margin={{ left: 8, right: 8, top: 8 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="label" tickMargin={8} minTickGap={12} />
                            <YAxis tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} width={80} />
                            <ReferenceLine y={0} stroke="hsl(var(--border))" />
                            <ChartTooltip
                                content={
                                    <ChartTooltipContent
                                        formatter={(value) => (
                                            <span className="font-mono font-medium tabular-nums text-foreground">
                                                {formatCurrency(Number(value))}
                                            </span>
                                        )}
                                    />
                                }
                            />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar dataKey="receber" fill="var(--color-receber)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="pagar" fill="var(--color-pagar)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </>
    );
}
