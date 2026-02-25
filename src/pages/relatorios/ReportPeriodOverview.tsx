import { ArrowDownCircle, ArrowUpCircle, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface ReportPeriodSummary {
    totalIn: number;
    totalOut: number;
    net: number;
}

interface ReportPeriodBucketedItem {
    key: string;
    label: string;
    receitas: number;
    despesas: number;
    saldo: number;
    acumulado: number;
}

interface ReportPeriodBucketed {
    groupByMonth: boolean;
    data: ReportPeriodBucketedItem[];
}

interface ReportPeriodOverviewProps {
    summary: ReportPeriodSummary;
    bucketed: ReportPeriodBucketed;
    formatCurrency: (value: number) => string;
}

export function ReportPeriodOverview({ summary, bucketed, formatCurrency }: ReportPeriodOverviewProps) {
    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Receitas no período</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600 flex items-center gap-2">
                            <ArrowUpCircle className="h-6 w-6" />
                            {formatCurrency(summary.totalIn)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Despesas no período</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 flex items-center gap-2">
                            <ArrowDownCircle className="h-6 w-6" />
                            {formatCurrency(summary.totalOut)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Resultado do período</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div
                            className={`text-2xl font-bold flex items-center gap-2 ${summary.net >= 0 ? "text-blue-600" : "text-red-600"}`}
                        >
                            <TrendingUp className="h-6 w-6" />
                            {formatCurrency(summary.net)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Receitas x Despesas {bucketed.groupByMonth ? "(mensal)" : "(diário)"}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer
                            className="w-full min-h-[320px]"
                            config={{
                                receitas: { label: "Receitas", color: "hsl(var(--success))" },
                                despesas: { label: "Despesas", color: "hsl(var(--destructive))" },
                            }}
                        >
                            <BarChart data={bucketed.data} margin={{ left: 8, right: 8, top: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="label" tickMargin={8} minTickGap={12} />
                                <YAxis tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} width={80} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="receitas" fill="var(--color-receitas)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="despesas" fill="var(--color-despesas)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Geração de Caixa (acumulada)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer
                            className="w-full min-h-[320px]"
                            config={{
                                acumulado: { label: "Saldo acumulado", color: "hsl(var(--primary))" },
                            }}
                        >
                            <LineChart data={bucketed.data} margin={{ left: 8, right: 8, top: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="label" tickMargin={8} minTickGap={12} />
                                <YAxis tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} width={80} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Line
                                    type="monotone"
                                    dataKey="acumulado"
                                    stroke="var(--color-acumulado)"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
