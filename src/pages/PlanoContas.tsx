import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Conta {
  id: string; code: string; name: string; level: number;
  account_type: string; account_nature: string;
  is_analytical: boolean; is_synthetic: boolean;
  show_in_dre: boolean; dre_group: string | null;
  dre_order: number | null; parent_id: string | null; status: string;
}

interface TreeNode extends Conta {
  filhos: TreeNode[];
}

const IC = "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:border-[#1a2e4a] focus:outline-none w-full";
const LB = "text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]";

const DRE_GROUPS = [
  { value: "receita_bruta", label: "Receita Bruta" },
  { value: "outras_receitas", label: "Outras Receitas" },
  { value: "deducoes", label: "Deduções" },
  { value: "custos", label: "Custos" },
  { value: "despesas_operacionais", label: "Despesas Operacionais" },
  { value: "outras_despesas", label: "Outras Despesas" },
];

function getBadge(c: Conta) {
  if (c.account_type === "revenue") return { label: "Receita", cls: "border-[#0a5c2e] bg-[#e6f4ec] text-[#0a5c2e]" };
  if (c.account_type === "expense" && c.dre_group === "deducoes") return { label: "Dedução", cls: "border-[#b8960a] bg-[#fffbe6] text-[#5c3a00]" };
  if (c.account_type === "expense" && c.dre_group === "custos") return { label: "Custo", cls: "border-[#8b0000] bg-[#fdecea] text-[#8b0000]" };
  if (c.account_type === "expense" && c.dre_group === "despesas_operacionais") return { label: "Despesa", cls: "border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]" };
  if (c.account_type === "expense") return { label: "Despesa", cls: "border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]" };
  return { label: "Outros", cls: "border-[#ccc] bg-[#f5f5f5] text-[#555]" };
}

