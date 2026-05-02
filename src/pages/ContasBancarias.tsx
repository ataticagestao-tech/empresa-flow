import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { BANKS } from "@/lib/banks";
import { useConfirm } from "@/components/ui/confirm-dialog";

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

interface TaxaConfig {
  id?: string;
  bank_account_id: string;
  meio_pagamento: string;
  taxa_percentual: number;
  max_parcelas: number;
  dias_recebimento: number;
  antecipacao_ativa: boolean;
  taxa_antecipacao: number;
  ativo: boolean;
}

const MEIOS_PAGAMENTO = [
  { value: 'cartao_credito', label: 'Cartao Credito' },
  { value: 'cartao_debito', label: 'Cartao Debito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'pix', label: 'PIX' },
] as const;

const MEIO_LABEL: Record<string, string> = {
  cartao_credito: 'Cartao Credito',
  cartao_debito: 'Cartao Debito',
  boleto: 'Boleto',
  pix: 'PIX',
};

const IC = "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none w-full";
const LB = "text-[10px] font-bold uppercase tracking-wider text-[#1D2939]";

export default function ContasBancarias() {
  const { activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Credit card local state
  const [cartoes, setCartoes] = useState<CreditCard[]>([]);
  const [showCartaoForm, setShowCartaoForm] = useState(false);
  const [cartaoForm, setCartaoForm] = useState({ nome: "", bandeira: "Visa", final: "", limite: "", dia_fechamento: "25", dia_vencimento: "5", conta_vinculada: "" });

  // Taxa config state
  const [showTaxaSection, setShowTaxaSection] = useState(false);
  const [taxaContaSelecionada, setTaxaContaSelecionada] = useState<string>("");
  const [taxas, setTaxas] = useState<TaxaConfig[]>([]);
  const [loadingTaxas, setLoadingTaxas] = useState(false);
  const [savingTaxa, setSavingTaxa] = useState(false);
  const [taxaForm, setTaxaForm] = useState<TaxaConfig>({
    bank_account_id: "", meio_pagamento: "cartao_credito",
    taxa_percentual: 0, max_parcelas: 12, dias_recebimento: 30,
    antecipacao_ativa: false, taxa_antecipacao: 0, ativo: true,
  });
  const [editingTaxaId, setEditingTaxaId] = useState<string | null>(null);
  const [showTaxaForm, setShowTaxaForm] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank_accounts", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("bank_accounts")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .or("is_active.eq.true,is_active.is.null")
        .order("name");
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
    const ok = await confirm({
      title: `Excluir conta "${acc.name}"?`,
      description: "Se houver movimentações vinculadas, a conta será marcada como inativa (soft delete).",
      confirmLabel: "Sim, excluir",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      // 1. Tentar DELETE físico (só funciona se não houver FKs)
      const { error: delError } = await (activeClient as any)
        .from("bank_accounts")
        .delete()
        .eq("id", acc.id);

      if (!delError) {
        toast.success("Conta excluída");
        queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
        return;
      }

      // 2. Se falhou por FK violation (23503), fazer soft delete
      const isFkError = delError.code === "23503" || /foreign key|violates foreign/i.test(delError.message || "");
      if (isFkError) {
        const { error: updError } = await (activeClient as any)
          .from("bank_accounts")
          .update({ is_active: false, status: "encerrada" })
          .eq("id", acc.id);
        if (updError) throw updError;
        toast.success("Conta marcada como inativa (tem histórico vinculado)");
        queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
        return;
      }

      throw delError;
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  // ─── Taxa functions ─────────────────────────────────────────
  const fetchTaxas = useCallback(async (bankAccountId: string) => {
    if (!selectedCompany?.id || !bankAccountId) return;
    setLoadingTaxas(true);
    try {
      const { data, error } = await (activeClient as any)
        .from("configuracao_taxas_pagamento")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .eq("bank_account_id", bankAccountId)
        .order("meio_pagamento");
      if (error) throw error;
      setTaxas(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar taxas: " + err.message);
    } finally {
      setLoadingTaxas(false);
    }
  }, [selectedCompany?.id, activeClient]);

  const handleSelectContaTaxa = (accountId: string) => {
    setTaxaContaSelecionada(accountId);
    if (accountId) fetchTaxas(accountId);
    else setTaxas([]);
    setShowTaxaForm(false);
    setEditingTaxaId(null);
  };

  const resetTaxaForm = (bankAccountId: string) => {
    setTaxaForm({
      bank_account_id: bankAccountId, meio_pagamento: "cartao_credito",
      taxa_percentual: 0, max_parcelas: 12, dias_recebimento: 30,
      antecipacao_ativa: false, taxa_antecipacao: 0, ativo: true,
    });
    setEditingTaxaId(null);
  };

  const handleEditTaxa = (taxa: any) => {
    setTaxaForm({
      bank_account_id: taxa.bank_account_id,
      meio_pagamento: taxa.meio_pagamento,
      taxa_percentual: taxa.taxa_percentual,
      max_parcelas: taxa.max_parcelas,
      dias_recebimento: taxa.dias_recebimento,
      antecipacao_ativa: taxa.antecipacao_ativa,
      taxa_antecipacao: taxa.taxa_antecipacao,
      ativo: taxa.ativo,
    });
    setEditingTaxaId(taxa.id);
    setShowTaxaForm(true);
  };

  const handleSaveTaxa = async () => {
    if (!selectedCompany?.id || !taxaContaSelecionada) return;
    setSavingTaxa(true);
    try {
      const payload = {
        company_id: selectedCompany.id,
        bank_account_id: taxaContaSelecionada,
        meio_pagamento: taxaForm.meio_pagamento,
        taxa_percentual: taxaForm.taxa_percentual,
        max_parcelas: taxaForm.max_parcelas,
        dias_recebimento: taxaForm.dias_recebimento,
        antecipacao_ativa: taxaForm.antecipacao_ativa,
        taxa_antecipacao: taxaForm.antecipacao_ativa ? taxaForm.taxa_antecipacao : 0,
        ativo: taxaForm.ativo,
      };
      if (editingTaxaId) {
        const { error } = await (activeClient as any)
          .from("configuracao_taxas_pagamento").update(payload).eq("id", editingTaxaId);
        if (error) throw error;
        toast.success("Taxa atualizada");
      } else {
        const { error } = await (activeClient as any)
          .from("configuracao_taxas_pagamento").insert(payload);
        if (error) throw error;
        toast.success("Taxa cadastrada");
      }
      await fetchTaxas(taxaContaSelecionada);
      setShowTaxaForm(false);
      setEditingTaxaId(null);
      resetTaxaForm(taxaContaSelecionada);
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Erro desconhecido"));
    } finally {
      setSavingTaxa(false);
    }
  };

  const handleDeleteTaxa = async (taxaId: string) => {
    const ok = await confirm({
      title: "Excluir esta configuração de taxa?",
      confirmLabel: "Sim, excluir",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const { error } = await (activeClient as any)
        .from("configuracao_taxas_pagamento").delete().eq("id", taxaId);
      if (error) throw error;
      toast.success("Taxa removida");
      if (taxaContaSelecionada) fetchTaxas(taxaContaSelecionada);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const setTx = (k: string, v: any) => setTaxaForm(f => ({ ...f, [k]: v }));

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
        <div className="bg-[#ECFDF4] border border-[#059669] rounded-lg p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#059669]">Saldo Total Consolidado</p>
            <p className="text-xs text-[#555] mt-0.5">{activeAccounts.length} conta(s) ativa(s)</p>
          </div>
          <p className="text-2xl font-bold text-[#059669]">{formatBRL(totalBalance)}</p>
        </div>

        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-[#1D2939]">Contas Bancárias</h2>
          <button onClick={() => { setEditingId(null); setFormData(emptyForm); setShowForm(!showForm); }}
            className="bg-[#059669] text-white text-sm font-bold px-4 py-2 rounded-md">
            {showForm ? "Fechar" : "+ Nova Conta"}
          </button>
        </div>

        {/* New Account Form */}
        {showForm && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#059669] px-4 py-2.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">{editingId ? "Editar Conta" : "Nova Conta Bancária"}</h3>
            </div>
            <div className="p-5 bg-white space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className={LB}>Tipo de Conta <span className="text-[#E53E3E]">*</span></label>
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
                  <label className={LB}>Nome de Identificação <span className="text-[#E53E3E]">*</span></label>
                  <input value={formData.name} onChange={e => set("name", e.target.value)} placeholder="Ex: BB Principal" className={IC} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1"><label className={LB}>Agência</label><input value={formData.agencia} onChange={e => set("agencia", e.target.value)} className={IC} /></div>
                <div className="flex flex-col gap-1"><label className={LB}>Número da Conta</label><input value={formData.conta} onChange={e => set("conta", e.target.value)} className={IC} /></div>
                <div className="flex flex-col gap-1"><label className={LB}>Chave PIX</label><input value={formData.chave_pix} onChange={e => set("chave_pix", e.target.value)} className={IC} placeholder="Opcional" /></div>
              </div>
              <div className="bg-[#FFF0EB] border border-[#e6c200] border-l-4 border-l-[#EA580C] rounded-md px-4 py-2.5 text-sm font-semibold text-[#EA580C]">
                O saldo inicial define o ponto de partida do fluxo de caixa. Informe o saldo real na data de início do uso do sistema.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1"><label className={LB}>Saldo Inicial (R$)</label><input value={formData.initial_balance} onChange={e => set("initial_balance", e.target.value)} placeholder="0,00" className={IC} /></div>
                <div className="flex flex-col gap-1"><label className={LB}>Data do Saldo Inicial</label><input type="date" value={formData.data_saldo_inicial} onChange={e => set("data_saldo_inicial", e.target.value)} className={IC} /></div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.ofx_ativo} onChange={e => set("ofx_ativo", e.target.checked)} className="w-4 h-4 accent-[#059669]" />
                  <span className="text-sm text-[#1D2939]">Importação OFX ativa</span>
                </label>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSave} disabled={saving} className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                  {saving ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}
                </button>
                <button onClick={() => { setShowForm(false); setEditingId(null); }} className="bg-white text-[#1D2939] border border-[#ccc] text-sm font-bold px-4 py-2 rounded-md">Cancelar</button>
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
                <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest">{acc.banco || "Sem banco"}</h3>
                    <p className="text-[10px] text-[#BFDBFE]">{tipoLabels[acc.type] || acc.type}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(acc)} className="text-[#BFDBFE] hover:text-white text-xs px-1">✎</button>
                    <button onClick={() => handleDelete(acc)} className="text-[#ff9999] hover:text-white text-xs px-1">✕</button>
                  </div>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-sm font-semibold text-[#1D2939] mb-1">{acc.name}</p>
                  <p className="text-xl font-bold text-[#1D2939] mb-2">{formatBRL(getSaldo(acc))}</p>
                  {acc.agencia && <p className="text-xs text-[#555] mb-2">Ag: {acc.agencia} · Cc: {acc.conta}{acc.digito ? `-${acc.digito}` : ""}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {(acc.status === "ativa" || acc.status === "active") && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#039855] bg-[#ECFDF3] text-[#039855]">Ativa</span>
                    )}
                    {acc.ofx_ativo && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#059669] bg-[#ECFDF4] text-[#059669]">OFX</span>
                    )}
                    {acc.chave_pix && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#EA580C] bg-[#FFF0EB] text-[#EA580C]">PIX</span>
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
            <h2 className="text-lg font-bold text-[#1D2939]">Cartões de Crédito</h2>
            <button onClick={() => setShowCartaoForm(!showCartaoForm)}
              className="bg-[#059669] text-white text-sm font-bold px-4 py-2 rounded-md">
              {showCartaoForm ? "Fechar" : "+ Novo Cartão"}
            </button>
          </div>

          {showCartaoForm && (
            <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
              <div className="bg-[#059669] px-4 py-2.5"><h3 className="text-xs font-bold text-white uppercase tracking-widest">Novo Cartão de Crédito</h3></div>
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
                <button onClick={addCartao} className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md">Adicionar Cartão</button>
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
                  <div key={c.id} className="rounded-lg overflow-hidden" style={{ background: c.conta_vinculada ? "#059669" : "#333" }}>
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-white text-sm font-bold">{c.nome}</p>
                          <p className="text-[#BFDBFE] text-xs">{c.bandeira} · **** {c.final}</p>
                        </div>
                        <span className="text-white text-xs font-bold">{c.bandeira}</span>
                      </div>
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-[#BFDBFE] mb-1">
                          <span>Utilizado: {formatBRL(c.utilizado)}</span>
                          <span>Limite: {formatBRL(c.limite)}</span>
                        </div>
                        <div className="w-full h-2 bg-white/20 rounded-full">
                          <div className={`h-2 rounded-full transition-all ${pct > 80 ? "bg-[#ff6b6b]" : "bg-white"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                      <div className="flex gap-4 text-[10px] text-[#BFDBFE]">
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

        {/* ─── Configuracao de Taxas por Meio de Pagamento ─── */}
        <div className="border-t border-[#ccc] pt-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#1D2939]">Taxas por Meio de Pagamento</h2>
              <p className="text-xs text-[#777] mt-0.5">Configure taxas, parcelas e antecipacao por conta bancaria</p>
            </div>
            <button onClick={() => setShowTaxaSection(!showTaxaSection)}
              className="bg-[#059669] text-white text-sm font-bold px-4 py-2 rounded-md">
              {showTaxaSection ? "Fechar" : "Configurar Taxas"}
            </button>
          </div>

          {showTaxaSection && (
            <div className="space-y-4">
              {/* Select account */}
              <div className="flex flex-col gap-1 max-w-md">
                <label className={LB}>Conta Bancaria</label>
                <select value={taxaContaSelecionada} onChange={e => handleSelectContaTaxa(e.target.value)} className={IC}>
                  <option value="">Selecione uma conta...</option>
                  {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name} {a.banco ? `(${a.banco})` : ""}</option>)}
                </select>
              </div>

              {taxaContaSelecionada && (
                <>
                  {/* Existing configs */}
                  {loadingTaxas ? (
                    <div className="text-center py-6 text-sm text-[#555]">Carregando configuracoes...</div>
                  ) : taxas.length === 0 && !showTaxaForm ? (
                    <div className="bg-[#FFF0EB] border border-[#e6c200] border-l-4 border-l-[#EA580C] rounded-md px-4 py-3 text-sm text-[#EA580C]">
                      Nenhuma taxa configurada para esta conta. Clique em "+ Nova Taxa" para configurar.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {taxas.map(t => (
                        <div key={t.id} className={`border rounded-lg overflow-hidden ${t.ativo ? "border-[#ccc]" : "border-[#eee] opacity-60"}`}>
                          <div className="bg-[#2A2724] px-4 py-2 flex items-center justify-between">
                            <span className="text-xs font-bold text-white uppercase tracking-widest">
                              {MEIO_LABEL[t.meio_pagamento] || t.meio_pagamento}
                            </span>
                            <div className="flex gap-1">
                              <button onClick={() => handleEditTaxa(t)} className="text-[#BFDBFE] hover:text-white text-xs px-1">✎</button>
                              <button onClick={() => handleDeleteTaxa(t.id!)} className="text-[#ff9999] hover:text-white text-xs px-1">✕</button>
                            </div>
                          </div>
                          <div className="p-4 bg-white space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-[10px] font-bold text-[#777] uppercase">Taxa</span>
                                <p className="font-semibold text-[#1D2939]">{t.taxa_percentual}%</p>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-[#777] uppercase">Max Parcelas</span>
                                <p className="font-semibold text-[#1D2939]">{t.max_parcelas}x</p>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-[#777] uppercase">Prazo Recebimento</span>
                                <p className="font-semibold text-[#1D2939]">D+{t.dias_recebimento}</p>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-[#777] uppercase">Antecipacao</span>
                                <p className={`font-semibold ${t.antecipacao_ativa ? "text-[#039855]" : "text-[#777]"}`}>
                                  {t.antecipacao_ativa ? `Sim (${t.taxa_antecipacao}% a.m.)` : "Nao"}
                                </p>
                              </div>
                            </div>
                            {!t.ativo && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#ccc] bg-[#F6F2EB] text-[#777]">Inativo</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add / Edit form */}
                  <div className="flex gap-2">
                    {!showTaxaForm && (
                      <button onClick={() => { resetTaxaForm(taxaContaSelecionada); setShowTaxaForm(true); }}
                        className="bg-[#059669] text-white text-sm font-bold px-4 py-2 rounded-md">
                        + Nova Taxa
                      </button>
                    )}
                  </div>

                  {showTaxaForm && (
                    <div className="border border-[#ccc] rounded-lg overflow-hidden">
                      <div className="bg-[#059669] px-4 py-2.5">
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest">
                          {editingTaxaId ? "Editar Configuracao de Taxa" : "Nova Configuracao de Taxa"}
                        </h3>
                      </div>
                      <div className="p-5 bg-white space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className={LB}>Meio de Pagamento <span className="text-[#E53E3E]">*</span></label>
                            <select value={taxaForm.meio_pagamento} onChange={e => setTx("meio_pagamento", e.target.value)}
                              className={IC} disabled={!!editingTaxaId}>
                              {MEIOS_PAGAMENTO.map(m => (
                                <option key={m.value} value={m.value}
                                  disabled={!editingTaxaId && taxas.some(t => t.meio_pagamento === m.value)}>
                                  {m.label} {!editingTaxaId && taxas.some(t => t.meio_pagamento === m.value) ? "(ja configurado)" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LB}>Taxa (%) <span className="text-[#E53E3E]">*</span></label>
                            <input type="number" step="0.01" min="0" max="100"
                              value={taxaForm.taxa_percentual}
                              onChange={e => setTx("taxa_percentual", parseFloat(e.target.value) || 0)}
                              className={IC} placeholder="Ex: 4.99" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LB}>Max Parcelas</label>
                            <input type="number" min="1" max="24"
                              value={taxaForm.max_parcelas}
                              onChange={e => setTx("max_parcelas", parseInt(e.target.value) || 1)}
                              className={IC} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className={LB}>Dias para Recebimento (D+N)</label>
                            <input type="number" min="0" max="365"
                              value={taxaForm.dias_recebimento}
                              onChange={e => setTx("dias_recebimento", parseInt(e.target.value) || 0)}
                              className={IC} placeholder="Ex: 30" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LB}>Antecipacao</label>
                            <label className="flex items-center gap-2 cursor-pointer mt-1">
                              <input type="checkbox" checked={taxaForm.antecipacao_ativa}
                                onChange={e => setTx("antecipacao_ativa", e.target.checked)}
                                className="w-4 h-4 accent-[#059669]" />
                              <span className="text-sm text-[#1D2939]">Ativa</span>
                            </label>
                          </div>
                          {taxaForm.antecipacao_ativa && (
                            <div className="flex flex-col gap-1">
                              <label className={LB}>Taxa Antecipacao (% a.m.)</label>
                              <input type="number" step="0.01" min="0" max="100"
                                value={taxaForm.taxa_antecipacao}
                                onChange={e => setTx("taxa_antecipacao", parseFloat(e.target.value) || 0)}
                                className={IC} placeholder="Ex: 1.99" />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={taxaForm.ativo}
                              onChange={e => setTx("ativo", e.target.checked)}
                              className="w-4 h-4 accent-[#059669]" />
                            <span className="text-sm text-[#1D2939]">Configuracao ativa</span>
                          </label>
                        </div>
                        {/* Info box */}
                        <div className="bg-[#ECFDF4] border border-[#059669]/20 rounded-md px-4 py-2.5 text-xs text-[#333] space-y-1">
                          <p><strong>Como funciona:</strong></p>
                          <p>- <strong>Taxa:</strong> percentual descontado do valor bruto da venda pela operadora</p>
                          <p>- <strong>Max Parcelas:</strong> limite de parcelamento aceito nesta conta</p>
                          <p>- <strong>D+N:</strong> dias apos a venda para receber (ex: credito = D+30, debito = D+1)</p>
                          <p>- <strong>Antecipacao:</strong> se ativa, recebe tudo de uma vez com taxa extra; se nao, recebe parcela a parcela</p>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={handleSaveTaxa} disabled={savingTaxa}
                            className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                            {savingTaxa ? "Salvando..." : editingTaxaId ? "Salvar" : "Cadastrar"}
                          </button>
                          <button onClick={() => { setShowTaxaForm(false); setEditingTaxaId(null); }}
                            className="bg-white text-[#1D2939] border border-[#ccc] text-sm font-bold px-4 py-2 rounded-md">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
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
        className="w-full border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none"
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
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#ECFDF4] transition-colors ${value === val ? "bg-[#ECFDF4] font-semibold text-[#059669]" : "text-[#1D2939]"}`}
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
