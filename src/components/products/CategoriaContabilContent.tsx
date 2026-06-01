import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

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
                    <select value={filtro} onChange={e => setFiltro(e.target.value as any)}
                        className="border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none">
                        <option value="sem_categoria">Apenas sem categoria</option>
                        <option value="todos">Todos os produtos</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1 min-w-[280px]">
                    <label className={LB}>Aplicar em massa (filtrados)</label>
                    <select value={bulkContaId} onChange={e => setBulkContaId(e.target.value)}
                        className="border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none">
                        <option value="">— escolha categoria —</option>
                        {contas.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                    </select>
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
                                            <select value={atual || ""}
                                                onChange={e => setPendentes(prev => ({ ...prev, [p.id]: e.target.value || null }))}
                                                className="w-full border border-[#ccc] rounded-md px-2 py-1.5 text-sm focus:border-[#059669] focus:outline-none">
                                                <option value="">— sem categoria —</option>
                                                {contas.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                                            </select>
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
