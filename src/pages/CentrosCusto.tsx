import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface CentroCusto {
  id: string; company_id: string; codigo: string; descricao: string;
  pai_id: string | null; ativo: boolean; created_at: string;
  meta_mensal?: number | null; is_padrao?: boolean;
}

const IC = "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#1E3A8A] focus:outline-none w-full";
const LB = "text-[10px] font-bold uppercase tracking-wider text-[#1D2939]";

export default function CentrosCusto() {
  const { activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ codigo: "", descricao: "", pai_id: "", meta_mensal: "" });
  const [saving, setSaving] = useState(false);

  const { data: centros = [], isLoading } = useQuery({
    queryKey: ["centros_custo", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("centros_custo").select("*").eq("company_id", selectedCompany.id).order("codigo");
      if (error) throw error;
      return data as CentroCusto[];
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: empCounts = {} } = useQuery({
    queryKey: ["emp_counts_by_centro", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return {};
      const { data, error } = await (activeClient as any)
        .from("employees").select("centro_custo_id, status").eq("company_id", selectedCompany.id);
      console.log("empCounts raw:", JSON.stringify(data), "error:", error);
      const counts: Record<string, number> = {};
      (data || []).forEach((e: any) => { if (e.centro_custo_id) counts[e.centro_custo_id] = (counts[e.centro_custo_id] || 0) + 1; });
      return counts;
    },
    enabled: !!selectedCompany?.id,
  });

  const selected = centros.find(c => c.id === selectedId);
  const set = (k: string, v: string) => setFormData(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!selectedCompany?.id || !formData.descricao.trim()) { toast.error("Descrição é obrigatória"); return; }
    setSaving(true);
    try {
      const payload: any = {
        company_id: selectedCompany.id, codigo: formData.codigo || null,
        descricao: formData.descricao.trim(), pai_id: formData.pai_id || null, ativo: true,
      };
      if (formData.meta_mensal) payload.meta_mensal = parseFloat(formData.meta_mensal.replace(",", "."));

      if (editingId) {
        const { error } = await (activeClient as any).from("centros_custo").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Setor atualizado");
      } else {
        const { error } = await (activeClient as any).from("centros_custo").insert(payload);
        if (error) throw error;
        toast.success("Setor criado");
      }
      queryClient.invalidateQueries({ queryKey: ["centros_custo"] });
      setShowForm(false); setEditingId(null);
      setFormData({ codigo: "", descricao: "", pai_id: "", meta_mensal: "" });
    } catch (err: any) { toast.error("Erro: " + (err.message || "Erro desconhecido")); }
    finally { setSaving(false); }
  };

  const handleEdit = (c: CentroCusto) => {
    setEditingId(c.id);
    setFormData({
      codigo: c.codigo || "", descricao: c.descricao || "",
      pai_id: c.pai_id || "", meta_mensal: c.meta_mensal ? String(c.meta_mensal) : "",
    });
    setShowForm(true);
  };

  const handleDelete = async (c: CentroCusto) => {
    if (c.is_padrao) { toast.error("Não é possível excluir setores padrão"); return; }
    const ok = await confirm({
      title: `Excluir setor "${c.descricao}"?`,
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Sim, excluir",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const { error } = await (activeClient as any).from("centros_custo").delete().eq("id", c.id);
      if (error) throw error;
      toast.success("Excluído");
      queryClient.invalidateQueries({ queryKey: ["centros_custo"] });
      if (selectedId === c.id) setSelectedId(null);
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  const getMetaPercent = (c: CentroCusto) => {
    const meta = c.meta_mensal || 0;
    if (meta <= 0) return 0;
    return 0; // placeholder — real value would come from expenses query
  };

  return (
    <AppLayout title="Centros de Custo">
      <div className="space-y-6">

        {/* Alert */}
        <div className="bg-[#FFFAEB] border border-[#e6c200] border-l-4 border-l-[#F79009] rounded-md px-4 py-2.5 text-sm font-semibold text-[#F79009]">
          Os setores abaixo foram criados pela Tática como padrão para esta empresa. O cliente pode renomear ou adicionar novos setores, mas não pode excluir os padrões.
        </div>

        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-[#1D2939]">Setores / Centros de Custo</h2>
          <button onClick={() => { setEditingId(null); setFormData({ codigo: "", descricao: "", pai_id: "", meta_mensal: "" }); setShowForm(!showForm); }}
            className="bg-[#1E3A8A] text-white text-sm font-bold px-4 py-2 rounded-md">
            {showForm ? "Fechar" : "+ Adicionar Setor"}
          </button>
        </div>

        {/* New Sector Form */}
        {showForm && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1E3A8A] px-4 py-2.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">{editingId ? "Editar Setor" : "Novo Setor"}</h3>
            </div>
            <div className="p-5 bg-white space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="flex flex-col gap-1"><label className={LB}>Código</label><input value={formData.codigo} onChange={e => set("codigo", e.target.value)} className={IC} placeholder="Ex: ADM" /></div>
                <div className="flex flex-col gap-1 col-span-2"><label className={LB}>Descrição <span className="text-[#D92D20]">*</span></label><input value={formData.descricao} onChange={e => set("descricao", e.target.value)} className={IC} /></div>
                <div className="flex flex-col gap-1"><label className={LB}>Meta Mensal (R$)</label><input value={formData.meta_mensal} onChange={e => set("meta_mensal", e.target.value)} className={IC} placeholder="0,00" /></div>
              </div>
              <div className="flex flex-col gap-1 max-w-xs">
                <label className={LB}>Setor Pai</label>
                <select value={formData.pai_id} onChange={e => set("pai_id", e.target.value)} className={IC}>
                  <option value="">Nenhum (raiz)</option>
                  {centros.filter(c => c.id !== editingId).map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.descricao}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSave} disabled={saving} className="bg-[#1E3A8A] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                  {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Setor"}
                </button>
                <button onClick={() => { setShowForm(false); setEditingId(null); }} className="bg-white text-[#1D2939] border border-[#ccc] text-sm font-bold px-4 py-2 rounded-md">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-sm text-[#555]">Carregando setores...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {centros.map(c => {
              const isPadrao = c.is_padrao ?? false;
              const empCount = empCounts[c.id] || 0;
              const meta = c.meta_mensal || 0;
              const pct = getMetaPercent(c);
              const barColor = pct > 100 ? "bg-[#D92D20]" : pct > 80 ? "bg-[#F79009]" : "bg-[#039855]";

              return (
                <div key={c.id}
                  onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                  className={`border rounded-lg overflow-hidden cursor-pointer transition-all ${
                    selectedId === c.id ? "border-[#1E3A8A] shadow-md" : "border-[#ccc] hover:shadow-sm"
                  }`}>
                  <div className={`px-4 py-2.5 flex items-center justify-between ${isPadrao ? "bg-[#1E3A8A]" : "bg-[#555]"}`}>
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-widest">{c.descricao}</h3>
                      {c.codigo && <p className="text-[10px] text-[#BFDBFE]">{c.codigo}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={e => { e.stopPropagation(); handleEdit(c); }} className="text-[#BFDBFE] hover:text-white text-xs px-1">✎</button>
                      {!isPadrao && <button onClick={e => { e.stopPropagation(); handleDelete(c); }} className="text-[#ff9999] hover:text-white text-xs px-1">✕</button>}
                    </div>
                  </div>
                  <div className="p-4 bg-white">
                    <div className="flex justify-between text-xs text-[#555] mb-2">
                      <span>{empCount} funcionário(s)</span>
                      {meta > 0 && <span>Meta: {formatBRL(meta)}</span>}
                    </div>
                    {meta > 0 && (
                      <div className="w-full h-2 bg-[#eee] rounded-full mb-2">
                        <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {isPadrao
                        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#1E3A8A] bg-[#EFF6FF] text-[#1E3A8A]">Padrão Tática</span>
                        : <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#ccc] bg-[#F6F2EB] text-[#555]">Personalizado</span>}
                      {!c.ativo && <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#D92D20] bg-[#FEF3F2] text-[#D92D20]">Inativo</span>}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add card */}
            <div onClick={() => { setEditingId(null); setFormData({ codigo: "", descricao: "", pai_id: "", meta_mensal: "" }); setShowForm(true); }}
              className="border-2 border-dashed border-[#ccc] rounded-lg flex items-center justify-center py-12 cursor-pointer hover:border-[#1E3A8A] transition-all">
              <div className="text-center">
                <p className="text-2xl text-[#ccc] mb-1">+</p>
                <p className="text-sm text-[#555]">Adicionar setor</p>
              </div>
            </div>
          </div>
        )}

        {/* Detail Panel */}
        {selected && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1E3A8A] px-4 py-2.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">
                Detalhe — {selected.descricao}
              </h3>
            </div>
            <div className="p-5 bg-white">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-3">Funcionários do Setor</h4>
                  {(empCounts[selected.id] || 0) === 0 ? (
                    <p className="text-sm text-[#555]">Nenhum funcionário vinculado a este setor.</p>
                  ) : (
                    <p className="text-sm text-[#1D2939]">{empCounts[selected.id]} funcionário(s) ativo(s)</p>
                  )}
                </div>
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-3">Despesas do Mês</h4>
                  <p className="text-sm text-[#555]">Dados de despesas serão exibidos quando os lançamentos estiverem vinculados a centros de custo.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
