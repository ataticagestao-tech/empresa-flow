import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";

interface Prod {
    id: string;
    description: string;
    activity: string | null;
    family: string | null;
    comissiona: boolean;
    comissao_tipo: string | null;
    comissao_valor: number | null;
}

const parseValorInput = (tipo: string, v: string) =>
    tipo === "valor"
        ? Number(v.replace(/[^\d,]/g, "").replace(",", ".")) || 0
        : parseFloat(v.replace(",", ".")) || 0;

const fmtComissao = (p: Prod) =>
    !p.comissiona
        ? "—"
        : p.comissao_tipo === "valor"
            ? `R$ ${Number(p.comissao_valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
            : `${Number(p.comissao_valor || 0)}%`;

export default function ComissaoConfigEmMassa() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const companyId = selectedCompany?.id;

    const [busca, setBusca] = useState("");
    const [soServicos, setSoServicos] = useState(false);
    const [soSemComissao, setSoSemComissao] = useState(false);
    const [sel, setSel] = useState<Set<string>>(new Set());
    const [tipo, setTipo] = useState<"percentual" | "valor">("percentual");
    const [valor, setValor] = useState("");
    const [saving, setSaving] = useState(false);

    const { data: produtos = [], isLoading } = useQuery({
        queryKey: ["comissao_config_produtos", companyId],
        enabled: !!companyId,
        queryFn: async (): Promise<Prod[]> => {
            const { data, error } = await (activeClient as any)
                .from("products")
                .select("id, description, activity, family, comissiona, comissao_tipo, comissao_valor")
                .eq("company_id", companyId)
                .eq("is_active", true)
                .order("description");
            if (error) return [];
            return data || [];
        },
    });

    const filtrados = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return produtos.filter((p) => {
            if (q && !p.description.toLowerCase().includes(q)) return false;
            if (soServicos && p.activity !== "servico") return false;
            if (soSemComissao && p.comissiona) return false;
            return true;
        });
    }, [produtos, busca, soServicos, soSemComissao]);

    const idsFiltrados = useMemo(() => filtrados.map((p) => p.id), [filtrados]);
    const selNoFiltro = useMemo(() => idsFiltrados.filter((id) => sel.has(id)).length, [idsFiltrados, sel]);
    const todosFiltradosMarcados = idsFiltrados.length > 0 && selNoFiltro === idsFiltrados.length;
    const comissionamFiltrados = useMemo(() => filtrados.filter((p) => p.comissiona).length, [filtrados]);

    const toggle = (id: string) =>
        setSel((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });

    const toggleTodosFiltrados = () =>
        setSel((prev) => {
            const n = new Set(prev);
            if (todosFiltradosMarcados) idsFiltrados.forEach((id) => n.delete(id));
            else idsFiltrados.forEach((id) => n.add(id));
            return n;
        });

    const bulkUpdate = async (ids: string[], patch: Record<string, any>) => {
        // chunk pra não estourar limite de URL do PostgREST
        for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            const { error } = await (activeClient as any).from("products").update(patch).in("id", chunk);
            if (error) throw error;
        }
    };

    const aplicar = async () => {
        if (sel.size === 0) return toast.error("Selecione ao menos um procedimento.");
        const v = parseValorInput(tipo, valor);
        if (v <= 0) return toast.error("Informe um % (ou valor) de comissão maior que zero.");
        setSaving(true);
        try {
            await bulkUpdate([...sel], { comissiona: true, comissao_tipo: tipo, comissao_valor: v });
            await queryClient.invalidateQueries({ queryKey: ["comissao_config_produtos", companyId] });
            queryClient.invalidateQueries({ queryKey: ["produtos_comissionaveis", companyId] });
            queryClient.invalidateQueries({ queryKey: ["products"] });
            toast.success(`Comissão aplicada a ${sel.size} procedimento(s).`);
            setSel(new Set());
            setValor("");
        } catch (e: any) {
            toast.error("Erro ao aplicar: " + (e.message || ""));
        } finally {
            setSaving(false);
        }
    };

    const remover = async () => {
        if (sel.size === 0) return toast.error("Selecione ao menos um procedimento.");
        setSaving(true);
        try {
            await bulkUpdate([...sel], { comissiona: false });
            await queryClient.invalidateQueries({ queryKey: ["comissao_config_produtos", companyId] });
            queryClient.invalidateQueries({ queryKey: ["produtos_comissionaveis", companyId] });
            toast.success(`Comissão removida de ${sel.size} procedimento(s).`);
            setSel(new Set());
        } catch (e: any) {
            toast.error("Erro: " + (e.message || ""));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-[13px] text-[#555]">
                Marque os procedimentos (use a busca pra agrupar, ex.: "termolaser"), informe o % e clique em
                <b> Aplicar</b>. Pode repetir com percentuais diferentes pra cada grupo.
            </p>

            {/* Toolbar */}
            <div className="flex flex-wrap items-end gap-3 bg-[#F6F2EB] border border-[#e6e2da] rounded-lg p-3">
                <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <label className="text-[10px] font-bold uppercase text-[#555]">Buscar procedimento</label>
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: botox, limpeza, termolaser…"
                        className="border border-[#ccc] rounded px-2 py-1.5 text-sm" />
                </div>
                <label className="flex items-center gap-1.5 text-[12px] text-[#555] pb-2">
                    <input type="checkbox" checked={soServicos} onChange={(e) => setSoServicos(e.target.checked)} className="accent-[#059669]" /> só serviços
                </label>
                <label className="flex items-center gap-1.5 text-[12px] text-[#555] pb-2">
                    <input type="checkbox" checked={soSemComissao} onChange={(e) => setSoSemComissao(e.target.checked)} className="accent-[#059669]" /> só sem comissão
                </label>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-[#555]">Tipo</label>
                    <select value={tipo} onChange={(e) => { setTipo(e.target.value as any); setValor(""); }}
                        className="border border-[#ccc] rounded px-2 py-1.5 text-sm">
                        <option value="percentual">%</option>
                        <option value="valor">R$/un</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-[#555]">{tipo === "valor" ? "Valor" : "Percentual"}</label>
                    <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === "valor" ? "0,00" : "Ex.: 10"}
                        className="border border-[#ccc] rounded px-2 py-1.5 text-sm w-[110px]" />
                </div>
                <button onClick={aplicar} disabled={saving || sel.size === 0}
                    className="text-[12px] font-bold text-white bg-[#059669] rounded px-3 py-2 disabled:opacity-40">
                    {saving ? "Salvando…" : `Aplicar (${sel.size})`}
                </button>
                <button onClick={remover} disabled={saving || sel.size === 0}
                    className="text-[12px] font-bold text-[#991B1B] border border-[#991B1B] rounded px-3 py-2 disabled:opacity-30">
                    Tirar comissão
                </button>
            </div>

            {/* Tabela */}
            <div className="border border-[#ccc] rounded-lg overflow-hidden">
                <div className="bg-[#064E3B] px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                        {filtrados.length} procedimento(s) · {comissionamFiltrados} com comissão
                    </span>
                    <span className="text-[10px] font-bold text-white/90">{sel.size} selecionado(s)</span>
                </div>
                {isLoading ? (
                    <div className="p-8 text-center text-[#555] text-sm">Carregando…</div>
                ) : (
                    <table className="w-full text-[13px]">
                        <thead className="bg-[#F6F2EB]">
                            <tr>
                                <th className="w-10 px-3 py-2 text-center">
                                    <input type="checkbox" checked={todosFiltradosMarcados} onChange={toggleTodosFiltrados} className="accent-[#059669]" />
                                </th>
                                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Procedimento</th>
                                <th className="text-center px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Tipo</th>
                                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Comissão</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eee]">
                            {filtrados.map((p) => (
                                <tr key={p.id} className={sel.has(p.id) ? "bg-[#ECFDF4]" : "hover:bg-[#FAFAF7]"}>
                                    <td className="px-3 py-1.5 text-center">
                                        <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="accent-[#059669]" />
                                    </td>
                                    <td className="px-3 py-1.5 text-[#1D2939]">{p.description}</td>
                                    <td className="px-3 py-1.5 text-center text-[11px] text-[#777]">{p.activity === "servico" ? "Serviço" : "Produto"}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {p.comissiona
                                            ? <span className="font-bold text-[#064E3B]">{fmtComissao(p)}</span>
                                            : <span className="text-[#bbb]">—</span>}
                                    </td>
                                </tr>
                            ))}
                            {filtrados.length === 0 && (
                                <tr><td colSpan={4} className="p-6 text-center text-[#555] text-xs">Nenhum procedimento com esse filtro.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
