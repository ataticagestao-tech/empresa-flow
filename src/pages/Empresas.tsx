import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompanies } from "@/hooks/useCompanies";
import { Company } from "@/types/company";
import { maskCNPJ } from "@/utils/masks";
import { useCompany } from "@/contexts/CompanyContext";
import { useNavigate, Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";

const STEPS = ["CNPJ", "Dados Gerais", "Regime Tributário", "Responsável", "Confirmar"];

const regimes = [
  { id: "simples_nacional", nome: "Simples Nacional", desc: "Faturamento até R$ 4,8M/ano" },
  { id: "lucro_presumido", nome: "Lucro Presumido", desc: "Faturamento até R$ 78M/ano" },
  { id: "lucro_real", nome: "Lucro Real", desc: "Obrigatório acima de R$ 78M" },
  { id: "mei", nome: "MEI", desc: "Faturamento até R$ 81K/ano" },
];

const emptyForm = {
  cnpj: "", razao_social: "", nome_fantasia: "", data_abertura: "",
  endereco_logradouro: "", endereco_numero: "", endereco_bairro: "",
  endereco_cidade: "", endereco_estado: "", endereco_cep: "",
  inscricao_municipal: "", inscricao_estadual: "", email: "", telefone: "",
  regime_tributario: "", responsavel_nome: "", responsavel_cpf: "",
  responsavel_email: "", responsavel_telefone: "",
};

export default function Empresas() {
  const { user, activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();
  const { companies, isLoading, error: companiesError, deleteCompany, refetch } = useCompanies(user?.id);

  const [mode, setMode] = useState<"list" | "create">("list");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  const [fetchingCnpj, setFetchingCnpj] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [companiesWithCharts, setCompaniesWithCharts] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Abre modo edição quando vem do resumo com state.editId
  useEffect(() => {
    const editId = (location.state as any)?.editId;
    if (editId && companies?.length) {
      const company = companies.find(c => c.id === editId);
      if (company) {
        handleEdit(company);
        // Limpa o state para não re-disparar
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, companies]);

  // Redireciona direto para resumo se tem empresa selecionada e não está criando/editando
  useEffect(() => {
    const editId = (location.state as any)?.editId;
    if (selectedCompany?.id && mode === "list" && !editingId && !editId) {
      navigate(`/empresas/${selectedCompany.id}`, { replace: true });
    }
  }, [selectedCompany?.id, mode, editingId, navigate, location.state]);

  useEffect(() => {
    if (!companies || companies.length === 0) return;
    const check = async () => {
      const ids = companies.map(c => c.id);
      const { data } = await activeClient.from("chart_of_accounts").select("company_id").in("company_id", ids);
      if (data) setCompaniesWithCharts(new Set(data.map((d: any) => d.company_id)));
    };
    check();
  }, [companies, activeClient]);

  const buscarCNPJ = async () => {
    const cnpjLimpo = form.cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) { toast.error("CNPJ inválido"); return; }
    setFetchingCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
      if (!res.ok) { toast.error("CNPJ não encontrado na Receita Federal"); return; }
      const d = await res.json();
      const filled = new Set<string>();
      const updates: any = {};
      if (d.razao_social) { updates.razao_social = d.razao_social; filled.add("razao_social"); }
      if (d.nome_fantasia) { updates.nome_fantasia = d.nome_fantasia; filled.add("nome_fantasia"); }
      if (d.data_inicio_atividade) { updates.data_abertura = d.data_inicio_atividade; filled.add("data_abertura"); }
      if (d.logradouro) { updates.endereco_logradouro = d.logradouro; filled.add("endereco_logradouro"); }
      if (d.numero) { updates.endereco_numero = d.numero; filled.add("endereco_numero"); }
      if (d.bairro) { updates.endereco_bairro = d.bairro; filled.add("endereco_bairro"); }
      if (d.municipio) { updates.endereco_cidade = d.municipio; filled.add("endereco_cidade"); }
      if (d.uf) { updates.endereco_estado = d.uf; filled.add("endereco_estado"); }
      if (d.cep) { updates.endereco_cep = d.cep; filled.add("endereco_cep"); }
      setForm(f => ({ ...f, ...updates }));
      setAutoFilled(filled);
      toast.success("Dados preenchidos via Receita Federal");
    } catch { toast.error("Erro ao consultar CNPJ"); }
    finally { setFetchingCnpj(false); }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        cnpj: form.cnpj.replace(/\D/g, ""),
        razao_social: form.razao_social,
        nome_fantasia: form.nome_fantasia || null,
        data_abertura: form.data_abertura || null,
        endereco_logradouro: form.endereco_logradouro || null,
        endereco_numero: form.endereco_numero || null,
        endereco_bairro: form.endereco_bairro || null,
        endereco_cidade: form.endereco_cidade || null,
        endereco_estado: form.endereco_estado || null,
        endereco_cep: form.endereco_cep || null,
        inscricao_municipal: form.inscricao_municipal || null,
        inscricao_estadual: form.inscricao_estadual || null,
        email: form.email || null,
        telefone: form.telefone || null,
        regime_tributario: form.regime_tributario || null,
        responsavel_nome: form.responsavel_nome || null,
        responsavel_cpf: form.responsavel_cpf || null,
        responsavel_email: form.responsavel_email || null,
        responsavel_telefone: form.responsavel_telefone || null,
        is_active: true,
      };

      if (editingId) {
        const { error } = await (activeClient as any).from("companies").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Empresa atualizada");
      } else {
        const { data: empresa, error } = await (activeClient as any)
          .from("companies").insert(payload).select().single();
        if (error) throw error;
        await (activeClient as any).from("user_companies").insert({ user_id: user.id, company_id: empresa.id });
        try {
          await (activeClient as any).rpc("copiar_plano_template", { p_company_id: empresa.id });
        } catch (e) {
          console.warn("Template copy failed:", e);
        }
        toast.success("Empresa criada com sucesso!");
      }
      refetch();
      setMode("list");
      setStep(0);
      setForm(emptyForm);
      setAutoFilled(new Set());
      setEditingId(null);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Erro desconhecido"));
    } finally { setSaving(false); }
  };

  const handleEdit = async (company: Company) => {
    setEditingId(company.id);
    const { data } = await (activeClient as any).from("companies").select("*").eq("id", company.id).single();
    if (data) {
      setForm({
        cnpj: data.cnpj || "", razao_social: data.razao_social || "",
        nome_fantasia: data.nome_fantasia || "", data_abertura: data.data_abertura || "",
        endereco_logradouro: data.endereco_logradouro || "",
        endereco_numero: data.endereco_numero || "",
        endereco_bairro: data.endereco_bairro || "",
        endereco_cidade: data.endereco_cidade || "",
        endereco_estado: data.endereco_estado || "",
        endereco_cep: data.endereco_cep || "",
        inscricao_municipal: data.inscricao_municipal || "",
        inscricao_estadual: data.inscricao_estadual || "",
        email: data.email || "", telefone: data.telefone || "",
        regime_tributario: data.regime_tributario || "",
        responsavel_nome: data.responsavel_nome || "",
        responsavel_cpf: data.responsavel_cpf || "",
        responsavel_email: data.responsavel_email || "",
        responsavel_telefone: data.responsavel_telefone || "",
      });
    }
    setStep(0);
    setMode("create");
  };

  const handleDelete = async (company: Company) => {
    if (!confirm(`Remover empresa ${company.razao_social}?`)) return;
    await deleteCompany(company.id);
  };

  const filtered = (companies || []).filter(c => {
    // Show only the selected company
    if (selectedCompany && c.id !== selectedCompany.id) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.razao_social?.toLowerCase().includes(q) || c.nome_fantasia?.toLowerCase().includes(q) ||
      c.cnpj?.includes(q) || c.endereco_cidade?.toLowerCase().includes(q);
  });

  const inputCls = (field?: string) =>
    `border rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:outline-none w-full ${
      field && autoFilled.has(field) ? "border-[#0a5c2e]" : "border-[#ccc] focus:border-[#1a2e4a]"
    }`;

  // ─── STEPPER WIZARD ───
  if (mode === "create") {
    return (
      <AppLayout title={editingId ? "Editar Empresa" : "Nova Empresa"}>
        <div className="max-w-3xl mx-auto py-6">
          <button onClick={() => { setMode("list"); setEditingId(null); setForm(emptyForm); setAutoFilled(new Set()); setStep(0); }}
            className="text-sm text-[#555] mb-6 hover:text-[#0a0a0a]">&larr; Voltar para lista</button>

          {/* Stepper */}
          <div className="flex items-center justify-center mb-8">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center">
                <button onClick={() => i <= step && setStep(i)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    i < step ? "bg-[#1a2e4a] border-[#1a2e4a] text-white" :
                    i === step ? "border-[#1a2e4a] text-[#1a2e4a] bg-white" :
                    "border-[#ccc] text-[#ccc] bg-white"
                  }`}>
                  {i < step ? "\u2713" : i + 1}
                </button>
                <span className={`text-[10px] font-bold uppercase tracking-wider ml-1 mr-3 hidden sm:inline ${
                  i <= step ? "text-[#1a2e4a]" : "text-[#ccc]"
                }`}>{s}</span>
                {i < STEPS.length - 1 && <div className={`w-8 h-0.5 mr-2 ${i < step ? "bg-[#1a2e4a]" : "bg-[#ccc]"}`} />}
              </div>
            ))}
          </div>

          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">Etapa {step + 1} — {STEPS[step]}</h3>
            </div>
            <div className="p-6 bg-white">

              {step === 0 && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">CNPJ <span className="text-[#8b0000]">*</span></label>
                    <div className="flex gap-2">
                      <input value={form.cnpj} onChange={e => set("cnpj", maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" className={inputCls()} />
                      <button onClick={buscarCNPJ} disabled={fetchingCnpj}
                        className="bg-[#1a2e4a] text-white text-sm font-bold px-4 py-2 rounded-md whitespace-nowrap disabled:opacity-50">
                        {fetchingCnpj ? "Buscando..." : "Consultar Receita"}
                      </button>
                    </div>
                  </div>
                  {autoFilled.size > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#0a5c2e] bg-[#e6f4ec] text-[#0a5c2e]">
                      ✓ Preenchido automaticamente via Receita Federal
                    </span>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Razão Social <span className="text-[#8b0000]">*</span></label>
                      <input value={form.razao_social} onChange={e => set("razao_social", e.target.value)} className={inputCls("razao_social")} />
                      {autoFilled.has("razao_social") && <span className="text-[9px] text-[#0a5c2e]">✓ Via Receita Federal</span>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Nome Fantasia</label>
                      <input value={form.nome_fantasia} onChange={e => set("nome_fantasia", e.target.value)} className={inputCls("nome_fantasia")} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Data de Abertura</label>
                      <input type="date" value={form.data_abertura} onChange={e => set("data_abertura", e.target.value)} className={inputCls("data_abertura")} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Email</label>
                      <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls()} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Telefone</label>
                      <input value={form.telefone} onChange={e => set("telefone", e.target.value)} className={inputCls()} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1 md:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Endereço</label>
                      <input value={form.endereco_logradouro} onChange={e => set("endereco_logradouro", e.target.value)} className={inputCls("endereco_logradouro")} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Número</label>
                      <input value={form.endereco_numero} onChange={e => set("endereco_numero", e.target.value)} className={inputCls("endereco_numero")} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Bairro</label>
                      <input value={form.endereco_bairro} onChange={e => set("endereco_bairro", e.target.value)} className={inputCls("endereco_bairro")} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Cidade</label>
                      <input value={form.endereco_cidade} onChange={e => set("endereco_cidade", e.target.value)} className={inputCls("endereco_cidade")} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Estado</label>
                      <input value={form.endereco_estado} onChange={e => set("endereco_estado", e.target.value)} className={inputCls("endereco_estado")} maxLength={2} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">CEP</label>
                      <input value={form.endereco_cep} onChange={e => set("endereco_cep", e.target.value)} className={inputCls("endereco_cep")} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Inscrição Municipal</label>
                      <input value={form.inscricao_municipal} onChange={e => set("inscricao_municipal", e.target.value)} className={inputCls()} placeholder="Preencher manualmente" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Inscrição Estadual</label>
                      <input value={form.inscricao_estadual} onChange={e => set("inscricao_estadual", e.target.value)} className={inputCls()} placeholder="Preencher manualmente" />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="bg-[#fffbe6] border border-[#e6c200] border-l-4 border-l-[#b8960a] rounded-md px-4 py-2.5 text-sm font-semibold text-[#5c3a00]">
                    O regime tributário define como os impostos são calculados, quais obrigações fiscais são geradas e como o DRE é estruturado. Verifique com o contador antes de confirmar.
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {regimes.map(r => (
                      <button key={r.id} onClick={() => set("regime_tributario", r.id)}
                        className={`text-left p-4 rounded-lg border-2 transition-all ${
                          form.regime_tributario === r.id ? "border-[#1a2e4a] bg-[#f0f4f8]" : "border-[#ccc] bg-white hover:border-[#999]"
                        }`}>
                        <p className="text-sm font-bold text-[#0a0a0a]">{r.nome}</p>
                        <p className="text-xs text-[#555] mt-1">{r.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Nome do Responsável</label>
                      <input value={form.responsavel_nome} onChange={e => set("responsavel_nome", e.target.value)} className={inputCls()} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">CPF</label>
                      <input value={form.responsavel_cpf} onChange={e => set("responsavel_cpf", e.target.value)} className={inputCls()} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Email</label>
                      <input type="email" value={form.responsavel_email} onChange={e => set("responsavel_email", e.target.value)} className={inputCls()} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]">Telefone</label>
                      <input value={form.responsavel_telefone} onChange={e => set("responsavel_telefone", e.target.value)} className={inputCls()} />
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <SummaryRow label="CNPJ" value={form.cnpj} />
                    <SummaryRow label="Razão Social" value={form.razao_social} />
                    <SummaryRow label="Nome Fantasia" value={form.nome_fantasia} />
                    <SummaryRow label="Regime" value={regimes.find(r => r.id === form.regime_tributario)?.nome || "—"} />
                    <SummaryRow label="Endereço" value={[form.endereco_logradouro, form.endereco_numero, form.endereco_bairro].filter(Boolean).join(", ")} />
                    <SummaryRow label="Cidade/UF" value={[form.endereco_cidade, form.endereco_estado].filter(Boolean).join(" — ")} />
                    <SummaryRow label="Responsável" value={form.responsavel_nome} />
                    <SummaryRow label="Email" value={form.email} />
                  </div>
                  {!editingId && (
                    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded border border-[#0a5c2e] bg-[#e6f4ec] text-[#0a5c2e]">
                      ✓ Plano de contas padrão Tática será aplicado automaticamente — 54 contas · 3 níveis
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={() => step > 0 ? setStep(step - 1) : setMode("list")}
              className="bg-white text-[#0a0a0a] border border-[#ccc] text-sm font-bold px-4 py-2 rounded-md">
              {step === 0 ? "Cancelar" : "Voltar"}
            </button>
            {step < 4 ? (
              <button onClick={() => setStep(step + 1)} disabled={step === 0 && !form.cnpj.replace(/\D/g, "")}
                className="bg-[#1a2e4a] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">Próximo</button>
            ) : (
              <button onClick={handleSave} disabled={saving || !form.razao_social}
                className="bg-[#1a2e4a] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Empresa"}
              </button>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ─── LIST MODE ───
  return (
    <AppLayout title="Empresas">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#0a0a0a]">Empresas</h2>
            <p className="text-sm text-[#555]">Gerencie suas unidades de negócio</p>
          </div>
          <button onClick={() => { setEditingId(null); setForm(emptyForm); setAutoFilled(new Set()); setStep(0); setMode("create"); }}
            className="bg-[#1a2e4a] text-white text-sm font-bold px-4 py-2 rounded-md">+ Nova Empresa</button>
        </div>

        {!selectedCompany && (
          <div className="flex flex-wrap items-center gap-3">
            <input type="text" placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)}
              className="border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:border-[#1a2e4a] focus:outline-none flex-1 min-w-[200px]" />
            <span className="text-[10px] font-bold px-3 py-1.5 rounded border border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]">{companies?.length || 0} empresas</span>
            <span className="text-[10px] font-bold px-3 py-1.5 rounded border border-[#0a5c2e] bg-[#e6f4ec] text-[#0a5c2e]">{companiesWithCharts.size} configuradas</span>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16 text-sm text-[#555]">Carregando empresas...</div>
        ) : companiesError ? (
          <div className="text-center py-16">
            <p className="text-sm text-[#0a0a0a] font-bold mb-2">Não foi possível carregar as empresas.</p>
            <button onClick={() => window.location.reload()} className="bg-white text-[#1a2e4a] border border-[#1a2e4a] text-sm font-bold px-4 py-2 rounded-md">Tentar novamente</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-[#0a0a0a] font-bold mb-2">{search ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}</p>
            {!search && <button onClick={() => setMode("create")} className="bg-[#1a2e4a] text-white text-sm font-bold px-4 py-2 rounded-md">Cadastrar Primeira Empresa</button>}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(company => {
              const hasChart = companiesWithCharts.has(company.id);
              return (
                <div key={company.id}
                  className={`border rounded-lg p-4 bg-white cursor-pointer transition-all hover:shadow-md border-l-4 border-[#ccc] ${hasChart ? "border-l-[#0a5c2e]" : "border-l-[#b8960a]"}`}
                  onClick={() => navigate(`/empresas/${company.id}`)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 ${hasChart ? "bg-[#0a5c2e]" : "bg-[#b8960a]"}`}>
                      {(company.razao_social || "E")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-[#0a0a0a] truncate">{company.razao_social}</h3>
                        {hasChart
                          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#0a5c2e] bg-[#e6f4ec] text-[#0a5c2e]">Configurado</span>
                          : <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#b8960a] bg-[#fffbe6] text-[#5c3a00]">Pendente</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#555]">
                        {company.cnpj && <span>{maskCNPJ(company.cnpj)}</span>}
                        {company.endereco_cidade && <span>{company.endereco_cidade}{company.endereco_estado ? ` — ${company.endereco_estado}` : ""}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={e => { e.stopPropagation(); handleEdit(company); }}
                        className="w-8 h-8 rounded flex items-center justify-center hover:bg-[#f0f4f8] text-[#1a2e4a] text-sm" title="Editar">✎</button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(company); }}
                        className="w-8 h-8 rounded flex items-center justify-center hover:bg-[#fdecea] text-[#8b0000] text-sm" title="Remover">✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#eee]">
      <span className="text-[#555] text-xs font-bold uppercase">{label}</span>
      <span className="text-[#0a0a0a]">{value || "—"}</span>
    </div>
  );
}
