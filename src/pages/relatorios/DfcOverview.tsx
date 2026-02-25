import { AlertTriangle, Landmark, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface DfcSummary {
    bankTotal: number;
    overdueReceivables: number;
}

interface CashflowBucketedItem {
    key: string;
    label: string;
    entradas: number;
    saidas: number;
    liquido: number;
    acumulado: number;
}

interface CashflowBucketed {
    groupByMonth: boolean;
    data: CashflowBucketedItem[];
}

interface DfcOverviewProps {
    isLoadingDfcSummary: boolean;
    dfcSummary?: DfcSummary;
    summaryNet: number;
    cashflowBucketed: CashflowBucketed;
    formatCurrency: (value: number) => string;
}

export function DfcOverview({
    isLoadingDfcSummary,
    dfcSummary,
    summaryNet,
    cashflowBucketed,
    formatCurrency,
}: DfcOverviewProps) {
    return (
        <div className="space-y-4">
            <h3 className="text-xl font-semibold tracking-tight">Saúde Financeira e Liquidez (DFC)</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Caixa atual (saldo bancário total)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold flex items-center gap-2">
                            <Landmark className="h-6 w-6 text-primary" />
                            {isLoadingDfcSummary ? "—" : formatCurrency(dfcSummary?.bankTotal ?? 0)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Geração de caixa (no período)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold flex items-center gap-2 ${summaryNet >= 0 ? "text-blue-600" : "text-red-600"}`}>
                            <TrendingUp className="h-6 w-6" />
                            {formatCurrency(summaryNet)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Inadimplência (AR atrasado)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 flex items-center gap-2">
                            <AlertTriangle className="h-6 w-6" />
                            {isLoadingDfcSummary ? "—" : formatCurrency(dfcSummary?.overdueReceivables ?? 0)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Fluxo de Caixa Operacional (realizado)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer
                        className="w-full min-h-[320px]"
                        config={{
                            entradas: { label: "Entradas", color: "hsl(var(--success))" },
                            saidas: { label: "Saídas", color: "hsl(var(--destructive))" },
                        }}
                    >
                        <BarChart data={cashflowBucketed.data} margin={{ left: 8, right: 8, top: 8 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="label" tickMargin={8} minTickGap={12} />
                            <YAxis tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} width={80} />
                            <ReferenceLine y={0} stroke="hsl(var(--border))" />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar dataKey="entradas" fill="var(--color-entradas)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="saidas" fill="var(--color-saidas)" radius={[0, 0, 4, 4]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>
    );
}
