import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { BANKS } from "@/lib/banks";

interface BankAccount {
  id: string; company_id: string; name: string; banco: string;
  type: string; agencia: string | null; conta: string | null; digito: string | null;
  initial_balance: number | null; chave_pix: string | null;
  data_saldo_inicial: string | null; ofx_ativo: boolean; status: string;
}

const BANCOS_SORTED = [...BANKS]
  .map(b => ({ codigo: b.code.padStart(3, '0'), nome: b.name }))
  .sort((a, b) => a.nome.localeCompare(b.nome));

const tipoLabels: Record<string, string> = {
  checking: "Conta Corrente", savings: "Conta Poupança", cash: "Caixa Interno", investment: "Conta Investimento",
};

const emptyForm = {
  name: "", banco: "", type: "checking", agencia: "", conta: "", digito: "",
  initial_balance: "", chave_pix: "", data_saldo_inicial: "", ofx_ativo: false,
};

interface CreditCard {
  id: string; nome: string; bandeira: string; final: string;
  limite: number; utilizado: number; dia_fechamento: number; dia_vencimento: number;
  conta_vinculada: string;
}

const IC = "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:border-[#1a2e4a] focus:outline-none w-full";
const LB = "text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]";

export default function ContasBancarias() {
  const { activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Credit card local state
  const [cartoes, setCartoes] = useState<CreditCard[]>([]);
  const [showCartaoForm, setShowCartaoForm] = useState(false);
  const [cartaoForm, setCartaoForm] = useState({ nome: "", bandeira: "Visa", final: "", limite: "", dia_fechamento: "25", dia_vencimento: "5", conta_vinculada: "" });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank_accounts", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("bank_accounts").select("*").eq("company_id", selectedCompany.id).order("name");
      if (error) throw error;
      return data as BankAccount[];
    },
    enabled: !!selectedCompany?.id,
  });

  // Buscar saldo real calculado pela view (initial_balance + movimentações)
  const { data: saldos = [] } = useQuery({
    queryKey: ["v_saldo_contas_bancarias", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("v_saldo_contas_bancarias").select("conta_bancaria_id, saldo_atual").eq("company_id", selectedCompany.id);
      if (error) throw error;
      return data as { conta_bancaria_id: string; saldo_atual: number }[];
    },
    enabled: !!selectedCompany?.id,
  });

  const saldoMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of saldos) map[s.conta_bancaria_id] = s.saldo_atual;
    return map;
  }, [saldos]);

  const getSaldo = (acc: BankAccount) => saldoMap[acc.id] ?? acc.initial_balance ?? 0;

  const activeAccounts = accounts.filter(a => a.status === "ativa" || a.status === "active");
  const totalBalance = useMemo(() => activeAccounts.reduce((sum, a) => sum + getSaldo(a), 0), [activeAccounts, saldoMap]);

  const set = (k: string, v: any) => setFormData(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!selectedCompany?.id || !formData.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: selectedCompany.id, name: formData.name.trim(), banco: formData.banco,
        type: formData.type, agencia: formData.agencia || null, conta: formData.conta || null,
        digito: formData.digito || null,
        initial_balance: formData.initial_balance ? parseFloat(String(formData.initial_balance).replace(",", ".")) : 0,
        chave_pix: formData.chave_pix || null,
        data_saldo_inicial: formData.data_saldo_inicial || null,
        ofx_ativo: formData.ofx_ativo, status: "ativa",
      };
      if (editingId) {
        const { error } = await (activeClient as any).from("bank_accounts").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Conta atualizada");
      } else {
        const { error } = await (activeClient as any).from("bank_accounts").insert(payload);
        if (error) throw error;
        toast.success("Conta cadastrada");
      }
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
      setShowForm(false); setEditingId(null); setFormData(emptyForm);
    } catch (err: any) { toast.error("Erro: " + (err.message || "Erro desconhecido")); }
    finally { setSaving(false); }
  };

  const handleEdit = (acc: BankAccount) => {
    setEditingId(acc.id);
    setFormData({
      name: acc.name, banco: acc.banco || "", type: acc.type || "checking",
      agencia: acc.agencia || "", conta: acc.conta || "", digito: acc.digito || "",
      initial_balance: acc.initial_balance ? String(acc.initial_balance) : "",
      chave_pix: acc.chave_pix || "", data_saldo_inicial: acc.data_saldo_inicial || "",
      ofx_ativo: acc.ofx_ativo || false,
    });
    setShowForm(true);
  };

  const handleDelete = async (acc: BankAccount) => {
    if (!confirm(`Excluir conta "${acc.name}"?`)) return;
    try {
      const { error } = await (activeClient as any).from("bank_accounts").delete().eq("id", acc.id);
      if (error) throw error;
      toast.success("Excluída");
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  const addCartao = () => {
    setCartoes(prev => [...prev, {
      id: Date.now().toString(), nome: cartaoForm.nome, bandeira: cartaoForm.bandeira,
      final: cartaoForm.final, limite: parseFloat(cartaoForm.limite) || 0, utilizado: 0,
      dia_fechamento: parseInt(cartaoForm.dia_fechamento), dia_vencimento: parseInt(cartaoForm.dia_vencimento),
      conta_vinculada: cartaoForm.conta_vinculada,
    }]);
    setShowCartaoForm(false);
    setCartaoForm({ nome: "", bandeira: "Visa", final: "", limite: "", dia_fechamento: "25", dia_vencimento: "5", conta_vinculada: "" });
    toast.success("Cartão adicionado");
  };

  return (
    <AppLayout title="Contas Bancárias">
      <div className="space-y-6">
        {/* Consolidated Balance */}
        <div className="bg-[#f0f4f8] border border-[#1a2e4a] rounded-lg p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#1a2e4a]">Saldo Total Consolidado</p>
            <p className="text-xs text-[#555] mt-0.5">{activeAccounts.length} conta(s) ativa(s)</p>
          </div>
          <p className="text-2xl font-bold text-[#1a2e4a]">{formatBRL(totalBalance)}</p>
        </div>

        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-[#0a0a0a]">Contas Bancárias</h2>
          <button onClick={() => { setEditingId(null); setFormData(emptyForm); setShowForm(!showForm); }}
            className="bg-[#1a2e4a] text-white text-sm font-bold px-4 py-2 rounded-md">
            {showForm ? "Fechar" : "+ Nova Conta"}
          </button>
        </div>

        {/* New Account Form */}
        {showForm && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">{editingId ? "Editar Conta" : "Nova Conta Bancária"}</h3>
            </div>
            <div className="p-5 bg-white space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className={LB}>Tipo de Conta <span className="text-[#8b0000]">*</span></label>
                  <select value={formData.type} onChange={e => set("type", e.target.value)} className={IC}>
                    <option value="checking">Conta Corrente</option><option value="savings">Conta Poupança</option>
                    <option value="cash">Caixa Interno</option><option value="investment">Conta Investimento</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LB}>Banco</label>
                  <BancoCombobox value={formData.banco} onChange={v => set("banco", v)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LB}>Nome de Identificação <span className="text-[#8b0000]">*</span></label>
                  <input value={formData.name} onChange={e => set("name", e.target.value)} placeholder="Ex: BB Principal" className={IC} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1"><label className={LB}>Agência</label><input value={formData.agencia} onChange={e => set("agencia", e.target.value)} className={IC} /></div>
                <div className="flex flex-col gap-1"><label className={LB}>Número da Conta</label><input value={formData.conta} onChange={e => set("conta", e.target.value)} className={IC} /></div>
                <div className="flex flex-col gap-1"><label className={LB}>Chave PIX</label><input value={formData.chave_pix} onChange={e => set("chave_pix", e.target.value)} className={IC} placeholder="Opcional" /></div>
              </div>
              <div className="bg-[#fffbe6] border border-[#e6c200] border-l-4 border-l-[#b8960a] rounded-md px-4 py-2.5 text-sm font-semibold text-[#5c3a00]">
                O saldo inicial define o ponto de partida do fluxo de caixa. Informe o saldo real na data de início do uso do sistema.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1"><label className={LB}>Saldo Inicial (R$)</label><input value={formData.initial_balance} onChange={e => set("initial_balance", e.target.value)} placeholder="0,00" className={IC} /></div>
                <div className="flex flex-col gap-1"><label className={LB}>Data do Saldo Inicial</label><input type="date" value={formData.data_saldo_inicial} onChange={e => set("data_saldo_inicial", e.target.value)} className={IC} /></div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.ofx_ativo} onChange={e => set("ofx_ativo", e.target.checked)} className="w-4 h-4 accent-[#1a2e4a]" />
                  <span className="text-sm text-[#0a0a0a]">Importação OFX ativa</span>
                </label>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSave} disabled={saving} className="bg-[#1a2e4a] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                  {saving ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}
                </button>
                <button onClick={() => { setShowForm(false); setEditingId(null); }} className="bg-white text-[#0a0a0a] border border-[#ccc] text-sm font-bold px-4 py-2 rounded-md">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* Account Cards Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-sm text-[#555]">Carregando contas...</div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 text-sm text-[#555]">Nenhuma conta bancária cadastrada.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(acc => (
              <div key={acc.id} className="border border-[#ccc] rounded-lg overflow-hidden">
                <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest">{acc.banco || "Sem banco"}</h3>
                    <p className="text-[10px] text-[#a8bfd4]">{tipoLabels[acc.type] || acc.type}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(acc)} className="text-[#a8bfd4] hover:text-white text-xs px-1">✎</button>
                    <button onClick={() => handleDelete(acc)} className="text-[#ff9999] hover:text-white text-xs px-1">✕</button>
                  </div>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-sm font-semibold text-[#0a0a0a] mb-1">{acc.name}</p>
                  <p className="text-xl font-bold text-[#0a0a0a] mb-2">{formatBRL(getSaldo(acc))}</p>
                  {acc.agencia && <p className="text-xs text-[#555] mb-2">Ag: {acc.agencia} · Cc: {acc.conta}{acc.digito ? `-${acc.digito}` : ""}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {(acc.status === "ativa" || acc.status === "active") && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#0a5c2e] bg-[#e6f4ec] text-[#0a5c2e]">Ativa</span>
                    )}
                    {acc.ofx_ativo && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]">OFX</span>
                    )}
                    {acc.chave_pix && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#b8960a] bg-[#fffbe6] text-[#5c3a00]">PIX</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Credit Cards Section ─── */}
        <div className="border-t border-[#ccc] pt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-[#0a0a0a]">Cartões de Crédito</h2>
            <button onClick={() => setShowCartaoForm(!showCartaoForm)}
              className="bg-[#1a2e4a] text-white text-sm font-bold px-4 py-2 rounded-md">
              {showCartaoForm ? "Fechar" : "+ Novo Cartão"}
            </button>
          </div>

          {showCartaoForm && (
            <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
              <div className="bg-[#1a2e4a] px-4 py-2.5"><h3 className="text-xs font-bold text-white uppercase tracking-widest">Novo Cartão de Crédito</h3></div>
              <div className="p-5 bg-white space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1"><label className={LB}>Nome</label><input value={cartaoForm.nome} onChange={e => setCartaoForm(f => ({...f, nome: e.target.value}))} className={IC} placeholder="Ex: Nubank Empresarial" /></div>
                  <div className="flex flex-col gap-1"><label className={LB}>Bandeira</label>
                    <select value={cartaoForm.bandeira} onChange={e => setCartaoForm(f => ({...f, bandeira: e.target.value}))} className={IC}>
                      <option>Visa</option><option>Mastercard</option><option>Elo</option><option>Amex</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1"><label className={LB}>Final (4 dígitos)</label><input value={cartaoForm.final} onChange={e => setCartaoForm(f => ({...f, final: e.target.value.slice(0,4)}))} maxLength={4} className={IC} /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1"><label className={LB}>Limite Total (R$)</label><input value={cartaoForm.limite} onChange={e => setCartaoForm(f => ({...f, limite: e.target.value}))} className={IC} /></div>
                  <div className="flex flex-col gap-1"><label className={LB}>Dia Fechamento</label><input type="number" min={1} max={31} value={cartaoForm.dia_fechamento} onChange={e => setCartaoForm(f => ({...f, dia_fechamento: e.target.value}))} className={IC} /></div>
                  <div className="flex flex-col gap-1"><label className={LB}>Dia Vencimento</label><input type="number" min={1} max={31} value={cartaoForm.dia_vencimento} onChange={e => setCartaoForm(f => ({...f, dia_vencimento: e.target.value}))} className={IC} /></div>
                </div>
                <div className="flex flex-col gap-1"><label className={LB}>Conta Bancária Vinculada</label>
                  <select value={cartaoForm.conta_vinculada} onChange={e => setCartaoForm(f => ({...f, conta_vinculada: e.target.value}))} className={IC}>
                    <option value="">Independente</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <button onClick={addCartao} className="bg-[#1a2e4a] text-white text-sm font-bold px-6 py-2 rounded-md">Adicionar Cartão</button>
              </div>
            </div>
          )}

          {cartoes.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#555]">Nenhum cartão de crédito cadastrado.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cartoes.map(c => {
                const pct = c.limite > 0 ? (c.utilizado / c.limite) * 100 : 0;
                return (
                  <div key={c.id} className="rounded-lg overflow-hidden" style={{ background: c.conta_vinculada ? "#1a2e4a" : "#333" }}>
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-white text-sm font-bold">{c.nome}</p>
                          <p className="text-[#a8bfd4] text-xs">{c.bandeira} · **** {c.final}</p>
                        </div>
                        <span className="text-white text-xs font-bold">{c.bandeira}</span>
                      </div>
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-[#a8bfd4] mb-1">
                          <span>Utilizado: {formatBRL(c.utilizado)}</span>
                          <span>Limite: {formatBRL(c.limite)}</span>
                        </div>
                        <div className="w-full h-2 bg-white/20 rounded-full">
                          <div className={`h-2 rounded-full transition-all ${pct > 80 ? "bg-[#ff6b6b]" : "bg-white"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                      <div className="flex gap-4 text-[10px] text-[#a8bfd4]">
                        <span>Fecha dia {c.dia_fechamento}</span>
                        <span>Vence dia {c.dia_vencimento}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/* ── Banco Combobox with search ── */
function BancoCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return BANCOS_SORTED;
    const q = search.toLowerCase();
    return BANCOS_SORTED.filter(b => b.nome.toLowerCase().includes(q) || b.codigo.includes(q));
  }, [search]);

  return (
    <div ref={ref} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? search : value || ""}
        placeholder="Digite para buscar..."
        onFocus={() => { setOpen(true); setSearch(""); }}
        onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
        className="w-full border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:border-[#1a2e4a] focus:outline-none"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#ccc] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[#999]">Nenhum banco encontrado</div>
          ) : (
            filtered.map(b => {
              const val = `${b.codigo} - ${b.nome}`;
              return (
                <button
                  key={b.codigo}
                  type="button"
                  onClick={() => { onChange(val); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#f0f4f8] transition-colors ${value === val ? "bg-[#f0f4f8] font-semibold text-[#1a2e4a]" : "text-[#0a0a0a]"}`}
                >
                  {b.codigo} – {b.nome}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
