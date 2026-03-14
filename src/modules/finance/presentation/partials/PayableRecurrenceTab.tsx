
import { UseFormReturn } from "react-hook-form";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Repeat, BadgeDollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface PayableRecurrenceTabProps {
    form: UseFormReturn<AccountsPayable>;
}

const MONTHS = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

function MonthYearPicker({ value, onChange, label }: { value?: string; onChange: (v: string) => void; label: string }) {
    const [open, setOpen] = useState(false);
    const [year, setYear] = useState(new Date().getFullYear());

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !value && "text-muted-foreground")}>
                    {value || label}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-3" align="start">
                <div className="flex items-center justify-between mb-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setYear(y => y - 1)}>&lt;</Button>
                    <span className="text-sm font-semibold">{year}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setYear(y => y + 1)}>&gt;</Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {MONTHS.map((month, idx) => {
                        const val = `${String(idx + 1).padStart(2, "0")}/${year}`;
                        const isSelected = value === val;
                        return (
                            <Button
                                key={idx}
                                type="button"
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                className={cn("text-xs", isSelected && "bg-primary text-white")}
                                onClick={() => { onChange(val); setOpen(false); }}
                            >
                                {month}
                            </Button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function PayableRecurrenceTab({ form }: PayableRecurrenceTabProps) {
    const recurrence = form.watch("recurrence");
    const isFixed = form.watch("is_fixed_cost");
    const isActive = recurrence !== "none";

    return (
        <div className="space-y-6 pt-4">
            {/* Ativar recorrência */}
            <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center gap-3">
                    <Repeat className="h-5 w-5 text-primary" />
                    <h3 className="text-sm font-semibold">Recorrência</h3>
                </div>

                <FormField
                    control={form.control}
                    name="recurrence"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Frequência</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">Não repetir</SelectItem>
                                    <SelectItem value="daily">Diária</SelectItem>
                                    <SelectItem value="weekly">Semanal</SelectItem>
                                    <SelectItem value="monthly">Mensal</SelectItem>
                                    <SelectItem value="yearly">Anual</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {isActive && (
                    <div className="space-y-4 pt-2">
                        {/* Dia do vencimento (para mensal) */}
                        {recurrence === "monthly" && (
                            <FormField
                                control={form.control}
                                name="recurrence_day"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Dia do vencimento</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={31}
                                                placeholder="Ex: 10"
                                                value={field.value || ""}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value);
                                                    field.onChange(isNaN(val) ? undefined : Math.min(31, Math.max(1, val)));
                                                }}
                                            />
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground">Dia do mês em que a conta vence (1-31)</p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {/* Período da recorrência */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="recurrence_start"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Início</FormLabel>
                                        <FormControl>
                                            <MonthYearPicker
                                                value={field.value}
                                                onChange={field.onChange}
                                                label="Mês/ano de início"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="recurrence_end"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Fim (opcional)</FormLabel>
                                        <FormControl>
                                            <MonthYearPicker
                                                value={field.value}
                                                onChange={field.onChange}
                                                label="Mês/ano de término"
                                            />
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground">Deixe vazio para repetir indefinidamente</p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Quantidade de parcelas */}
                        <FormField
                            control={form.control}
                            name="recurrence_count"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Quantidade de parcelas (opcional)</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            min={1}
                                            placeholder="Ex: 12"
                                            value={field.value || ""}
                                            onChange={e => {
                                                const val = parseInt(e.target.value);
                                                field.onChange(isNaN(val) ? undefined : val);
                                            }}
                                        />
                                    </FormControl>
                                    <p className="text-xs text-muted-foreground">Número total de repetições. Alternativa ao mês/ano de término.</p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                )}
            </div>

            {/* Custo fixo */}
            <div className={cn("rounded-lg border p-4 space-y-3", isFixed && "border-primary bg-primary/5")}>
                <div className="flex items-center gap-3">
                    <BadgeDollarSign className={cn("h-5 w-5", isFixed ? "text-primary" : "text-muted-foreground")} />
                    <h3 className="text-sm font-semibold">Custo Fixo</h3>
                </div>

                <FormField
                    control={form.control}
                    name="is_fixed_cost"
                    render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                                <FormLabel className="text-sm">Marcar como custo fixo</FormLabel>
                                <p className="text-xs text-muted-foreground">
                                    Esta conta compõe o custo fixo mensal da empresa e será considerada em relatórios de custo fixo.
                                </p>
                            </div>
                            <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </div>

            {/* Resumo visual */}
            {isActive && (
                <div className="rounded-lg bg-muted/50 border p-4">
                    <p className="text-sm font-medium mb-1">Resumo da recorrência</p>
                    <p className="text-sm text-muted-foreground">
                        Esta conta será gerada{" "}
                        <strong>
                            {recurrence === "daily" && "diariamente"}
                            {recurrence === "weekly" && "semanalmente"}
                            {recurrence === "monthly" && "mensalmente"}
                            {recurrence === "yearly" && "anualmente"}
                        </strong>
                        {recurrence === "monthly" && form.watch("recurrence_day") && (
                            <> no dia <strong>{form.watch("recurrence_day")}</strong></>
                        )}
                        {form.watch("recurrence_start") && (
                            <> a partir de <strong>{form.watch("recurrence_start")}</strong></>
                        )}
                        {form.watch("recurrence_end") && (
                            <> até <strong>{form.watch("recurrence_end")}</strong></>
                        )}
                        {form.watch("recurrence_count") && !form.watch("recurrence_end") && (
                            <>, totalizando <strong>{form.watch("recurrence_count")} parcelas</strong></>
                        )}
                        .
                        {isFixed && <> Classificada como <strong>custo fixo</strong>.</>}
                    </p>
                </div>
            )}
        </div>
    );
}
