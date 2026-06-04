import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Produto {
    id: string;
    code: string | null;
    description: string;
    conta_contabil_id: string | null;
    is_active: boolean;
}

interface ChartAccount {
    id: string;
    code: string;
    name: string;
    type?: string;
    account_type?: string;
}

const LB = "text-[11px] font-bold uppercase tracking-wider text-[#1D2939]";

/** Dropdown de conta contábil com busca: digite código ou nome e a lista filtra. */
function ContaCombobox({ value, contas, onChange, placeholder = "— sem categoria —" }: {
    value: string | null;
    contas: ChartAccount[];
    onChange: (id: string | null) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const selected = value ? contas.find(c => c.id === value) : null;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" role="combobox" aria-expanded={open}
                    className={`w-full flex items-center justify-between gap-2 border border-[#ccc] rounded-md px-2 py-1.5 text-sm text-left focus:border-[#059669] focus:outline-none ${selected ? "text-[#1D2939]" : "text-[#999]"}`}>
                    <span className="truncate">{selected ? `${selected.code} - ${selected.name}` : placeholder}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Digite código ou nome..." className="h-9" />
                    <CommandList>
                        <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem value="— sem categoria —"
                                onSelect={() => { onChange(null); setOpen(false); }}>
                                <Check className={`mr-2 h-4 w-4 ${!value ? "opacity-100" : "opacity-0"}`} />
                                — sem categoria —
                            </CommandItem>
                            {contas.map(c => (
                                <CommandItem key={c.id} value={`${c.code} ${c.name}`}
                                    onSelect={() => { onChange(c.id); setOpen(false); }}>
                                    <Check className={`mr-2 h-4 w-4 shrink-0 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                                    <span className="truncate">{c.code} - {c.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function CategoriaContabilContent() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();

    const [filtro, setFiltro] = useState<"todos" | "sem_categoria">("sem_categoria");
    const [search, setSearch] = useState("");
    const [pendentes, setPendentes] = useState<Record<string, string | null>>({});
    const [saving, setSaving] = useState(false);
    const [bulkContaId, setBulkContaId] = useState<string>("");

    const { data: produtos = [], isLoading: loadingProdutos } = useQuery({
        queryKey: ["produtos-categoria", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("products")
                .select("id, code, description, conta_contabil_id, is_active")
                .eq("company_id", selectedCompany.id)
                .eq("is_active", true)
                .order("description");
            if (error) throw error;
            return data as Produto[];
        },
        enabled: !!selectedCompany?.id,
    });

    const { data: contas = [] } = useQuery({
        queryKey: ["chart-of-accounts-receita", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, code, name, account_type, type, is_analytical, status")
                .eq("company_id", selectedCompany.id)
                .order("code");
            if (error) throw error;
            const tipo = (a: any) => a.account_type || a.type;
            return ((data ?? []) as any[]).filter(c =>
                tipo(c) === "revenue" || tipo(c) === "receita"
            ).filter(c =>
                c.is_analytical === undefined ? true : c.is_analytical
            ).filter(c =>
                c.status ? c.status === "active" : true
            ) as ChartAccount[];
        },
        enabled: !!selectedCompany?.id,
    });

    useEffect(() => {
        setPendentes({});
    }, [selectedCompany?.id]);

    const valorAtual = (p: Produto): string | null => {
        if (pendentes[p.id] !== undefined) return pendentes[p.id];
        return p.conta_contabil_id;
    };

    const filtered = useMemo(() => {
        return produtos.filter(p => {
            const conta = valorAtual(p);
            if (filtro === "sem_categoria" && conta) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (!`${p.code || ""} ${p.description}`.toLowerCase().includes(q)) return false;
            }
            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [produtos, filtro, search, pendentes]);

    const totalPendentes = Object.keys(pendentes).filter(id => {
        const p = produtos.find(x => x.id === id);
        return p && pendentes[id] !== p.conta_contabil_id;
    }).length;

    const aplicarEmMassa = () => {
        if (!bulkContaId) {
            toast.error("Selecione uma categoria pra aplicar em massa.");
            return;
        }
        const novosPendentes = { ...pendentes };
        for (const p of filtered) {
            if (valorAtual(p) !== bulkContaId) {
                novosPendentes[p.id] = bulkContaId;
            }
        }
        setPendentes(novosPendentes);
        toast.success(`Categoria aplicada a ${filtered.length} produto(s). Clique em Salvar para confirmar.`);
    };

    const salvar = async () => {
        const ids = Object.keys(pendentes).filter(id => {
            const p = produtos.find(x => x.id === id);
            return p && pendentes[id] !== p.conta_contabil_id;
        });
        if (ids.length === 0) {
            toast.info("Nenhuma alteração pendente.");
            return;
        }
        setSaving(true);
        try {
            const db = activeClient as any;
            const erros: string[] = [];
            for (const id of ids) {
                const { error } = await db.from("products")
                    .update({ conta_contabil_id: pendentes[id] || null })
                    .eq("id", id);
                if (error) erros.push(`${id}: ${error.message}`);
            }
            if (erros.length > 0) {
                toast.error(`${erros.length} produto(s) com erro. Veja o console.`);
                console.error("[CategoriaContabil] erros:", erros);
            } else {
                toast.success(`${ids.length} produto(s) atualizados.`);
            }
            queryClient.invalidateQueries({ queryKey: ["produtos-categoria"] });
            queryClient.invalidateQueries({ queryKey: ["products"] });
            setPendentes({});
        } catch (err: any) {
            toast.error("Erro: " + (err.message || "desconhecido"));
        } finally {
            setSaving(false);
        }
    };

    const aplicarBackfillCR = async () => {
        if (!selectedCompany?.id) return;
        if (!confirm("Atualizar conta contábil de TODAS as Contas a Receber baseado no produto vinculado? Isso afeta também CRs já pagas (apenas reclassificação, sem mexer em valor/data).")) return;
        setSaving(true);
        try {
            const db = activeClient as any;
            const { data, error } = await db.rpc("backfill_cr_conta_contabil_via_produto", { p_company_id: selectedCompany.id });
            if (error) throw error;
            toast.success(`${data ?? 0} CR(s) atualizadas com a categoria do produto.`);
        } catch (err: any) {
            toast.error("Erro: " + (err.message || "desconhecido"));
        } finally {
            setSaving(false);
        }
    };

    const semCategoria = produtos.filter(p => !valorAtual(p)).length;

    return (
        <div className="border border-[#D0D5DD] rounded-lg overflow-hidden bg-white">
            <div className="bg-[#071D41] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-[16px] font-bold uppercase tracking-[0.5px] text-white">Categoria contábil dos produtos</h2>
                    <p className="text-[11px] text-white/80 mt-0.5">Vincule a conta de receita correta a cada produto. Sem isso, as vendas vão para a conta padrão (geralmente a primeira do plano).</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-white/90 px-2 py-1 bg-white/10 rounded">{semCategoria} sem categoria</span>
                    <button onClick={aplicarBackfillCR} disabled={saving}
                        className="text-[11px] font-bold text-white border border-white/40 hover:bg-white/20 rounded px-3 py-1.5 disabled:opacity-50">
                        Sincronizar CRs antigas
                    </button>
                    <button onClick={salvar} disabled={saving || totalPendentes === 0}
                        className="text-[11px] font-bold text-[#064E3B] bg-[#ECFDF4] hover:bg-white rounded px-3 py-1.5 disabled:opacity-50">
                        {saving ? "Salvando..." : `Salvar ${totalPendentes > 0 ? `(${totalPendentes})` : ""}`}
                    </button>
                </div>
            </div>

            <div className="p-3 border-b border-[#EAECF0] grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                <div className="flex flex-col gap-1">
                    <label className={LB}>Buscar</label>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Código ou descrição..."
                        className="border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className={LB}>Mostrar</label>
                    <SearchableSelect value={filtro} onChange={e => setFiltro(e.target.value as any)}
                        className="border border-[#ccc] rounded-md px-3 py-2 text-sm bg-white focus:border-[#059669] focus:outline-none">
                        <option value="sem_categoria">Apenas sem categoria</option>
                        <option value="todos">Todos os produtos</option>
                    </SearchableSelect>
                </div>
                <div className="flex flex-col gap-1 min-w-[280px]">
                    <label className={LB}>Aplicar em massa (filtrados)</label>
                    <ContaCombobox value={bulkContaId || null} contas={contas}
                        onChange={id => setBulkContaId(id || "")}
                        placeholder="— escolha categoria —" />
                </div>
                <button onClick={aplicarEmMassa} disabled={!bulkContaId || filtered.length === 0}
                    className="bg-[#059669] text-white text-sm font-bold px-4 py-2 rounded-md disabled:opacity-40 self-end">
                    Aplicar a {filtered.length}
                </button>
            </div>

            <div className="overflow-x-auto">
                {loadingProdutos ? (
                    <div className="p-3 space-y-2">
                        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#555]">
                        {filtro === "sem_categoria" ? "Todos os produtos visíveis já têm categoria contábil." : "Nenhum produto encontrado."}
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-[#F6F2EB]">
                            <tr>
                                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-[#555]">Código</th>
                                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-[#555]">Produto</th>
                                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase text-[#555]">Conta contábil de receita</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => {
                                const atual = valorAtual(p);
                                const mudou = pendentes[p.id] !== undefined && pendentes[p.id] !== p.conta_contabil_id;
                                return (
                                    <tr key={p.id} className={`border-t border-[#eee] ${mudou ? "bg-[#FEF9E8]" : ""}`}>
                                        <td className="px-3 py-2 text-[#555] tabular-nums whitespace-nowrap">{p.code || "—"}</td>
                                        <td className="px-3 py-2 text-[#1D2939]">{p.description}</td>
                                        <td className="px-3 py-2">
                                            <ContaCombobox value={atual} contas={contas}
                                                onChange={id => setPendentes(prev => ({ ...prev, [p.id]: id }))} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="text-[11px] text-[#555] px-3 py-2 border-t border-[#EAECF0] bg-[#FAFAF7]">
                <strong>Como usar:</strong> filtre "Apenas sem categoria", selecione a categoria mais comum no campo "Aplicar em massa" e clique em "Aplicar a N". Ajuste linha a linha as exceções. Clique em <strong>Salvar</strong> para gravar. Depois, <strong>Sincronizar CRs antigas</strong> propaga a categoria correta para todas as Contas a Receber já lançadas.
            </div>
        </div>
    );
}