export default function PlanoContas() {
  const { activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("todas");

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [newConta, setNewConta] = useState({ code: "", name: "", account_type: "expense", account_nature: "debit", parent_code: "", show_in_dre: true, dre_group: "despesas_operacionais", dre_order: "" });

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", account_type: "", account_nature: "", dre_group: "", dre_order: "", show_in_dre: true });
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: contas = [], isLoading } = useQuery({
    queryKey: ["chart_of_accounts", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("chart_of_accounts")
        .select("id, code, name, level, account_type, account_nature, is_analytical, is_synthetic, show_in_dre, dre_group, dre_order, parent_id, status")
        .eq("company_id", selectedCompany.id)
        .eq("status", "active")
        .order("code");
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        is_analytical: c.is_analytical ?? c.is_analytic ?? false,
        is_synthetic: c.is_synthetic ?? !c.is_analytical ?? !c.is_analytic ?? true,
      })) as Conta[];
    },
    enabled: !!selectedCompany?.id,
  });

  const filteredContas = useMemo(() => {
    let result = contas;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    }
    if (filterType === "receitas") result = result.filter(c => c.account_type === "revenue");
    else if (filterType === "custos") result = result.filter(c => c.dre_group === "custos");
    else if (filterType === "despesas") result = result.filter(c => c.dre_group === "despesas_operacionais" || c.dre_group === "outras_despesas");
    else if (filterType === "analiticas") result = result.filter(c => c.is_analytical);
    return result;
  }, [contas, search, filterType]);

  const tree = useMemo((): TreeNode[] => {
    const grupos = filteredContas.filter(c => c.level === 1);
    const subgrupos = filteredContas.filter(c => c.level === 2);
    const analiticas = filteredContas.filter(c => c.level === 3);
    return grupos.map(g => ({
      ...g,
      filhos: subgrupos
        .filter(s => s.code.startsWith(g.code + "."))
        .map(s => ({ ...s, filhos: analiticas.filter(a => a.code.startsWith(s.code + ".")) })),
    }));
  }, [filteredContas]);

  const stats = useMemo(() => ({
    total: contas.length,
    grupos: contas.filter(c => c.level === 1).length,
    subgrupos: contas.filter(c => c.level === 2).length,
    analiticas: contas.filter(c => c.is_analytical).length,
  }), [contas]);

  const toggle = (code: string) => {
    setExpandidos(prev => { const next = new Set(prev); next.has(code) ? next.delete(code) : next.add(code); return next; });
  };

  const expandAll = () => { const all = new Set<string>(); contas.forEach(c => { if (c.level <= 2) all.add(c.code); }); setExpandidos(all); };
  const collapseAll = () => setExpandidos(new Set());

  // ─── Edit handlers ───
  const startEdit = (conta: Conta, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conta.id);
    setEditForm({
      name: conta.name,
      account_type: conta.account_type,
      account_nature: conta.account_nature,
      dre_group: conta.dre_group || "",
      dre_order: conta.dre_order != null ? String(conta.dre_order) : "",
      show_in_dre: conta.show_in_dre,
    });
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async () => {
    if (!editingId || !editForm.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSavingEdit(true);
    try {
      const payload: any = {
        name: editForm.name.trim(),
        account_type: editForm.account_type,
        account_nature: editForm.account_nature,
        dre_group: editForm.dre_group || null,
        dre_order: editForm.dre_order ? parseInt(editForm.dre_order) : null,
        show_in_dre: editForm.show_in_dre,
      };
      const { error } = await (activeClient as any).from("chart_of_accounts").update(payload).eq("id", editingId);
      if (error) throw error;
      toast.success("Conta atualizada");
      queryClient.invalidateQueries({ queryKey: ["chart_of_accounts"] });
      setEditingId(null);
    } catch (err: any) { toast.error("Erro: " + (err.message || "Erro desconhecido")); }
    finally { setSavingEdit(false); }
  };

  const deleteConta = async (conta: Conta, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Excluir conta "${conta.code} — ${conta.name}"?`)) return;
    try {
      const { error } = await (activeClient as any).from("chart_of_accounts").update({ status: "inactive" }).eq("id", conta.id);
      if (error) throw error;
      toast.success("Conta desativada");
      queryClient.invalidateQueries({ queryKey: ["chart_of_accounts"] });
      if (editingId === conta.id) setEditingId(null);
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  // ─── Create handler ───
  const handleAddConta = async () => {
    if (!selectedCompany?.id || !newConta.code || !newConta.name) { toast.error("Código e nome são obrigatórios"); return; }
    try {
      const parent = contas.find(c => c.code === newConta.parent_code);
      const level = newConta.code.split(".").length;
      const payload = {
        company_id: selectedCompany.id, code: newConta.code, name: newConta.name,
        level, account_type: newConta.account_type, account_nature: newConta.account_nature,
        is_analytical: level === 3, is_synthetic: level < 3,
        show_in_dre: newConta.show_in_dre, dre_group: newConta.dre_group || null,
        dre_order: newConta.dre_order ? parseInt(newConta.dre_order) : null,
        parent_id: parent?.id || null, status: "active", accepts_manual_entry: level === 3,
      };
      const { error } = await (activeClient as any).from("chart_of_accounts").insert(payload);
      if (error) throw error;
      toast.success("Conta criada");
      queryClient.invalidateQueries({ queryKey: ["chart_of_accounts"] });
      setShowForm(false);
      setNewConta({ code: "", name: "", account_type: "expense", account_nature: "debit", parent_code: "", show_in_dre: true, dre_group: "despesas_operacionais", dre_order: "" });
    } catch (err: any) { toast.error("Erro: " + (err.message || "Erro desconhecido")); }
  };

  const setNew = (k: string, v: any) => setNewConta(f => ({ ...f, [k]: v }));
  const setEdit = (k: string, v: any) => setEditForm(f => ({ ...f, [k]: v }));

  // ─── Inline edit row ───
  const renderEditRow = (conta: Conta) => (
    <div key={conta.id + "-edit"} className="bg-[#fffbe6] border-b border-[#e6c200] px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-[#555]">{conta.code}</span>
        <span className="text-[10px] font-bold uppercase text-[#5c3a00]">Editando</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className={LB}>Nome <span className="text-[#8b0000]">*</span></label>
          <input value={editForm.name} onChange={e => setEdit("name", e.target.value)} className={IC} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LB}>Tipo</label>
          <select value={editForm.account_type} onChange={e => setEdit("account_type", e.target.value)} className={IC}>
            <option value="revenue">Receita</option><option value="expense">Despesa</option><option value="cost">Custo</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LB}>Natureza</label>
          <select value={editForm.account_nature} onChange={e => setEdit("account_nature", e.target.value)} className={IC}>
            <option value="debit">Devedora</option><option value="credit">Credora</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LB}>Grupo DRE</label>
          <select value={editForm.dre_group} onChange={e => setEdit("dre_group", e.target.value)} className={IC}>
            <option value="">Nenhum</option>
            {DRE_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={editForm.show_in_dre} onChange={e => setEdit("show_in_dre", e.target.checked)} className="w-4 h-4 accent-[#1a2e4a]" />
          <span className="text-xs text-[#0a0a0a]">Aparece no DRE</span>
        </label>
        <div className="flex flex-col gap-1">
          <label className={LB}>Ordem DRE</label>
          <input type="number" value={editForm.dre_order} onChange={e => setEdit("dre_order", e.target.value)} className={`${IC} w-20`} placeholder="0" />
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={saveEdit} disabled={savingEdit} className="bg-[#1a2e4a] text-white text-xs font-bold px-4 py-1.5 rounded-md disabled:opacity-40">
            {savingEdit ? "Salvando..." : "Salvar"}
          </button>
          <button onClick={cancelEdit} className="bg-white text-[#0a0a0a] border border-[#ccc] text-xs font-bold px-4 py-1.5 rounded-md">Cancelar</button>
        </div>
      </div>
    </div>
  );

  // ─── Row actions (edit + delete buttons) ───
  const renderActions = (conta: Conta) => (
    <div className="flex items-center gap-1 shrink-0 ml-2">
      <button onClick={e => startEdit(conta, e)} title="Editar"
        className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#f0f4f8] text-[#1a2e4a] text-sm transition-all">✎</button>
      <button onClick={e => deleteConta(conta, e)} title="Desativar"
        className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#fdecea] text-[#8b0000] text-sm transition-all">✕</button>
    </div>
  );

  return (
    <AppLayout title="Plano de Contas">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total de Contas", value: stats.total },
            { label: "Grupos", value: stats.grupos },
            { label: "Subgrupos", value: stats.subgrupos },
            { label: "Analíticas", value: stats.analiticas },
          ].map((s, i) => (
            <div key={i} className="border border-[#ccc] rounded-lg p-3 bg-white text-center">
              <p className="text-xl font-bold text-[#1a2e4a]">{s.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#555]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" placeholder="Buscar por nome ou código..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:border-[#1a2e4a] focus:outline-none flex-1 min-w-[200px]" />
          {["todas", "receitas", "custos", "despesas", "analiticas"].map(f => (
            <button key={f} onClick={() => setFilterType(f)}
              className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded border transition-all ${
                filterType === f ? "bg-[#1a2e4a] text-white border-[#1a2e4a]" : "bg-white text-[#555] border-[#ccc] hover:border-[#1a2e4a]"
              }`}>{f === "todas" ? "Todas" : f === "receitas" ? "Receitas" : f === "custos" ? "Custos" : f === "despesas" ? "Despesas" : "Analíticas"}</button>
          ))}
          <button onClick={expandAll} className="text-[10px] font-bold text-[#1a2e4a] px-2 py-1.5 hover:underline">Expandir</button>
          <button onClick={collapseAll} className="text-[10px] font-bold text-[#555] px-2 py-1.5 hover:underline">Recolher</button>
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
            className="bg-[#1a2e4a] text-white text-sm font-bold px-4 py-2 rounded-md">+ Nova Conta</button>
        </div>

        {/* New account form */}
        {showForm && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5"><h3 className="text-xs font-bold text-white uppercase tracking-widest">Nova Conta</h3></div>
            <div className="p-5 bg-white space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1"><label className={LB}>Código <span className="text-[#8b0000]">*</span></label><input value={newConta.code} onChange={e => setNew("code", e.target.value)} className={IC} placeholder="Ex: 4.1.09" /></div>
                <div className="flex flex-col gap-1"><label className={LB}>Nome <span className="text-[#8b0000]">*</span></label><input value={newConta.name} onChange={e => setNew("name", e.target.value)} className={IC} /></div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="flex flex-col gap-1"><label className={LB}>Tipo</label>
                  <select value={newConta.account_type} onChange={e => setNew("account_type", e.target.value)} className={IC}>
                    <option value="revenue">Receita</option><option value="expense">Despesa</option><option value="cost">Custo</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1"><label className={LB}>Natureza</label>
                  <select value={newConta.account_nature} onChange={e => setNew("account_nature", e.target.value)} className={IC}>
                    <option value="debit">Devedora</option><option value="credit">Credora</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1"><label className={LB}>Grupo DRE</label>
                  <select value={newConta.dre_group} onChange={e => setNew("dre_group", e.target.value)} className={IC}>
                    <option value="">Nenhum</option>
                    {DRE_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1"><label className={LB}>Conta Pai</label>
                  <select value={newConta.parent_code} onChange={e => setNew("parent_code", e.target.value)} className={IC}>
                    <option value="">Nenhuma</option>
                    {contas.filter(c => c.level <= 2).map(c => <option key={c.id} value={c.code}>{c.code} — {c.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newConta.show_in_dre} onChange={e => setNew("show_in_dre", e.target.checked)} className="w-4 h-4 accent-[#1a2e4a]" />
                <span className="text-sm text-[#0a0a0a]">Aparece no DRE</span>
              </label>
              <div className="flex gap-3">
                <button onClick={handleAddConta} className="bg-[#1a2e4a] text-white text-sm font-bold px-6 py-2 rounded-md">Salvar</button>
                <button onClick={() => setShowForm(false)} className="bg-white text-[#0a0a0a] border border-[#ccc] text-sm font-bold px-4 py-2 rounded-md">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* Tree */}
        {isLoading ? (
          <div className="text-center py-12 text-sm text-[#555]">Carregando plano de contas...</div>
        ) : filteredContas.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[#0a0a0a] font-bold mb-2">Nenhuma conta encontrada.</p>
            <p className="text-xs text-[#555]">Cadastre uma empresa e aplique o plano de contas template.</p>
          </div>
        ) : (
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            {tree.map(grupo => (
              <div key={grupo.id}>
                {/* Level 1 — Group */}
                <div onClick={() => toggle(grupo.code)}
                  className="bg-[#f0f4f8] px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[#e8edf5] border-b border-[#ddd]">
                  <span className="text-xs text-[#1a2e4a]">{expandidos.has(grupo.code) ? "▼" : "▶"}</span>
                  <span className="text-xs font-bold text-[#1a2e4a] w-8">{grupo.code}</span>
                  <span className="text-sm font-bold text-[#1a2e4a] flex-1">{grupo.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-[#ccc] text-[#555]">
                    {grupo.filhos.reduce((acc, s) => acc + s.filhos.length, 0) + grupo.filhos.length} contas
                  </span>
                  {(() => { const b = getBadge(grupo); return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${b.cls}`}>{b.label}</span>; })()}
                  {renderActions(grupo)}
                </div>
                {editingId === grupo.id && renderEditRow(grupo)}

                {expandidos.has(grupo.code) && grupo.filhos.map(sub => (
                  <div key={sub.id}>
                    {/* Level 2 — Subgroup */}
                    <div onClick={() => toggle(sub.code)}
                      className="bg-[#fafafa] pl-8 pr-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-[#f5f5f5] border-b border-[#eee]">
                      <span className="text-xs text-[#555]">{expandidos.has(sub.code) ? "▼" : "▶"}</span>
                      <span className="text-xs text-[#999] w-10">{sub.code}</span>
                      <span className="text-sm text-[#0a0a0a] flex-1">{sub.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-[#ccc] text-[#555]">
                        {sub.filhos.length}
                      </span>
                      {renderActions(sub)}
                    </div>
                    {editingId === sub.id && renderEditRow(sub)}

                    {expandidos.has(sub.code) && sub.filhos.map(analitica => {
                      const badge = getBadge(analitica);
                      return (
                        <div key={analitica.id}>
                          <div className="bg-white pl-16 pr-4 py-2 flex items-center gap-3 border-b border-[#f0f0f0] hover:bg-[#fafafa]">
                            <span className="text-xs text-[#999] w-14 font-mono">{analitica.code}</span>
                            <span className="text-sm text-[#0a0a0a] flex-1">{analitica.name}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                            {renderActions(analitica)}
                          </div>
                          {editingId === analitica.id && renderEditRow(analitica)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
