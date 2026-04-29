import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import AbaBeneficios from "@/components/funcionarios/AbaBeneficios";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Employee {
  id: string; company_id: string;
  nome_completo?: string | null; name?: string | null;
  role: string | null; email: string | null; phone: string | null;
  cpf: string | null; rg: string | null; data_nascimento: string | null;
  hire_date: string | null; data_demissao: string | null;
  salary: number | null; salario_base: number | null;
  tipo_contrato: string | null; pis: string | null;
  ctps_numero: string | null; ctps_serie: string | null;
  banco_folha: string | null; agencia_folha: string | null;
  conta_folha: string | null; tipo_conta_folha: string | null;
  chave_pix_folha: string | null; centro_custo_id: string | null;
  status: string; created_at: string;
}

const getName = (e: Employee) => e.nome_completo || e.name || "";

const emptyForm = {
  name: "", role: "", email: "", phone: "",
  cpf: "", rg: "", data_nascimento: "",
  hire_date: "", data_demissao: "", salary: "", tipo_contrato: "clt",
  pis: "", ctps_numero: "", ctps_serie: "",
  banco_folha: "", agencia_folha: "", conta_folha: "", tipo_conta_folha: "", chave_pix_folha: "",
  centro_custo_id: "",
  status: "ativo",
};

const tipoContratoLabels: Record<string, string> = {
  clt: "CLT", pj: "PJ", autonomo: "Autônomo", estagio: "Estágio", temporario: "Temporário",
};

const BANCOS_BR = [
  "Banco do Brasil", "Bradesco", "Caixa Econômica Federal", "Itaú Unibanco",
  "Santander", "Nubank", "Inter", "C6 Bank", "BTG Pactual", "Safra",
  "Sicoob", "Sicredi", "Banrisul", "Original", "PagBank", "Mercado Pago",
  "Neon", "Next", "Picpay", "Stone", "Outro",
];

const INSS_2025 = [
  { min: 0, max: 1518.00, aliq: 0.075 },
  { min: 1518.01, max: 2793.88, aliq: 0.09 },
  { min: 2793.89, max: 4190.83, aliq: 0.12 },
  { min: 4190.84, max: 8157.41, aliq: 0.14 },
];
const IRRF_2025 = [
  { min: 0, max: 2259.20, aliq: 0, ded: 0 },
  { min: 2259.21, max: 2826.65, aliq: 0.075, ded: 169.44 },
  { min: 2826.66, max: 3751.05, aliq: 0.15, ded: 381.44 },
  { min: 3751.06, max: 4664.68, aliq: 0.225, ded: 662.77 },
  { min: 4664.69, max: Infinity, aliq: 0.275, ded: 896.00 },
];
const DEDUCAO_DEPENDENTE = 189.59;

const calcularINSS = (salario: number) => {
  let total = 0;
  for (const faixa of INSS_2025) {
    if (salario <= faixa.min) break;
    const base = Math.min(salario, faixa.max) - faixa.min;
    total += base * faixa.aliq;
    if (salario <= faixa.max) break;
  }
  return Math.round(total * 100) / 100;
};

const calcularIRRF = (salario: number, inss: number, dependentes: number) => {
  const base = salario - inss - (dependentes * DEDUCAO_DEPENDENTE);
  if (base <= 0) return 0;
  for (const faixa of IRRF_2025) {
    if (base <= faixa.max) return Math.max(0, Math.round((base * faixa.aliq - faixa.ded) * 100) / 100);
  }
  return 0;
};

// Formatters
const titleCase = (str: string) =>
  str.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0, 3) + "." + d.slice(3);
  if (d.length <= 9) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
  return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
};

const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? "(" + d : "";
  if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
};

const formatSalary = (v: string) => {
  const clean = v.replace(/[^\d,]/g, "");
  const parts = clean.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1] && parts[1].length > 2) return parts[0] + "," + parts[1].slice(0, 2);
  return clean;
};

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const IC = "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none w-full";
const ICE = "border border-[#c00] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-[#fff8f8] focus:border-[#c00] focus:outline-none w-full";
const LB = "text-[10px] font-bold uppercase tracking-wider text-[#1D2939]";
const REQ = <span className="text-[#E53E3E]">*</span>;

