import { useMemo, useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
    ArrowDownCircle, ArrowUpCircle, Loader2, AlertTriangle, CheckCircle2,
    ChevronsUpDown, Check,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filter?: "credito" | "debito" | "all";
}

interface PendenciaMov {
    id: string;
    tipo: "credito" | "debito";
    valor: number;
    data: string;
    descricao: string | null;
    origem: string | null;
    conta_bancaria_id: string | null;
    conta_contabil_id: string | null;
    conta_bancaria: { name: string } | null;
    conta_contabil: { code: string; name: string } | null;
}

interface ChartAccount {
    id: string;
    code: string;
    name: string;
    account_type: string;
}

const ORIGENS_IGNORADAS = ["conta_receber", "conta_pagar", "transferencia"];

export function PendenciasReclassificacaoDialog({ open, onOpenChange, filter = "all" }: Props) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Editing state per row (descricao + conta_contabil_id)
    const [edits, setEdits] = useState<Record<string, { descricao: string; conta_contabil_id: string }>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [openCategoryFor, setOpenCategoryFor] = useState<string | null>(null);

    const { data: pendencias, isLoading, refetch } = useQuery<PendenciaMov[]>({
        queryKey: ["pendencias_reclassificacao_lista", selectedCompany?.id, filter],
        enabled: open && !!selectedCompany?.id,
        queryFn: async () => {
            const ac = activeClient as any;
            const origensFilter = `(${ORIGENS_IGNORADAS.join(",")})`;
            let q = ac
                .from("movimentacoes")
                .select(`
                    id, tipo, valor, data, descricao, origem,
                    conta_bancaria_id, conta_contabil_id,
                    conta_bancaria:bank_accounts(name),
                    conta_contabil:chart_of_accounts(code, name)
                `)
                .eq("company_id", selectedCompany!.id)
                .eq("status_conciliacao", "pendente")
                .or(`origem.is.null,origem.not.in.${origensFilter}`)
                .order("data", { ascending: false })
                .limit(200);

            if (filter === "credito") {
                q = q.eq("tipo", "credito").is("conta_receber_id", null);
            } else if (filter === "debito") {
                q = q.eq("tipo", "debito").is("conta_pagar_id", null);
            } else {
                q = q.or("and(tipo.eq.credito,conta_receber_id.is.null),and(tipo.eq.debito,conta_pagar_id.is.null)");
            }

            const { data, error } = await q;
            if (error) {
                console.error("[PendenciasReclassificacaoDialog] fetch error:", error);
                return [];
            }
            return (data || []) as PendenciaMov[];
        },
        staleTime: 0,
    });

    const { data: chartAccounts } = useQuery<ChartAccount[]>({
        queryKey: ["chart_accounts_reclassificacao", selectedCompany?.id],
        enabled: open && !!selectedCompany?.id,
        queryFn: async () => {
            const { data, error } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, code, name, account_type")
                .eq("company_id", selectedCompany!.id)
                .eq("status", "active")
                .eq("is_analytical", true)
                .order("code");
            if (error) return [];
            return (data || []) as ChartAccount[];
        },
    });

    // Seed edits when pendencias load
    useEffect(() => {
        if (!pendencias) return;
        setEdits(prev => {
            const next = { ...prev };
            for (const p of pendencias) {
                if (!next[p.id]) {
                    next[p.id] = {
                        descricao: p.descricao ?? "",
                        conta_contabil_id: p.conta_contabil_id ?? "",
                    };
                }
            }
            return next;
        });
    }, [pendencias]);

    const filteredAccounts = useMemo(() => {
        if (!chartAccounts) return [];
        return chartAccounts.filter(a => !/transfer/i.test(a.name));
    }, [chartAccounts]);

    const totalCount = pendencias?.length ?? 0;

    const handleSave = async (mov: PendenciaMov) => {
        const edit = edits[mov.id];
        if (!edit) return;
        if (!edit.conta_contabil_id) {
            toast({
                title: "Categoria obrigatória",
                description: "Selecione uma categoria contábil para reclassificar.",
                variant: "destructive",
            });
            return;
        }
        setSavingId(mov.id);
        try {
            const desc = edit.descricao.trim();
            const payload: Record<string, any> = {
                conta_contabil_id: edit.conta_contabil_id,
                descricao: desc || mov.descricao || "Lançamento manual",
                status_conciliacao: "ignorado",
            };
            const { error } = await (activeClient as any)
                .from("movimentacoes")
                .update(payload)
                .eq("id", mov.id);
            if (error) throw error;

            toast({
                title: "Reclassificada",
                description: `${formatBRL(mov.valor)} em ${format(parseISO(mov.data), "dd/MM/yyyy")}`,
            });

            // Invalida o contador do banner + lista do dialog + qualquer relatorio que use movimentacoes
            queryClient.invalidateQueries({ queryKey: ["pendencias-reclassificacao"] });
            queryClient.invalidateQueries({ queryKey: ["pendencias_reclassificacao_lista"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard_dre"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard_dre_detailed"] });
            queryClient.invalidateQueries({ queryKey: ["movimentacoes"] });
            await refetch();
        } catch (e: any) {
            toast({
                title: "Erro ao reclassificar",
                description: e?.message || String(e),
                variant: "destructive",
            });
        } finally {
            setSavingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="h-4 w-4 text-[#EA580C]" />
                        Movimentações pendentes de reclassificação
                    </DialogTitle>
                    <DialogDescription className="text-[12px]">
                        Lançamentos sem vínculo com Conta a Receber/Pagar. Atribua uma categoria contábil
                        para que apareçam corretamente no DRE e no Fluxo de Caixa. Os registros marcados
                        saem desta lista mas continuam visíveis em Movimentações.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-12 flex items-center justify-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando pendências...
                    </div>
                ) : totalCount === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                        <p className="text-sm font-semibold">Nada pendente</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Todas as movimentações estão classificadas.
                        </p>
                    </div>
                ) : (
                    <ScrollArea className="max-h-[60vh] pr-2">
                        <div className="space-y-2">
                            {pendencias!.map(mov => {
                                const edit = edits[mov.id] ?? { descricao: mov.descricao ?? "", conta_contabil_id: "" };
                                const isCredito = mov.tipo === "credito";
                                const isSaving = savingId === mov.id;
                                return (
                                    <div
                                        key={mov.id}
                                        className="border rounded-md p-3 bg-white grid grid-cols-12 gap-2 items-center"
                                    >
                                        <div className="col-span-1 flex items-center justify-center">
                                            {isCredito ? (
                                                <ArrowUpCircle className="h-5 w-5 text-emerald-600" />
                                            ) : (
                                                <ArrowDownCircle className="h-5 w-5 text-red-600" />
                                            )}
                                        </div>
                                        <div className="col-span-2">
                                            <div className="text-[11px] text-muted-foreground">
                                                {format(parseISO(mov.data), "dd/MM/yyyy", { locale: ptBR })}
                                            </div>
                                            <div className={`text-sm font-bold tabular-nums ${isCredito ? "text-emerald-700" : "text-red-700"}`}>
                                                {formatBRL(mov.valor)}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground truncate">
                                                {mov.conta_bancaria?.name ?? "—"}
                                            </div>
                                        </div>
                                        <div className="col-span-4">
                                            <label className="text-[11px] text-muted-foreground">Descrição</label>
                                            <Input
                                                value={edit.descricao}
                                                onChange={e => setEdits(prev => ({
                                                    ...prev,
                                                    [mov.id]: { ...prev[mov.id], descricao: e.target.value },
                                                }))}
                                                placeholder="Ex.: Tarifa banco, PIX João..."
                                                className="h-8 text-xs"
                                            />
                                            {mov.origem && (
                                                <Badge variant="outline" className="mt-1 text-[10px] uppercase">
                                                    {mov.origem}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="col-span-3">
                                            <label className="text-[11px] text-muted-foreground">Categoria contábil</label>
                                            <Popover
                                                open={openCategoryFor === mov.id}
                                                onOpenChange={isOpen => setOpenCategoryFor(isOpen ? mov.id : null)}
                                            >
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        className={cn(
                                                            "w-full justify-between h-8 text-xs font-normal bg-white",
                                                            !edit.conta_contabil_id && "text-muted-foreground"
                                                        )}
                                                    >
                                                        <span className="truncate">
                                                            {edit.conta_contabil_id
                                                                ? (() => {
                                                                    const c = filteredAccounts.find(a => a.id === edit.conta_contabil_id);
                                                                    return c ? `${c.code} — ${c.name}` : "Selecione...";
                                                                })()
                                                                : "Buscar categoria..."}
                                                        </span>
                                                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    className="w-[--radix-popover-trigger-width] p-0"
                                                    align="start"
                                                >
                                                    <Command>
                                                        <CommandInput placeholder="Digite código ou nome..." className="h-9" />
                                                        <CommandList className="max-h-[260px]">
                                                            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                                                            <CommandGroup>
                                                                {filteredAccounts.map(c => (
                                                                    <CommandItem
                                                                        key={c.id}
                                                                        value={`${c.code} ${c.name}`}
                                                                        onSelect={() => {
                                                                            setEdits(prev => ({
                                                                                ...prev,
                                                                                [mov.id]: { ...prev[mov.id], conta_contabil_id: c.id },
                                                                            }));
                                                                            setOpenCategoryFor(null);
                                                                        }}
                                                                    >
                                                                        <Check className={cn(
                                                                            "mr-2 h-3 w-3",
                                                                            edit.conta_contabil_id === c.id ? "opacity-100" : "opacity-0"
                                                                        )} />
                                                                        <span className="text-xs">{c.code} — {c.name}</span>
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="col-span-2 flex justify-end">
                                            <Button
                                                size="sm"
                                                onClick={() => handleSave(mov)}
                                                disabled={isSaving || !edit.conta_contabil_id}
                                                className="h-8 text-xs"
                                            >
                                                {isSaving ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    "Reclassificar"
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                )}

                {totalCount > 0 && (
                    <div className="text-[11px] text-muted-foreground pt-2 border-t">
                        {totalCount} pendência{totalCount > 1 ? "s" : ""} · Selecione a categoria e clique em
                        Reclassificar. Os lançamentos saem da lista mas ficam disponíveis em Movimentações
                        com o histórico preservado.
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
