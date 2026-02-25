import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface TopCategoryItem {
    name: string;
    total: number;
}

interface TopCategoriesData {
    expenses: TopCategoryItem[];
    income: TopCategoryItem[];
}

interface TopCategoriesOverviewProps {
    topCategories: TopCategoriesData;
    formatCurrency: (value: number) => string;
}

export function TopCategoriesOverview({ topCategories, formatCurrency }: TopCategoriesOverviewProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Top despesas por categoria</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer
                        className="w-full min-h-[320px]"
                        config={{
                            total: { label: "Despesas", color: "hsl(var(--destructive))" },
                        }}
                    >
                        <BarChart data={topCategories.expenses} layout="vertical" margin={{ left: 80, right: 8, top: 8 }}>
                            <CartesianGrid horizontal={false} />
                            <XAxis type="number" tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={160}
                                tickFormatter={(v) => String(v).slice(0, 22)}
                            />
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
                            <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Top receitas por categoria</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer
                        className="w-full min-h-[320px]"
                        config={{
                            total: { label: "Receitas", color: "hsl(var(--success))" },
                        }}
                    >
                        <BarChart data={topCategories.income} layout="vertical" margin={{ left: 80, right: 8, top: 8 }}>
                            <CartesianGrid horizontal={false} />
                            <XAxis type="number" tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={160}
                                tickFormatter={(v) => String(v).slice(0, 22)}
                            />
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
                            <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>
    );
}