export default function Funcionarios() {
  const { activeClient, user } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("dados");
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [calcSalario, setCalcSalario] = useState(0);
  const [calcDependentes, setCalcDependentes] = useState(0);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const { data: centrosCusto = [] } = useQuery({
    queryKey: ["centros_custo", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("centros_custo").select("id, codigo, descricao").eq("company_id", selectedCompany.id).eq("ativo", true).order("codigo");
      if (error) throw error;
      return data as { id: string; codigo: string; descricao: string }[];
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: employees = [], isLoading, error: employeesError } = useQuery({
    queryKey: ["employees", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("employees").select("*").eq("company_id", selectedCompany.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!selectedCompany?.id,
  });

  const filtered = employees.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const n = getName(e).toLowerCase();
    return n.includes(q) || (e.role || "").toLowerCase().includes(q) || (e.cpf || "").includes(q);
  });

  const selected = employees.find(e => e.id === selectedId) || null;
  const set = (k: string, v: string) => {
    setFormData(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: false }));
  };

  const startEdit = (emp: Employee) => {
    setSelectedId(emp.id);
    setIsCreating(false);
    setErrors({});
    setFormData({
      name: getName(emp), role: emp.role || "",
      email: emp.email || "", phone: emp.phone || "",
      cpf: emp.cpf || "", rg: emp.rg || "", data_nascimento: emp.data_nascimento || "",
      hire_date: emp.hire_date || "", data_demissao: emp.data_demissao || "",
      salary: emp.salario_base ? String(emp.salario_base) : emp.salary ? String(emp.salary) : "",
      tipo_contrato: emp.tipo_contrato || "clt",
      pis: emp.pis || "", ctps_numero: emp.ctps_numero || "", ctps_serie: emp.ctps_serie || "",
      banco_folha: emp.banco_folha || "", agencia_folha: emp.agencia_folha || "",
      conta_folha: emp.conta_folha || "", tipo_conta_folha: emp.tipo_conta_folha || "",
      chave_pix_folha: emp.chave_pix_folha || "", centro_custo_id: emp.centro_custo_id || "",
      status: emp.status || "ativo",
    });
    setCalcSalario(emp.salario_base || emp.salary || 0);
    setTab("dados");
  };

  const startNew = () => { setSelectedId(null); setIsCreating(true); setFormData(emptyForm); setErrors({}); setTab("dados"); };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (formData.cpf.trim() && formData.cpf.replace(/\D/g, "").length < 11) errs.cpf = true;
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("CPF inválido");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!selectedCompany?.id) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const salarioVal = formData.salary ? parseFloat(formData.salary.replace(/\./g, "").replace(",", ".")) : null;
      const nameVal = titleCase(formData.name.trim());

      // Build payload dynamically — only include fields with values
      const payload: Record<string, any> = {
        company_id: selectedCompany.id,
        nome_completo: nameVal,
        name: nameVal,
      };

      if (formData.role) payload.role = titleCase(formData.role.trim());
      if (formData.email) payload.email = formData.email.trim().toLowerCase();
      if (formData.phone) payload.phone = formData.phone.trim();
      if (formData.cpf) payload.cpf = formData.cpf.trim();
      if (formData.data_nascimento) payload.data_nascimento = formData.data_nascimento;
      if (formData.hire_date) payload.hire_date = formData.hire_date;
      if (formData.data_demissao) payload.data_demissao = formData.data_demissao;
      if (salarioVal !== null) { payload.salary = salarioVal; payload.salario_base = salarioVal; }
      if (formData.tipo_contrato) payload.tipo_contrato = formData.tipo_contrato;
      if (formData.banco_folha) payload.banco_folha = formData.banco_folha;
      if (formData.agencia_folha) payload.agencia_folha = formData.agencia_folha.trim();
      if (formData.conta_folha) payload.conta_folha = formData.conta_folha.trim();
      if (formData.tipo_conta_folha) payload.tipo_conta_folha = formData.tipo_conta_folha;
      if (formData.chave_pix_folha) payload.chave_pix_folha = formData.chave_pix_folha.trim();
      if (formData.centro_custo_id) payload.centro_custo_id = formData.centro_custo_id;
      payload.status = (formData.status || "ativo").toLowerCase();

      console.log("Payload:", JSON.stringify(payload));

      const doSave = async (p: Record<string, any>) => {
        if (selectedId && !isCreating) {
          return await (activeClient as any).from("employees").update(p).eq("id", selectedId);
        }
        return await (activeClient as any).from("employees").insert(p);
      };

      let { error } = await doSave(payload);

      // Retry without 'nome_completo' if DB only has 'name'
      if (error && error.message?.includes("nome_completo")) {
        delete payload.nome_completo;
        ({ error } = await doSave(payload));
      }
      // Retry without 'name' if DB only has 'nome_completo'
      else if (error && error.message?.includes("column") && error.message?.includes("name")) {
        delete payload.name;
        payload.nome_completo = nameVal;
        ({ error } = await doSave(payload));
      }

      if (error) throw error;
      toast.success(selectedId && !isCreating ? "Funcionário atualizado" : "Funcionário cadastrado");
      if (isCreating) setIsCreating(false);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      toast.error("Erro: " + (err.message || err.details || err.hint || "Erro desconhecido"));
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (emp: Employee) => {
    const ok = await confirm({
      title: `Excluir "${getName(emp)}"?`,
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Sim, excluir",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const { error } = await (activeClient as any).from("employees").delete().eq("id", emp.id);
      if (error) throw error;
      toast.success("Excluído");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (selectedId === emp.id) { setSelectedId(null); setIsCreating(false); }
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  const inssCalc = useMemo(() => calcularINSS(calcSalario), [calcSalario]);
  const irrfCalc = useMemo(() => calcularIRRF(calcSalario, inssCalc, calcDependentes), [calcSalario, inssCalc, calcDependentes]);
  const fgts = Math.round(calcSalario * 0.08 * 100) / 100;
  const liquido = Math.round((calcSalario - inssCalc - irrfCalc) * 100) / 100;
  const inssPatronal = Math.round(calcSalario * 0.20 * 100) / 100;
  const custoTotal = Math.round((calcSalario + fgts + inssPatronal) * 100) / 100;

  const initials = (name: string) => (name || "?").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const showDetail = selected || isCreating;
  const ic = (field: string) => errors[field] ? ICE : IC;
  const statusLabel = (s: string) => {
    if (s === "active" || s === "ativo") return "Ativo";
    if (s === "inactive" || s === "inativo") return "Inativo";
    return s;
  };
  const isActive = (s: string) => s === "active" || s === "ativo";

  return (
    <AppLayout title="Funcionários">
      <div className="flex gap-4 h-[calc(100vh-120px)]">
        {/* LEFT: List */}
        <div className="w-1/3 min-w-[280px] border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
          <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-widest">Funcionários</h3>
            <button onClick={startNew} className="text-xs font-semibold text-white/80 hover:text-white">+ Novo</button>
          </div>
          <div className="p-3 border-b border-[#eee]">
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className={IC} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {employeesError ? <p className="text-center py-8 text-sm text-[#E53E3E]">Erro: {(employeesError as any).message || "Erro ao carregar"}</p> :
             isLoading ? <p className="text-center py-8 text-sm text-[#555]">Carregando...</p> :
             filtered.length === 0 ? <p className="text-center py-8 text-sm text-[#555]">Nenhum funcionário</p> :
             filtered.map(emp => (
              <div key={emp.id} onClick={() => startEdit(emp)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[#EAECF0] transition-all ${
                  selectedId === emp.id ? "bg-[#ECFDF4] border-l-2 border-l-[#059669]" : "hover:bg-[#F6F2EB]"
                }`}>
                <div className="w-9 h-9 rounded-full bg-[#0BE041] flex items-center justify-center text-[#064E3B] text-xs font-bold shrink-0">{initials(getName(emp))}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1D2939] truncate">{getName(emp)}</p>
                  <p className="text-[11px] text-[#555] truncate">{emp.role || "Sem cargo"} · {tipoContratoLabels[emp.tipo_contrato || ""] || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-[#1D2939]">{formatBRL(emp.salario_base || emp.salary || 0)}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isActive(emp.status) ? "bg-[#ECFDF3] text-[#039855]" : "bg-[#EAECF0] text-[#555]"
                  }`}>{statusLabel(emp.status)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail */}
        <div className="flex-1 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
          {!showDetail ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[#555]">Selecione um funcionário ou clique em "+ Novo"</div>
          ) : (
            <>
              <div className="bg-[#0BE041] px-4 py-2 flex items-center gap-1">
                {[{ id: "dados", label: "Dados Cadastrais" }, { id: "salarios", label: "Histórico de Salários" },
                  { id: "comissoes", label: "Comissões" }, { id: "calculadora", label: "Calculadora" }, { id: "beneficios", label: "Benefícios" }].map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-all ${
                      tab === t.id ? "bg-white text-[#064E3B]" : "text-[#064E3B] hover:bg-white/30"
                    }`}>{t.label}</button>
                ))}
                {selected && <button onClick={() => handleDelete(selected)} className="ml-auto text-[10px] font-bold text-[#991B1B] hover:bg-white/30 rounded px-2 py-1">Excluir</button>}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {tab === "dados" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-[2fr_1fr_1fr] gap-4">
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Nome Completo {REQ}</label>
                        <input value={formData.name} onChange={e => set("name", titleCase(e.target.value))} className={ic("name")} placeholder="Nome Sobrenome" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>CPF</label>
                        <input value={formData.cpf} onChange={e => set("cpf", formatCPF(e.target.value))} className={ic("cpf")} placeholder="000.000.000-00" maxLength={14} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Data de Nascimento</label>
                        <input type="date" value={formData.data_nascimento} onChange={e => set("data_nascimento", e.target.value)} className={ic("data_nascimento")} />
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Cargo</label>
                        <input value={formData.role} onChange={e => set("role", titleCase(e.target.value))} className={ic("role")} placeholder="Ex: Vendedora" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Tipo Contrato</label>
                        <select value={formData.tipo_contrato} onChange={e => set("tipo_contrato", e.target.value)} className={ic("tipo_contrato")}>
                          <option value="">Selecione</option>
                          <option value="clt">CLT</option><option value="pj">PJ</option><option value="autonomo">Autônomo</option><option value="estagio">Estágio</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Centro de Custo</label>
                        <select value={formData.centro_custo_id} onChange={e => set("centro_custo_id", e.target.value)} className={ic("centro_custo_id")}>
                          <option value="">Selecione</option>
                          {centrosCusto.map((c: any) => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.descricao}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Data Admissão</label>
                        <input type="date" value={formData.hire_date} onChange={e => set("hire_date", e.target.value)} className={ic("hire_date")} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Salário Base (R$)</label>
                        <input value={formData.salary} onChange={e => set("salary", formatSalary(e.target.value))} className={ic("salary")} placeholder="0,00" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Email</label>
                        <input type="email" value={formData.email} onChange={e => set("email", e.target.value)} className={IC} placeholder="email@exemplo.com" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Telefone</label>
                        <input value={formData.phone} onChange={e => set("phone", formatPhone(e.target.value))} className={IC} placeholder="(00) 00000-0000" maxLength={15} />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Banco</label>
                        <select value={formData.banco_folha} onChange={e => set("banco_folha", e.target.value)} className={ic("banco_folha")}>
                          <option value="">Selecione</option>
                          {BANCOS_BR.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Agência</label>
                        <input value={formData.agencia_folha} onChange={e => set("agencia_folha", onlyDigits(e.target.value))} className={ic("agencia_folha")} placeholder="0000" maxLength={6} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Conta</label>
                        <input value={formData.conta_folha} onChange={e => set("conta_folha", onlyDigits(e.target.value))} className={ic("conta_folha")} placeholder="00000000" maxLength={12} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Tipo de Conta</label>
                        <select value={formData.tipo_conta_folha} onChange={e => set("tipo_conta_folha", e.target.value)} className={ic("tipo_conta_folha")}>
                          <option value="">Selecione</option><option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="pix">PIX</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={LB}>Chave PIX</label>
                      <input value={formData.chave_pix_folha} onChange={e => set("chave_pix_folha", e.target.value)} className={IC} placeholder="CPF, email, telefone ou chave aleatória" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={LB}>Status</label>
                      <select value={formData.status} onChange={e => set("status", e.target.value)} className={`${IC} max-w-[200px]`}>
                        <option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="ferias">Férias</option><option value="afastado">Afastado</option><option value="demitido">Demitido</option>
                      </select>
                    </div>
                    <button onClick={handleSave} disabled={saving} className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                      {saving ? "Salvando..." : isCreating ? "Cadastrar" : "Salvar Alterações"}
                    </button>
                  </div>
                )}

                {tab === "salarios" && (
                  <div className="space-y-4">
                    <div className="border border-[#ccc] rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-[#F6F2EB]">
                          <tr><th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-[#555]">Vigência</th><th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-[#555]">Salário Base</th><th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-[#555]">Variação</th><th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-[#555]">Motivo</th></tr>
                        </thead>
                        <tbody>
                          {selected ? (
                            <tr className="border-t border-[#eee] font-bold">
                              <td className="px-4 py-2.5">{selected.hire_date ? new Date(selected.hire_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                              <td className="px-4 py-2.5">{formatBRL(selected.salario_base || selected.salary || 0)}</td>
                              <td className="px-4 py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ECFDF4] text-[#059669]">Atual</span></td>
                              <td className="px-4 py-2.5 text-[#555]">Admissão</td>
                            </tr>
                          ) : <tr><td colSpan={4} className="px-4 py-8 text-center text-[#555]">Selecione um funcionário</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[#555]">Histórico completo será carregado quando a tabela salary_history estiver disponível.</p>
                  </div>
                )}

                {tab === "comissoes" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      {["Jan/2026", "Fev/2026", "Mar/2026"].map((mes, i) => (
                        <div key={i} className="border border-[#ccc] rounded-lg overflow-hidden">
                          <div className="bg-[#059669] px-3 py-2"><span className="text-[10px] font-bold text-white uppercase tracking-wider">{mes}</span></div>
                          <div className="p-3 bg-white text-center">
                            <p className="text-lg font-bold text-[#1D2939]">R$ 0,00</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#ccc] bg-[#F6F2EB] text-[#555]">Sem lançamento</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-[#555]">Lançamento de comissões será habilitado quando as tabelas estiverem configuradas.</p>
                  </div>
                )}

                {tab === "calculadora" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1"><label className={LB}>Salário Base (R$)</label><input type="number" value={calcSalario || ""} onChange={e => setCalcSalario(Number(e.target.value))} className={IC} placeholder="0,00" /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>Dependentes</label>
                        <select value={calcDependentes} onChange={e => setCalcDependentes(Number(e.target.value))} className={IC}>
                          {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="border border-[#ccc] rounded-lg overflow-hidden">
                          <div className="bg-[#059669] px-3 py-2"><span className="text-[10px] font-bold text-white uppercase tracking-wider">INSS — Detalhamento por faixa</span></div>
                          <table className="w-full text-xs">
                            <thead className="bg-[#F6F2EB]"><tr><th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase text-[#555]">Faixa</th><th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase text-[#555]">Alíq.</th><th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase text-[#555]">Valor</th></tr></thead>
                            <tbody>
                              {INSS_2025.map((f, i) => {
                                if (calcSalario <= f.min) return null;
                                const base = Math.min(calcSalario, f.max) - f.min;
                                const val = Math.round(base * f.aliq * 100) / 100;
                                return (<tr key={i} className="border-t border-[#eee]"><td className="px-3 py-1.5">Até {formatBRL(f.max)}</td><td className="px-3 py-1.5">{(f.aliq * 100).toFixed(1)}%</td><td className="px-3 py-1.5 text-right font-semibold">{formatBRL(val)}</td></tr>);
                              })}
                              <tr className="border-t-2 border-[#059669] font-bold"><td className="px-3 py-2" colSpan={2}>Total INSS</td><td className="px-3 py-2 text-right">{formatBRL(inssCalc)}</td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="border border-[#ccc] rounded-lg overflow-hidden">
                          <div className="bg-[#059669] px-3 py-2"><span className="text-[10px] font-bold text-white uppercase tracking-wider">IRRF</span></div>
                          <div className="p-3 text-xs space-y-1">
                            <div className="flex justify-between"><span className="text-[#555]">Base de cálculo</span><span className="font-semibold">{formatBRL(Math.max(0, calcSalario - inssCalc - calcDependentes * DEDUCAO_DEPENDENTE))}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">Dedução dependentes ({calcDependentes})</span><span className="font-semibold">{formatBRL(calcDependentes * DEDUCAO_DEPENDENTE)}</span></div>
                            <div className="flex justify-between border-t border-[#eee] pt-1 font-bold"><span>IRRF</span><span>{formatBRL(irrfCalc)}</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="border-2 border-[#059669] rounded-lg p-5">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#059669] mb-4">Resumo do Colaborador</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-[#555]">Salário Bruto</span><span className="font-bold">{formatBRL(calcSalario)}</span></div>
                            <div className="flex justify-between text-[#E53E3E]"><span>(-) INSS</span><span>{formatBRL(inssCalc)}</span></div>
                            <div className="flex justify-between text-[#E53E3E]"><span>(-) IRRF</span><span>{formatBRL(irrfCalc)}</span></div>
                            <div className="flex justify-between border-t-2 border-[#059669] pt-2 mt-2">
                              <span className="font-bold text-[#039855] text-base">Líquido</span>
                              <span className="font-bold text-[#039855] text-base">{formatBRL(liquido)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="border border-[#ccc] rounded-lg p-5">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-4">Custo Empresa</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-[#555]">Salário</span><span>{formatBRL(calcSalario)}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">FGTS (8%)</span><span>{formatBRL(fgts)}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">INSS Patronal (20%)</span><span>{formatBRL(inssPatronal)}</span></div>
                            <div className="flex justify-between border-t border-[#eee] pt-2 font-bold"><span>Custo Total</span><span className="text-[#E53E3E]">{formatBRL(custoTotal)}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {tab === "beneficios" && selected && selectedCompany && (
                  <AbaBeneficios
                    companyId={selectedCompany.id}
                    employeeId={selected.id}
                    employeeNome={getName(selected)}
                    salarioBase={Number(selected.salario_base ?? selected.salary ?? 0)}
                    usuarioId={user?.id ?? ""}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
